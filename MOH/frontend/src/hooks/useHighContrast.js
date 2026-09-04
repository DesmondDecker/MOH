import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'moh_high_contrast';

/**
 * High-contrast "ward lighting" mode. Persisted per-device (localStorage,
 * not per-user account) deliberately — this is about the physical
 * environment a shared workstation sits in (a bright ward vs. a dim
 * office), not a personal account preference that should follow a staff
 * member between devices the way, say, their role does.
 */
export function useHighContrast() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-contrast', enabled ? 'high' : 'normal');
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // localStorage unavailable (private browsing, quota) — mode still
      // works for the current session, it just won't persist. Not worth
      // surfacing an error for a display preference.
    }
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return [enabled, toggle];
}
