// Unit tests for middleware.js. The database is replaced with a mock so no real file is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const { requireLogin, requireAdmin, rateLimit } = require('../middleware');

// Fake request/response objects that record what the middleware did.
function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

test('requireLogin blocks users without a session', () => {
  const res = fakeRes();
  let called = false;
  requireLogin({ session: {} }, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('requireLogin lets logged-in users through', () => {
  const res = fakeRes();
  let called = false;
  requireLogin({ session: { userId: 5 } }, res, () => { called = true; });
  assert.equal(called, true);
});

test('requireAdmin blocks non-admin users with 403 (database mocked)', () => {
  const original = db.prepare;
  db.prepare = () => ({ get: () => ({ role: 'user' }) }); // mock database
  try {
    const res = fakeRes();
    let called = false;
    requireAdmin({ session: { userId: 2 } }, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  } finally {
    db.prepare = original;
  }
});

test('requireAdmin lets admins through (database mocked)', () => {
  const original = db.prepare;
  db.prepare = () => ({ get: () => ({ role: 'admin' }) });
  try {
    let called = false;
    requireAdmin({ session: { userId: 1 } }, fakeRes(), () => { called = true; });
    assert.equal(called, true);
  } finally {
    db.prepare = original;
  }
});

test('requireAdmin returns 401 when not logged in', () => {
  const res = fakeRes();
  requireAdmin({ session: {} }, res, () => assert.fail('should not run'));
  assert.equal(res.statusCode, 401);
});

test('rateLimit allows up to max requests then returns 429', () => {
  const limit = rateLimit({ windowMs: 60000, max: 2 });
  const req = { ip: '1.2.3.4' };
  const codes = [];
  for (let i = 0; i < 3; i++) {
    const res = fakeRes();
    let passed = false;
    limit(req, res, () => { passed = true; });
    codes.push(passed ? 'next' : res.statusCode);
  }
  assert.deepEqual(codes, ['next', 'next', 429]);
});
