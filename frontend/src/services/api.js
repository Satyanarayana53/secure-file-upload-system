import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

// Automatically add JWT token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.message || '';
    const token = localStorage.getItem('token');

    const isExpiredToken = status === 403 && message.toLowerCase().includes('invalid or expired token');
    const isUnauthorized = status === 401;

    if (token && (isExpiredToken || isUnauthorized)) {
      localStorage.removeItem('token');
      localStorage.removeItem('auth_user_cache_v1');

      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }

    return Promise.reject(error);
  },
);

export default api;
