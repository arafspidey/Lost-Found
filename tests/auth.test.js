// Auth routes: register, login, logout, and "who am I".
const test = require('node:test');
const assert = require('node:assert/strict');
const authRouter = require('../auth');
const { hashPassword } = require('../password');
const { withApp } = require('./support');

const good = { name: 'Md Alvi Araf', nid: '1234567890', phone: '01712345678', password: 'secret1' };

// ---------- Register ----------
const badInputs = [
  ['a name that is too short', { name: 'A' }, /full name/],
  ['an NID with the wrong length', { nid: '12345' }, /NID/],
  ['a phone number in the wrong format', { phone: '12345' }, /Phone/],
  ['a password that is too short', { password: '123' }, /Password/],
];
for (const [name, change, message] of badInputs) {
  test(`register: ${name} returns 400`, async () => {
    await withApp(authRouter, { userId: undefined }, async ({ call, mock }) => {
      const res = await call('POST', '/register', { ...good, ...change });
      assert.equal(res.status, 400);
      assert.match(res.body.error, message);
      assert.equal(mock.calls.some((c) => c.sql.includes('INSERT INTO users')), false);
    });
  });
}

test('register: a valid user is saved with a hashed password', async () => {
  const rules = [['INSERT INTO users', () => ({ lastInsertRowid: 7 })]];
  await withApp(authRouter, { userId: undefined, rules }, async ({ call, mock }) => {
    const res = await call('POST', '/register', good);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Registered', name: good.name });
    const insert = mock.calls.find((c) => c.sql.includes('INSERT INTO users'));
    assert.deepEqual(insert.args.slice(0, 3), [good.name, good.nid, good.phone]);
    assert.notEqual(insert.args[3], good.password);
    assert.match(insert.args[3], /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });
});

test('register: a duplicate NID or phone returns 409', async () => {
  const rules = [['INSERT INTO users', () => { throw new Error('UNIQUE constraint failed: users.nid'); }]];
  await withApp(authRouter, { userId: undefined, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/register', good)).status, 409);
  });
});

test('register: an unexpected database error returns 500', async () => {
  const rules = [['INSERT INTO users', () => { throw new Error('disk full'); }]];
  const original = console.error;
  console.error = () => {}; // keep the test output clean
  try {
    await withApp(authRouter, { userId: undefined, rules }, async ({ call }) => {
      assert.equal((await call('POST', '/register', good)).status, 500);
    });
  } finally {
    console.error = original;
  }
});

test('register: a session failure returns 500', async () => {
  await withApp(authRouter, { userId: undefined, regenerateError: new Error('x') }, async ({ call }) => {
    assert.equal((await call('POST', '/register', good)).status, 500);
  });
});

// ---------- Login ----------
const USER = 'SELECT * FROM users WHERE phone';

test('login: correct phone and password logs the user in', async () => {
  const user = { id: 7, name: good.name, password_hash: hashPassword(good.password) };
  await withApp(authRouter, { userId: undefined, rules: [[USER, user]] }, async ({ call }) => {
    const res = await call('POST', '/login', { phone: good.phone, password: good.password });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Logged in', name: good.name });
  });
});

test('login: a wrong password returns 401', async () => {
  const user = { id: 7, name: good.name, password_hash: hashPassword(good.password) };
  await withApp(authRouter, { userId: undefined, rules: [[USER, user]] }, async ({ call }) => {
    assert.equal((await call('POST', '/login', { phone: good.phone, password: 'wrong' })).status, 401);
  });
});

test('login: an unknown phone number returns 401', async () => {
  await withApp(authRouter, { userId: undefined, rules: [[USER, undefined]] }, async ({ call }) => {
    assert.equal((await call('POST', '/login', { phone: '01700000000', password: 'x' })).status, 401);
  });
});

// ---------- Logout and who-am-I ----------
test('logout: ends the session', async () => {
  await withApp(authRouter, { userId: 7 }, async ({ call }) => {
    const res = await call('POST', '/logout');
    assert.deepEqual(res.body, { message: 'Logged out' });
  });
});

test('me: visitors get null, not an error', async () => {
  await withApp(authRouter, { userId: undefined }, async ({ call }) => {
    const res = await call('GET', '/me');
    assert.equal(res.status, 200);
    assert.equal(res.body, null);
  });
});

test('me: a logged-in user gets their own details', async () => {
  const rules = [['SELECT id, name, phone, role FROM users', { id: 7, name: 'Araf', phone: '017', role: 'user' }]];
  await withApp(authRouter, { userId: 7, rules }, async ({ call }) => {
    const res = await call('GET', '/me');
    assert.equal(res.body.name, 'Araf');
  });
});

test('me: a session for a deleted user gets null', async () => {
  const rules = [['SELECT id, name, phone, role FROM users', undefined]];
  await withApp(authRouter, { userId: 99, rules }, async ({ call }) => {
    assert.equal((await call('GET', '/me')).body, null);
  });
});
