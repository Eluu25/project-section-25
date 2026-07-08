import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import {
  persistAuthSession,
  clearAuthSession,
  restoreStoredSession,
  setRememberPreference
} from '../utils/authSession';

const AuthContext = createContext(null);
const ROLE_ALIASES = {
  head_ceo: 'ceo',
  chief_executive_officer: 'ceo',
  chiefexecutiveofficer: 'ceo',
  savings_staff: 'saving_staff'
};

const normalizeRole = (role) => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ROLE_ALIASES[normalized] || normalized;
};

const normalizeUser = (user) => {
  if (!user) return user;
  return {
    ...user,
    role: normalizeRole(user.role)
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const persistSession = useCallback((sessionUser, token) => {
    const normalizedUser = normalizeUser(sessionUser);
    setUser(normalizedUser);
    setIsAuthenticated(true);
    persistAuthSession(normalizedUser, token);
  }, []);

  // Restore user session on app load
  useEffect(() => {
    const stored = restoreStoredSession();
    if (stored?.user) {
      setUser(normalizeUser(stored.user));
      setIsAuthenticated(true);
    }
  }, []);

  const login = async (username, password, rememberMe = false) => {
    try {
      setRememberPreference(Boolean(rememberMe));
      const data = await api.login(username, password, rememberMe);

      // api.login will throw on non-OK responses; if we get here it's a successful login or a 2FA response
      if (data?.requiresTwoFactor) {
        return {
          success: false,
          requiresTwoFactor: true,
          twoFactorMode: data.twoFactorMode,
          challengeToken: data.challengeToken,
          setupToken: data.setupToken,
          setup: data.setup
        };
      }

      persistSession(data.user, data.token);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error?.message || 'Login failed' };
    }
  };

  const verifyTwoFactor = async (challengeToken, token, rememberMe = false) => {
    try {
      setRememberPreference(Boolean(rememberMe));
      const data = await api.twoFactorVerify(challengeToken, token, rememberMe);
      persistSession(data.user, data.token);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('2FA verification error:', error);
      return { success: false, error: error?.message || 'Two-factor verification failed' };
    }
  };

  const completeTwoFactorSetup = async (setupToken, token, rememberMe = false) => {
    try {
      setRememberPreference(Boolean(rememberMe));
      const data = await api.twoFactorSetupVerify(setupToken, token, rememberMe);
      persistSession(data.user, data.token);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('2FA setup error:', error);
      return { success: false, error: error?.message || 'Two-factor setup failed' };
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      clearAuthSession();
      localStorage.removeItem('remember_me');
    }
  };

  const checkAuth = useCallback(() => {
    const stored = restoreStoredSession();
    if (stored?.user) {
      setUser(normalizeUser(stored.user));
      setIsAuthenticated(true);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, login, logout, checkAuth, verifyTwoFactor, completeTwoFactorSetup }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
