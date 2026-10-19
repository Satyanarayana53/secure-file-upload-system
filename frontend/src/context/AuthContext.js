import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { logSecurityEvent } from '../utils/securityLogs';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const USER_CACHE_KEY = 'auth_user_cache_v1';

  const setAndCacheUser = (nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(nextUser));
    }
  };

  const hydrateUser = async (token, fallbackUser = null) => {
    try {
      const res = await api.get('/auth/me');
      const baseUser = res.data?.user || fallbackUser;
      if (!baseUser) {
        setAndCacheUser({ token });
        return;
      }

      setAndCacheUser({
        ...baseUser,
        token,
        profileImage: baseUser.profile_image || '',
      });
    } catch (err) {
      if (fallbackUser) {
        setAndCacheUser({
          ...fallbackUser,
          token,
          profileImage: fallbackUser.profile_image || '',
        });
      } else {
        const cachedUser = localStorage.getItem(USER_CACHE_KEY);
        if (cachedUser) {
          try {
            const parsed = JSON.parse(cachedUser);
            setUser({ ...parsed, token });
          } catch (e) {
            setAndCacheUser({ token });
          }
        } else {
          setAndCacheUser({ token });
        }
      }
    }
  };

  const refreshUser = async () => {
    const token = localStorage.getItem('token') || user?.token;
    if (!token) return null;

    try {
      const res = await api.get('/auth/me');
      const baseUser = res.data?.user;
      if (!baseUser) return null;

      const nextUser = {
        ...baseUser,
        token,
        profileImage: baseUser.profile_image || '',
      };
      setAndCacheUser(nextUser);
      return nextUser;
    } catch (err) {
      return null;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const init = async () => {
      if (token) {
        await hydrateUser(token);
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (identifier, password, rememberMe = false) => {
    const res = await api.post('/auth/login', { identifier, password, rememberMe });
    localStorage.setItem('token', res.data.token);
    await hydrateUser(res.data.token, res.data.user);
    logSecurityEvent('Login Success', `User ${identifier} signed in`, 'info');
  };

  const signup = async (username, email, password) => {
    const res = await api.post('/auth/signup', { username, email, password });
    logSecurityEvent('Signup Success', `New account created: ${email}`, 'info');
    return res.data;
  };

  const resendVerification = async (email) => {
    const res = await api.post('/auth/resend-verification', { email });
    logSecurityEvent('Resend Verification', `Verification request for ${email || 'current user'}`, 'info');
    return res.data;
  };

  const verifyEmail = async (token) => {
    const res = await api.post('/auth/verify-email', { token });
    logSecurityEvent('Email Verified', 'User email address verified', 'info');
    if (user) {
      await refreshUser();
    }
    return res.data;
  };

  const logout = async () => {
    const label = user?.email || user?.username || 'user';
    logSecurityEvent('Logout', `User ${label} signed out`, 'info');
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore network errors during logout
    }
    localStorage.removeItem('token');
    localStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
  };

  const updateProfileImage = async (imageDataUrl) => {
    let activeUser = user;
    if (!activeUser?.id) {
      activeUser = await refreshUser();
    }
    if (!activeUser?.id) {
      throw new Error('User details unavailable. Please login again.');
    }

    const res = await api.put('/auth/profile-image', { profileImage: imageDataUrl });
    const nextUser = {
      ...activeUser,
      ...res.data.user,
      profileImage: res.data.user?.profile_image || '',
    };
    setAndCacheUser(nextUser);
    logSecurityEvent('Profile Updated', 'Profile picture uploaded', 'info');
  };

  const removeProfileImage = async () => {
    let activeUser = user;
    if (!activeUser?.id) {
      activeUser = await refreshUser();
    }
    if (!activeUser?.id) {
      throw new Error('User details unavailable. Please login again.');
    }

    const res = await api.delete('/auth/profile-image');
    const nextUser = {
      ...activeUser,
      ...res.data.user,
      profileImage: '',
    };
    setAndCacheUser(nextUser);
    logSecurityEvent('Profile Updated', 'Profile picture removed', 'warning');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        loading,
        updateProfileImage,
        removeProfileImage,
        refreshUser,
        resendVerification,
        verifyEmail
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
