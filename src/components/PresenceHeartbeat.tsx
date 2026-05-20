import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { authorizedFetch, getApiBaseUrl } from '../services/api';

export default function PresenceHeartbeat() {
  const { currentUser } = useAppStore();

  useEffect(() => {
    if (!currentUser) return;

    const baseUrl = getApiBaseUrl();

    const sendHeartbeat = async () => {
      try {
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
      const url = `${baseUrl}/api/me/presence/offline`;
      
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
