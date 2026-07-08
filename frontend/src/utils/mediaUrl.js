const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

const getBackendOrigin = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return API_BASE.replace(/\/api\/?$/, '') || window.location.origin;
  }
  const proxy = import.meta.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000';
  return proxy.replace(/\/$/, '');
};

/** Resolve uploaded file paths (e.g. /uploads/...) to a full backend URL. */
export function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendOrigin()}${normalized}`;
}

export default resolveMediaUrl;
