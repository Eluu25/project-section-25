/**
 * Allowed browser origins for CORS and Socket.IO.
 * Set FRONTEND_URL (required in production) and optional ALLOWED_ORIGINS (comma-separated).
 */
const getAllowedOrigins = () => {
  const origins = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ]);

  const add = (value) => {
    const trimmed = String(value || '').trim().replace(/\/$/, '');
    if (trimmed) origins.add(trimmed);
  };

  add(process.env.FRONTEND_URL);

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach((entry) => add(entry));
  }

  return [...origins];
};

const corsOriginDelegate = (origin, callback) => {
  const allowed = getAllowedOrigins();
  if (!origin) {
    return callback(null, true);
  }
  const normalized = origin.replace(/\/$/, '');
  if (allowed.includes(normalized)) {
    return callback(null, true);
  }
  if (process.env.NODE_ENV !== 'production') {
    return callback(null, true);
  }
  console.warn('[CORS] Blocked origin:', origin);
  return callback(new Error('Not allowed by CORS'));
};

module.exports = {
  getAllowedOrigins,
  corsOriginDelegate
};
