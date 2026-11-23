// Usage: node make-admin.js 01XXXXXXXXX
// Turns an already-registered user into an admin.
const db = require('./db');

const phone = process.argv[2];
if (!phone) {
  console.log('Usage: node make-admin.js 01XXXXXXXXX');
  process.exit(1);
}
const result = db.prepare("UPDATE users SET role = 'admin' WHERE phone = ?").run(phone);
console.log(result.changes ? `${phone} is now an admin.` : 'No user with that phone. Register first.');
