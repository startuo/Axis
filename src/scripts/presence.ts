import { API_ENABLED, apiUrl } from '../utils/api-config';

// A single timer survives Swup navigation; hidden tabs stop sending heartbeats.
if (API_ENABLED) {
  const heartbeat = () => {
    if (!document.hidden) void fetch(apiUrl('/dashboard/presence'), { method: 'POST' }).catch(() => {});
  };
  heartbeat();
  const timer = setInterval(heartbeat, 60000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
