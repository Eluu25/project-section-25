const REMEMBER_KEY = 'remember_me';
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

const getStorage = () => {
  if (typeof window === 'undefined') return localStorage;
  const remember = localStorage.getItem(REMEMBER_KEY) === 'true';
  return remember ? localStorage : window.sessionStorage;
};

export const setRememberPreference = (remember) => {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, 'true');
  } else {
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

export const getRememberPreference = () => localStorage.getItem(REMEMBER_KEY) === 'true';

export const persistAuthSession = (user, token) => {
  const storage = getStorage();
  storage.setItem(USER_KEY, JSON.stringify(user));
  storage.setItem(TOKEN_KEY, token);
};

export const clearAuthSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
};

export const getAuthToken = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);

export const getStoredUser = () => {
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const restoreStoredSession = () => {
  const user = getStoredUser();
  const token = getAuthToken();
  if (!user || !token) return null;
  return { user, token };
};
