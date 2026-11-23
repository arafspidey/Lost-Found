// Passwords are never stored as plain text, only as a salted hash.
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(attempt, Buffer.from(hash, 'hex'));
}

module.exports = { hashPassword, checkPassword };
