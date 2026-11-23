// Register, login, logout, and "who am I".
const express = require('express');
const db = require('./db');
const { hashPassword, checkPassword } = require('./password');
const { rateLimit } = require('./middleware');

const router = express.Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const NID_PATTERN = /^(\d{10}|\d{13}|\d{17})$/; // Bangladesh NID lengths
const PHONE_PATTERN = /^01[3-9]\d{8}$/; // 01XXXXXXXXX

// Replaces the session on login (prevents session fixation) and replies.
function startSession(req, res, userId, payload) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start session' });
    req.session.userId = userId;
    res.json(payload);
  });
}

router.post('/register', authLimit, (req, res) => {
  const name = String(req.body.name || '').trim();
  const nid = String(req.body.nid || '').trim();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: 'Enter your full name' });
  }
  if (!NID_PATTERN.test(nid)) {
    return res.status(400).json({ error: 'NID must be 10, 13 or 17 digits' });
  }
  if (!PHONE_PATTERN.test(phone)) {
    return res.status(400).json({ error: 'Phone must look like 01XXXXXXXXX' });
  }
  if (password.length < 6 || password.length > 100) {
    return res.status(400).json({ error: 'Password must be 6-100 characters' });
  }

  try {
    const result = db
      .prepare('INSERT INTO users (name, nid, phone, password_hash) VALUES (?, ?, ?, ?)')
      .run(name, nid, phone, hashPassword(password));
    startSession(req, res, Number(result.lastInsertRowid), { message: 'Registered', name });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'This NID or phone is already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/login', authLimit, (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong phone or password' });
  }
  startSession(req, res, user.id, { message: 'Logged in', name: user.name });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

// Replies with the logged-in user, or null for visitors (not an error, so the
// browser console stays clean on every page load).
router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = db
    .prepare('SELECT id, name, phone, role FROM users WHERE id = ?')
    .get(req.session.userId);
  res.json(user || null);
});

module.exports = router;
