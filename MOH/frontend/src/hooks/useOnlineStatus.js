import { useEffect, useState } from 'react';

/**
 * Tracks browser-level connectivity (navigator.onLine + online/offline
 * events). This is distinct from the Socket.io "Live" indicator: that
 * reflects whether the real-time push channel is connected, this reflects
 * whether the device has a network path at all — the thing that actually
 * matters for "can I reach the server for REST calls right now".
 */
function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

export { useOnlineStatus };
