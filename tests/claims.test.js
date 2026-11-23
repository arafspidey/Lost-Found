// Tests for the claim approval route. Express is real; the database is a mock that records SQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../db');
const claimsRouter = require('../claims');

// Start a small app where the logged-in user is set by the test.
function startApp(userId) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { userId }; next(); });
  app.use('/api', claimsRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

// Replace database methods with a mock. Returns the list of SQL statements run.
function mockDatabase(claimRow) {
  const sql = [];
  const originals = { prepare: db.prepare, tx: db.tx };
  db.prepare = (statement) => {
    sql.push(statement);
    return { get: () => claimRow, run: () => ({ changes: 1 }) };
  };
  db.tx = (fn) => fn(); // run without a real transaction
  return {
    sql,
    restore() { db.prepare = originals.prepare; db.tx = originals.tx; },
  };
}

test('finder approves a pending claim: item becomes claimed and others rejected', async () => {
  const mock = mockDatabase({
    id: 10, item_id: 4, claimant_id: 9, status: 'pending', finder_id: 1, item_status: 'available',
  });
  const server = await startApp(1);
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/claims/10/approve`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.ok(mock.sql.some((s) => s.includes("SET status = 'approved'")));
    assert.ok(mock.sql.some((s) => s.includes("SET status = 'claimed'")));
    assert.ok(mock.sql.some((s) => s.includes("SET status = 'rejected'")));
  } finally {
    server.close();
    mock.restore();
  }
});

test('a user who is not the finder cannot approve (403)', async () => {
  const mock = mockDatabase({
    id: 10, item_id: 4, claimant_id: 9, status: 'pending', finder_id: 1, item_status: 'available',
  });
  const server = await startApp(77); // someone else
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/claims/10/approve`, { method: 'POST' });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    mock.restore();
  }
});

test('an already approved claim cannot be approved again (409)', async () => {
  const mock = mockDatabase({
    id: 10, item_id: 4, claimant_id: 9, status: 'approved', finder_id: 1, item_status: 'claimed',
  });
  const server = await startApp(1);
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/claims/10/approve`, { method: 'POST' });
    assert.equal(res.status, 409);
  } finally {
    server.close();
    mock.restore();
  }
});

test('approving a missing claim returns 404', async () => {
  const mock = mockDatabase(undefined);
  const server = await startApp(1);
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/claims/99/approve`, { method: 'POST' });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    mock.restore();
  }
});
