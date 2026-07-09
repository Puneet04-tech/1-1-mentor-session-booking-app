import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse, User, Session, Message, MessageAttachment, RecurringSeries, RecurrenceFrequency } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// The backend serves uploaded files (e.g. chat attachments) from its own
// origin under /uploads, not under /api — strip the /api suffix to get there.
export const SERVER_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export function resolveServerUrl(relativeUrl: string): string {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  return `${SERVER_ORIGIN}${relativeUrl}`;
}

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response.data,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  // Auth endpoints
  async signup(data: {
    email: string;
    password: string;
    name: string;
    role: 'mentor' | 'student' | 'admin';
  }): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.client.post('/auth/signup', data);
  }

  async login(
    email: string,
    password: string
  ): Promise<ApiResponse<{ user?: User; token?: string; twoFactorRequired?: boolean; pendingToken?: string }>> {
    return this.client.post('/auth/login', { email, password });
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.client.get('/auth/me');
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.client.post('/auth/logout');
  }

  // Two-Factor Authentication (2FA) endpoints — issue #138
  async get2FAStatus(): Promise<ApiResponse<{ enabled: boolean }>> {
    return this.client.get('/auth/2fa/status');
  }

  async setup2FA(): Promise<ApiResponse<{ secret: string; otpauthUrl: string; qrCode: string }>> {
    return this.client.post('/auth/2fa/setup');
  }

  async enable2FA(token: string): Promise<ApiResponse<{ backupCodes: string[] }>> {
    return this.client.post('/auth/2fa/enable', { token });
  }

  /** Second login step: exchange a pending token + TOTP/backup code for a session. */
  async verify2FA(
    pendingToken: string,
    code: { token?: string; backupCode?: string }
  ): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.client.post('/auth/2fa/verify', { pendingToken, ...code });
  }

  async disable2FA(
    password: string,
    code: { token?: string; backupCode?: string }
  ): Promise<ApiResponse<void>> {
    return this.client.post('/auth/2fa/disable', { password, ...code });
  }

  // Session endpoints
  async createSession(data: Partial<Session>): Promise<ApiResponse<Session>> {
    return this.client.post('/sessions', data);
  }

  // Recurring session endpoints
  async createRecurringSeries(data: {
    title: string;
    description?: string;
    topic?: string;
    scheduled_at: string;
    duration_minutes?: number;
    language?: string;
    code_language?: string;
    recording_enabled?: boolean;
    frequency: RecurrenceFrequency;
    occurrences: number;
  }): Promise<ApiResponse<{ series: RecurringSeries; sessions: Session[]; skipped: string[] }>> {
    return this.client.post('/recurring-sessions', data);
  }

  async getRecurringSeries(id: string): Promise<ApiResponse<{ series: RecurringSeries; sessions: Session[] }>> {
    return this.client.get(`/recurring-sessions/${id}`);
  }

  async cancelRecurringSeries(id: string, reason?: string): Promise<ApiResponse<any>> {
    return this.client.post(`/recurring-sessions/${id}/cancel`, { reason });
  }

  async getSession(id: string): Promise<ApiResponse<Session>> {
    return this.client.get(`/sessions/${id}`);
  }

  async joinSession(id: string): Promise<ApiResponse<Session>> {
    return this.client.post(`/sessions/${id}/join`);
  }

  async endSession(id: string): Promise<ApiResponse<Session>> {
    return this.client.post(`/sessions/${id}/end`);
  }

  async cancelSession(
    id: string,
    reason?: string
  ): Promise<ApiResponse<{ sessionId: string; status: string; cancelledBy: string; cancelledAt: string }>> {
    return this.client.post(`/sessions/${id}/cancel`, { reason });
  }

  async rescheduleSession(id: string, newScheduledAt: string): Promise<ApiResponse<Session>> {
    return this.client.post(`/sessions/${id}/reschedule`, { newScheduledAt });
  }

  async getActiveSessions(): Promise<ApiResponse<Session[]>> {
    return this.client.get('/sessions/active');
  }

  async getAvailableSessions(): Promise<ApiResponse<Session[]>> {
    return this.client.get('/sessions/available');
  }

  async getUserSessions(): Promise<ApiResponse<Session[]>> {
    return this.client.get('/sessions/user');
  }

  // User endpoints
  async getUser(id: string): Promise<ApiResponse<User>> {
    return this.client.get(`/users/${id}`);
  }

  async getMentors(): Promise<ApiResponse<User[]>> {
    return this.client.get('/users/mentors');
  }

  async getStudents(): Promise<ApiResponse<User[]>> {
    return this.client.get('/users/students');
  }

  // Favorite / bookmark mentors (issue #166) — students only
  async getFavorites(): Promise<ApiResponse<User[]>> {
    return this.client.get('/favorites');
  }

  async getFavoriteIds(): Promise<ApiResponse<string[]>> {
    return this.client.get('/favorites/ids');
  }

  async addFavorite(mentorId: string): Promise<ApiResponse<{ id: string; mentor_id: string }>> {
    return this.client.post('/favorites', { mentor_id: mentorId });
  }

  async removeFavorite(mentorId: string): Promise<ApiResponse<{ mentor_id: string }>> {
    return this.client.delete(`/favorites/${mentorId}`);
  }

  // Message endpoints
  async getMessages(sessionId: string): Promise<ApiResponse<Message[]>> {
    return this.client.get(`/messages/${sessionId}`);
  }

  async sendMessage(
    sessionId: string,
    data: { content: string; type: string; attachment?: MessageAttachment }
  ): Promise<ApiResponse<Message>> {
    return this.client.post(`/messages/${sessionId}`, data);
  }

  async uploadChatFile(file: File): Promise<ApiResponse<MessageAttachment>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.client.post('/upload/chat', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  // Code endpoints
  async getCodeSnapshot(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/code/${sessionId}`);
  }

  async saveCodeSnapshot(sessionId: string, code: string, language: string): Promise<ApiResponse<any>> {
    return this.client.post(`/code/${sessionId}`, { code, language });
  }

  async getCodeRecordingHistory(sessionId: string): Promise<ApiResponse<{
    session: { id: string; title: string; code_language?: string; started_at?: string; ended_at?: string };
    events: { code: string; language: string; user_id: string; saved_at: string }[];
  }>> {
    return this.client.get(`/code/${sessionId}/history`);
  }

  // Code Execution
  async executeCode(code: string, language: string, sessionId?: string): Promise<ApiResponse<{ output: string; error?: string }>> {
    return this.client.post('/code/execute', { code, language, sessionId });
  }

  // Profile endpoints
  async getProfile(): Promise<ApiResponse<any>> {
    return this.client.get('/profile');
  }

  async updateProfile(data: { name?: string; bio?: string; avatar_url?: string; hourly_rate?: number; industry?: string; language?: string; skills?: any[]; email_notifications_enabled?: boolean }): Promise<ApiResponse<any>> {
    return this.client.put('/profile', data);
  }

  async getPublicProfile(userId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/profile/${userId}`);
  }

  async getAllMentors(params?: {
    search?: string;
    skills?: string;
    minRating?: number;
    maxPrice?: number;
    industry?: string;
    language?: string;
    sortBy?: 'rating' | 'most_booked' | 'newest';
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<any[]> & { pagination?: { page: number; limit: number; total: number; totalPages: number } }> {
    return this.client.get('/profile/mentors/all', { params });
  }

  async addSkill(skill: string): Promise<ApiResponse<any>> {
    return this.client.post('/profile/skills', { name: skill });
  }

  async removeSkill(skillId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/profile/skills/${skillId}`);
  }

  // Ratings endpoints
  async submitRating(sessionId: string, data: { rating: number; comment?: string }): Promise<ApiResponse<any>> {
    return this.client.post('/ratings', { session_id: sessionId, ...data });
  }

  async getRatings(userId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/ratings/user/${userId}`);
  }

  async getSessionRating(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/ratings/session/${sessionId}`);
  }

  async updateRating(ratingId: string, data: { rating?: number; comment?: string }): Promise<ApiResponse<any>> {
    return this.client.put(`/ratings/${ratingId}`, data);
  }

  async deleteRating(ratingId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/ratings/${ratingId}`);
  }

  // Session History endpoints
  async getSessionHistory(): Promise<ApiResponse<any[]>> {
    return this.client.get('/sessions/history/user/history');
  }

  async getMentorSessions(mentorId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/sessions/history/mentor/${mentorId}`);
  }

  // Downloads the authenticated user's session history as a CSV Blob.
  async exportSessionHistoryCsv(): Promise<Blob> {
    return this.client.get('/sessions/history/export/csv', { responseType: 'blob' });
  }

  async completeSession(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/sessions/history/${sessionId}/complete`);
  }

  async getSessionFeedback(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/sessions/history/${sessionId}/feedback`);
  }

  // Notifications endpoints
  async getNotifications(): Promise<ApiResponse<any[]>> {
    return this.client.get('/notifications');
  }

  async getUnreadNotificationCount(): Promise<ApiResponse<{ unread_count: number }>> {
    return this.client.get('/notifications/unread/count');
  }

  // Note: there is no client method to create notifications. Notifications are
  // created only by trusted server-side event handlers (see backend issue #142).

  async markNotificationAsRead(notificationId: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/notifications/${notificationId}/read`);
  }

  async markAllNotificationsAsRead(): Promise<ApiResponse<any>> {
    return this.client.put('/notifications/mark-all/read');
  }

  async deleteNotification(notificationId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/notifications/${notificationId}`);
  }

  // Search endpoints
  async searchMentors(query: string, filters?: { minRating?: number; skills?: string[] }): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ q: query });
    if (filters?.minRating) params.set('minRating', filters.minRating.toString());
    if (filters?.skills?.length) params.set('skills', filters.skills.join(','));
    return this.client.get(`/users/mentors?${params.toString()}`);
  }

  // Availability endpoints
  async getMentorAvailability(mentorId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/availability/mentor/${mentorId}`);
  }

  async setMentorAvailability(slots: any[]): Promise<ApiResponse<any>> {
    return this.client.post('/availability/mentor/slots', { slots });
  }

  async getAvailableSlots(mentorId: string, date: string): Promise<ApiResponse<any>> {
    return this.client.get(`/availability/available/${mentorId}?date=${date}`);
  }

  async getSessionCalendar(userId: string, startDate: string, endDate: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/availability/calendar/${userId}?startDate=${startDate}&endDate=${endDate}`);
  }

  // Payment endpoints
  async createPaymentIntent(sessionId: string, amount: number): Promise<ApiResponse<any>> {
    return this.client.post('/payments/create-payment-intent', { sessionId, amount });
  }

  async confirmPayment(paymentId: string): Promise<ApiResponse<any>> {
    return this.client.post('/payments/confirm', { paymentId });
  }

  async getPaymentHistory(): Promise<ApiResponse<any[]>> {
    return this.client.get('/payments/history');
  }

  async getEarnings(): Promise<ApiResponse<any>> {
    return this.client.get('/payments/earnings');
  }

  // Recording endpoints
  async startRecording(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.post('/recordings/start', { sessionId });
  }

  async stopRecording(recordingId: string): Promise<ApiResponse<any>> {
    return this.client.post(`/recordings/stop/${recordingId}`);
  }

  async getSessionRecordings(sessionId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/recordings/session/${sessionId}`);
  }

  async getRecordingUrl(recordingId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/recordings/${recordingId}`);
  }

  async deleteRecording(recordingId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/recordings/${recordingId}`);
  }

  // Admin endpoints
  async getAdminStats(): Promise<ApiResponse<any>> {
    return this.client.get('/admin/stats');
  }

  async getAdminUsers(query?: string, role?: string): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (role) params.set('role', role);
    return this.client.get(`/admin/users?${params.toString()}`);
  }

  async getAdminSessions(status?: string): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return this.client.get(`/admin/sessions?${params.toString()}`);
  }

  async suspendUser(userId: string, reason: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/admin/users/${userId}/suspend`, { isSuspended: true, reason });
  }

  async unsuspendUser(userId: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/admin/users/${userId}/suspend`, { isSuspended: false });
  }

  async getModerationQueue(): Promise<ApiResponse<any[]>> {
    return this.client.get('/admin/moderation/queue');
  }

  async flagSessionForReview(sessionId: string, reason: string): Promise<ApiResponse<any>> {
    return this.client.post(`/admin/moderation/flag/${sessionId}`, { reason });
  }

  async getReports(): Promise<ApiResponse<any[]>> {
    return this.client.get('/admin/reports');
  }

  async getMentorsForVerification(params?: { status?: 'pending' | 'verified' | 'all'; search?: string }): Promise<ApiResponse<any[]>> {
    return this.client.get('/admin/mentors/verification', { params });
  }

  async setMentorVerification(userId: string, verified: boolean, note?: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/admin/mentors/${userId}/verify`, { verified, note });
  }

  async getAuditLog(): Promise<ApiResponse<any[]>> {
    return this.client.get('/admin/audit-log');
  }

  // Video Conference endpoints
  async generateVideoCode(sessionId: string): Promise<ApiResponse<{ code: string }>> {
    return this.client.post(`/sessions/${sessionId}/video-code`, {});
  }

  async verifyVideoCode(sessionId: string, code: string): Promise<ApiResponse<any>> {
    return this.client.post(`/sessions/${sessionId}/verify-video-code`, { code });
  }

  // Analytics endpoints
  async getMentorAnalytics(): Promise<ApiResponse<any>> {
    return this.client.get('/analytics/mentor');
  }

  // Generic post method for other endpoints
  async post<T = any>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.client.post(endpoint, data);
  }
}

export const apiClient = new ApiClient();
