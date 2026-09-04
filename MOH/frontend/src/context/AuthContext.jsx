import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setTokens, loadTokensFromStorage, clearTokens, registerAuthExpiredHandler } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AuthContext = createContext(null);

const USER_STORAGE_KEY = 'moh_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    loadTokensFromStorage();
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    }
    setInitializing(false);

    registerAuthExpiredHandler(() => {
      setUser(null);
      localStorage.removeItem(USER_STORAGE_KEY);
    });
  }, []);

  // Socket.io connection lifecycle tracks auth state directly rather than
  // being threaded through login()/logout() — one place to reason about,
  // and it also covers the "already logged in on page reload" path.
  useEffect(() => {
    if (user) {
      connectSocket();
    } else {
      disconnectSocket();
    }
  }, [user]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/api/auth/login', { username, password }, { skipAuth: true });

    // Password-only success. 2FA branches (mfaRequired /
    // twoFactorSetupRequired) return no tokens at all — the caller
    // (LoginPage) is responsible for routing to the right next step and
    // must call completeSession() once a real token pair is issued.
    if (data.accessToken) {
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      setUser(data.user);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
    }

    return data;
  }, []);

  // Finalizes a session once real tokens exist — used both by the direct
  // login path above (indirectly) and by the 2FA verify-login / first-time
  // enrollment flows, which only obtain tokens after a second step.
  const completeSession = useCallback(({ accessToken, refreshToken, user: sessionUser }) => {
    setTokens({ accessToken, refreshToken });
    setUser(sessionUser);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(sessionUser));
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  }, []);

  const completePasswordChange = useCallback((updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
  }, []);

  return (
    <AuthContext.Provider value={{ user, initializing, login, completeSession, logout, completePasswordChange }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
