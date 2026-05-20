import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { authorizedFetch } from '../services/api';

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
        await authorizedFetch(`${baseUrl}/api/me/presence/heartbeat`, {
          method: 'POST',
          body: JSON.stringify({
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
        await authorizedFetch(`${baseUrl}/api/me/presence/offline`, {
          method: 'POST'
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
      // We attempt authorizedFetch with keepalive for reliability
      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/api/me/presence/offline`;
      
      // Need to get session synchronously or use a pre-fetched token if possible
      // But since initializedFetch is async, we'll just try our best here.
      // Alternatively, the backend could have a beacon-friendly endpoint that uses cookies if we used them.
      // For now, let's just stick to standard fetch.
      authorizedFetch(url, { 
        method: 'POST', 
        keepalive: true 
      });
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
