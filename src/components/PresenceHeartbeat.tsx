import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function PresenceHeartbeat() {
  const { currentUser } = useAppStore();

  useEffect(() => {
    if (!currentUser) return;

    const getApiBaseUrl = () => {
      const isDev = window.location.port === '3000';
      return isDev ? '' : window.location.origin;
    };

    const sendHeartbeat = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        await fetch(`${baseUrl}/api/me/presence/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: currentUser.id,
            user_name: currentUser.name || currentUser.email,
            user_email: currentUser.email,
            current_route: window.location.pathname
          })
        });
      } catch (err) {
        // Silent error
      }
    };

    const setOffline = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        await fetch(`${baseUrl}/api/me/presence/offline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id })
        });
      } catch (err) {
        // Silent error
      }
    };

    // Send immediately
    sendHeartbeat();

    // Interval every 30s
    const interval = setInterval(sendHeartbeat, 30000);

    // Handle beforeunload (tab close)
    const handleUnload = () => {
      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/api/me/presence/offline`;
      const data = JSON.stringify({ user_id: currentUser.id });
      
      // Use sendBeacon for reliability on close
      // Note: sendBeacon only supports string or Blob
      navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      setOffline();
    };
  }, [currentUser]);

  return null;
}
