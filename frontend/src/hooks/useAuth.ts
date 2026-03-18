import { useAuthStore } from '@/store';
import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api';
import { socketService } from '@/services/socket';
import { User, AuthCredentials, SignupData } from '@/types';

export function useAuth() {
  const { user, token, setUser, setToken, setLoading, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const response = await apiClient.getCurrentUser();
      if (response.data) {
        setUser(response.data as User);
      }
    } catch (err) {
      console.error('Error getting current user:', err);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: AuthCredentials) => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await apiClient.login(credentials.email, credentials.password);
      
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
      const errorMessage = err.response?.data?.error?.message || 'Login failed';
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
    isAuthenticated: !!user,
    login,
    signup,
    logout: handleLogout,
  };
}
