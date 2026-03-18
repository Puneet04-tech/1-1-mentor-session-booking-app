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
    role: 'mentor' | 'student';
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

  async getUserSessions(): Promise<ApiResponse<Session[]>> {
    return this.client.get('/api/sessions/user');
  }

  // User endpoints
  async getUser(id: string): Promise<ApiResponse<User>> {
    return this.client.get(`/api/users/${id}`);
  }

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    return this.client.put('/api/users/profile', data);
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
  async executeCode(code: string, language: string): Promise<ApiResponse<{ output: string; error?: string }>> {
    return this.client.post('/api/code/execute', { code, language });
  }
}

export const apiClient = new ApiClient();
