/**
 * Socket.IO must reach the API server, not the Vite dev server (port 3000).
 */
export function getSocketBaseUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL.replace(/\/$/, '');
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '');
  }
  const proxy = import.meta.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000';
  return proxy.replace(/\/$/, '');
}

export default getSocketBaseUrl;
