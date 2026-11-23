// Entry point: sets up middleware, mounts the routes, starts the server.
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('./db');

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Basic security headers. Scripts and styles may only come from this site.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'",
  });
  next();
});

app.use(express.json({ limit: '50kb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', require('./auth'));
app.use('/api', require('./items'));
app.use('/api', require('./claims'));
app.use('/api', require('./admin'));

// Anything under /api that did not match a route above.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Last-resort error handler (bad JSON, unexpected crashes).
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
