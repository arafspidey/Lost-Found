// Small helpers that run before route handlers.
const db = require('./db');

// Blocks the request unless the user is logged in.
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in first' });
  }
  next();
}

// Blocks the request unless the logged-in user is an admin.
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in first' });
  }
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}

// Allows at most `max` requests per IP in `windowMs` (slows down password guessing).
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  };
}

module.exports = { requireLogin, requireAdmin, rateLimit };
