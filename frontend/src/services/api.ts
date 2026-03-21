import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse, User, Session, Message } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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
    return this.client.post('/api/auth/signup', data);
  }

  async login(email: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.client.post('/api/auth/login', { email, password });
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.client.get('/api/auth/me');
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/logout');
  }

  // Session endpoints
  async createSession(data: Partial<Session>): Promise<ApiResponse<Session>> {
    return this.client.post('/api/sessions', data);
  }

  async getSession(id: string): Promise<ApiResponse<Session>> {
    return this.client.get(`/api/sessions/${id}`);
  }

  async joinSession(id: string): Promise<ApiResponse<Session>> {
    return this.client.post(`/api/sessions/${id}/join`);
  }

  async endSession(id: string): Promise<ApiResponse<Session>> {
    return this.client.post(`/api/sessions/${id}/end`);
  }

  async getActiveSessions(): Promise<ApiResponse<Session[]>> {
    return this.client.get('/api/sessions/active');
  }

  async getAvailableSessions(): Promise<ApiResponse<Session[]>> {
    return this.client.get('/api/sessions/available');
  }

  async getUserSessions(): Promise<ApiResponse<Session[]>> {
    return this.client.get('/api/sessions/user');
  }

  // User endpoints
  async getUser(id: string): Promise<ApiResponse<User>> {
    return this.client.get(`/api/users/${id}`);
  }

  async getMentors(): Promise<ApiResponse<User[]>> {
    return this.client.get('/api/users/mentors');
  }

  async getStudents(): Promise<ApiResponse<User[]>> {
    return this.client.get('/api/users/students');
  }

  // Message endpoints
  async getMessages(sessionId: string): Promise<ApiResponse<Message[]>> {
    return this.client.get(`/api/messages/${sessionId}`);
  }

  async sendMessage(
    sessionId: string,
    data: { content: string; type: string }
  ): Promise<ApiResponse<Message>> {
    return this.client.post(`/api/messages/${sessionId}`, data);
  }

  // Code endpoints
  async getCodeSnapshot(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/api/code/${sessionId}`);
  }

  async saveCodeSnapshot(sessionId: string, code: string, language: string): Promise<ApiResponse<any>> {
    return this.client.post(`/api/code/${sessionId}`, { code, language });
  }

  // Code Execution
  async executeCode(code: string, language: string, sessionId?: string): Promise<ApiResponse<{ output: string; error?: string }>> {
    return this.client.post('/api/code/execute', { code, language, sessionId });
  }

  // Profile endpoints
  async getProfile(): Promise<ApiResponse<any>> {
    return this.client.get('/api/profile');
  }

  async updateProfile(data: { bio?: string; avatar_url?: string; skills?: string[] }): Promise<ApiResponse<any>> {
    return this.client.put('/api/profile', data);
  }

  async getPublicProfile(userId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/api/profile/${userId}`);
  }

  async addSkill(skill: string): Promise<ApiResponse<any>> {
    return this.client.post('/api/profile/skills', { name: skill });
  }

  async removeSkill(skillId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/api/profile/skills/${skillId}`);
  }

  // Ratings endpoints
  async submitRating(sessionId: string, data: { rating: number; comment?: string }): Promise<ApiResponse<any>> {
    return this.client.post('/api/ratings', { session_id: sessionId, ...data });
  }

  async getRatings(userId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/api/ratings/user/${userId}`);
  }

  async getSessionRating(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/api/ratings/session/${sessionId}`);
  }

  async updateRating(ratingId: string, data: { rating?: number; comment?: string }): Promise<ApiResponse<any>> {
    return this.client.put(`/api/ratings/${ratingId}`, data);
  }

  async deleteRating(ratingId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/api/ratings/${ratingId}`);
  }

  // Session History endpoints
  async getSessionHistory(): Promise<ApiResponse<any[]>> {
    return this.client.get('/api/sessions/history');
  }

  async getMentorSessions(mentorId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/api/sessions/history/mentor/${mentorId}`);
  }

  async completeSession(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/api/sessions/history/${sessionId}/complete`);
  }

  async getSessionFeedback(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/api/sessions/history/${sessionId}/feedback`);
  }

  // Notifications endpoints
  async getNotifications(): Promise<ApiResponse<any[]>> {
    return this.client.get('/api/notifications');
  }

  async createNotification(data: { user_id: string; type: string; title: string; message: string }): Promise<ApiResponse<any>> {
    return this.client.post('/api/notifications', data);
  }

  async markNotificationAsRead(notificationId: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/api/notifications/${notificationId}/read`);
  }

  async deleteNotification(notificationId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/api/notifications/${notificationId}`);
  }

  // Search endpoints
  async searchMentors(query: string, filters?: { minRating?: number; skills?: string[] }): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ q: query });
    if (filters?.minRating) params.set('minRating', filters.minRating.toString());
    if (filters?.skills?.length) params.set('skills', filters.skills.join(','));
    return this.client.get(`/api/users/mentors?${params.toString()}`);
  }

  // Availability endpoints
  async getMentorAvailability(mentorId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/api/availability/mentor/${mentorId}`);
  }

  async setMentorAvailability(slots: any[]): Promise<ApiResponse<any>> {
    return this.client.post('/api/availability/mentor/slots', { slots });
  }

  async getAvailableSlots(mentorId: string, date: string): Promise<ApiResponse<any>> {
    return this.client.get(`/api/availability/available/${mentorId}?date=${date}`);
  }

  async getSessionCalendar(userId: string, startDate: string, endDate: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/api/availability/calendar/${userId}?startDate=${startDate}&endDate=${endDate}`);
  }

  // Payment endpoints
  async createPaymentIntent(sessionId: string, amount: number): Promise<ApiResponse<any>> {
    return this.client.post('/api/payments/create-payment-intent', { sessionId, amount });
  }

  async confirmPayment(paymentId: string): Promise<ApiResponse<any>> {
    return this.client.post('/api/payments/confirm', { paymentId });
  }

  async getPaymentHistory(): Promise<ApiResponse<any[]>> {
    return this.client.get('/api/payments/history');
  }

  async getEarnings(): Promise<ApiResponse<any>> {
    return this.client.get('/api/payments/earnings');
  }

  // Recording endpoints
  async startRecording(sessionId: string): Promise<ApiResponse<any>> {
    return this.client.post('/api/recordings/start', { sessionId });
  }

  async stopRecording(recordingId: string): Promise<ApiResponse<any>> {
    return this.client.post(`/api/recordings/stop/${recordingId}`);
  }

  async getSessionRecordings(sessionId: string): Promise<ApiResponse<any[]>> {
    return this.client.get(`/api/recordings/session/${sessionId}`);
  }

  async getRecordingUrl(recordingId: string): Promise<ApiResponse<any>> {
    return this.client.get(`/api/recordings/${recordingId}`);
  }

  async deleteRecording(recordingId: string): Promise<ApiResponse<any>> {
    return this.client.delete(`/api/recordings/${recordingId}`);
  }

  // Admin endpoints
  async getAdminStats(): Promise<ApiResponse<any>> {
    return this.client.get('/api/admin/stats');
  }

  async getAdminUsers(query?: string, role?: string): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (role) params.set('role', role);
    return this.client.get(`/api/admin/users?${params.toString()}`);
  }

  async suspendUser(userId: string, reason: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/api/admin/users/${userId}/suspend`, { isSuspended: true, reason });
  }

  async unsuspendUser(userId: string): Promise<ApiResponse<any>> {
    return this.client.patch(`/api/admin/users/${userId}/suspend`, { isSuspended: false });
  }

  async getModerationQueue(): Promise<ApiResponse<any[]>> {
    return this.client.get('/api/admin/moderation/queue');
  }

  async flagSessionForReview(sessionId: string, reason: string): Promise<ApiResponse<any>> {
    return this.client.post(`/api/admin/moderation/flag/${sessionId}`, { reason });
  }

  async getReports(): Promise<ApiResponse<any[]>> {
    return this.client.get('/api/admin/reports');
  }

  // Video Conference endpoints
  async generateVideoCode(sessionId: string): Promise<ApiResponse<{ code: string }>> {
    return this.client.post(`/api/sessions/${sessionId}/video-code`, {});
  }

  async verifyVideoCode(sessionId: string, code: string): Promise<ApiResponse<any>> {
    return this.client.post(`/api/sessions/${sessionId}/verify-video-code`, { code });
  }

  // Generic post method for other endpoints
  async post<T = any>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.client.post(endpoint, data);
  }
}

export const apiClient = new ApiClient();
