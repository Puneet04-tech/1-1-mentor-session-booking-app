import { useAuthStore } from '@/store';
import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api';
import { socketService } from '@/services/socket';
import { User, AuthCredentials, SignupData } from '@/types';

export function useAuth() {
  const { user, token, setUser, setToken, setLoading, logout } = useAuthStore();
  // If a token is stashed in localStorage but the store hasn't hydrated a
  // user yet, we're about to verify that session — start "loading" so
  // consumers (e.g. the protected-route guard) don't treat this render's
  // default not-authenticated state as a real logged-out state and redirect
  // before the verification request has even gone out.
  const [isLoading, setIsLoading] = useState(
    () => typeof window !== 'undefined' && !!localStorage.getItem('auth_token') && !user
  );
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken && !user) {
      apiClient.setToken(storedToken);
      setToken(storedToken);
      getCurrentUser();
    }
  }, []);

  const getCurrentUser = async () => {
    try {
      setIsLoading(true);
      setSessionError(null);
      const response = await apiClient.getCurrentUser();
      if (response.data) {
        setUser(response.data as User);
      }
    } catch (err: any) {
      console.error('Error getting current user:', err);
      // Only a confirmed-invalid token (401) should log the user out — a
      // network error or 5xx here just means we couldn't verify the
      // existing session, not that it's invalid, so keep it intact and let
      // the caller offer a retry instead of bouncing to /login.
      if (err.response?.status === 401) {
        logout();
      } else {
        setSessionError(err.response?.data?.error || err.message || 'Failed to verify your session');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /** Finalise a session once we have a real user + full JWT. */
  const establishSession = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('auth_token', authToken);
    apiClient.setToken(authToken);
    // Connect socket
    socketService.connect(authToken);
  };

  /**
   * Attempt login. Returns `{ twoFactorRequired: true, pendingToken }` when the
   * account has 2FA enabled — the caller must then collect a code and call
   * `verifyTwoFactor`. Otherwise the session is established and it resolves
   * with `{ twoFactorRequired: false }`.
   */
  const login = async (
    credentials: AuthCredentials
  ): Promise<{ twoFactorRequired: boolean; pendingToken?: string }> => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await apiClient.login(credentials.email, credentials.password);

      if (response.data?.twoFactorRequired && response.data.pendingToken) {
        return { twoFactorRequired: true, pendingToken: response.data.pendingToken };
      }

      if (response.data?.user && response.data.token) {
        establishSession(response.data.user, response.data.token);
      }
      return { twoFactorRequired: false };
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message || err.response?.data?.error || 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /** Second login step: exchange the pending token + code for a full session. */
  const verifyTwoFactor = async (
    pendingToken: string,
    code: { token?: string; backupCode?: string }
  ) => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await apiClient.verify2FA(pendingToken, code);
      if (response.data?.user && response.data.token) {
        establishSession(response.data.user, response.data.token);
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message || err.response?.data?.error || 'Verification failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (data: SignupData) => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await apiClient.signup(data);
      
      if (response.data) {
        const { user: userData, token: authToken } = response.data;
        setUser(userData);
        setToken(authToken);
        localStorage.setItem('auth_token', authToken);
        apiClient.setToken(authToken);
        
        // Connect socket
        socketService.connect(authToken);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || 'Signup failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('auth_token');
      apiClient.clearToken();
      socketService.disconnect();
      logout();
    }
  };

  return {
    user,
    token,
    isLoading,
    error,
    sessionError,
    retrySession: getCurrentUser,
    isAuthenticated: !!user,
    login,
    verifyTwoFactor,
    signup,
    logout: handleLogout,
  };
}
