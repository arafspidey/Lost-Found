// Usage: node seed.js
// Adds demo users and items so the site is not empty. Safe to run more than once.
const db = require('./db');
const { hashPassword } = require('./password');

const addUser = db.prepare(
  'INSERT OR IGNORE INTO users (name, nid, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)'
);
addUser.run('Demo Admin', '1000000001', '01700000000', hashPassword('admin123'), 'admin');
addUser.run('Rahim Uddin', '1000000002', '01711111111', hashPassword('demo123'), 'user');
addUser.run('Karim Hossain', '1000000003', '01722222222', hashPassword('demo123'), 'user');

const itemCount = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
if (itemCount === 0) {
  const finder = db.prepare('SELECT id FROM users WHERE phone = ?').get('01711111111').id;
  const area = (name) => db.prepare('SELECT id FROM areas WHERE name = ?').get(name).id;
  const addItem = db.prepare(
    `INSERT INTO items (finder_id, category, description, area_id, secret_question, secret_answer)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  addItem.run(finder, 'Phone', 'Black Samsung phone with a cracked screen, found near the bus stand.',
    area('Kazla'), 'What is the lock screen wallpaper?', 'A mountain with snow');
  addItem.run(finder, 'Wallet', 'Brown leather wallet with some cards inside, found at the tea stall.',
    area('Saheb Bazar'), 'Which cards are inside the wallet?', 'Dutch Bangla debit card, student ID');
  addItem.run(finder, 'Keys', 'Bunch of three keys with a red keychain, found on the footpath.',
    area('Kazla'), 'What shape is the keychain charm?', 'Star');
}

console.log('Demo data ready.');
console.log('  Admin:  01700000000 / admin123');
console.log('  User 1: 01711111111 / demo123 (has posted items)');
console.log('  User 2: 01722222222 / demo123');
