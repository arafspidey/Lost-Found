// Admin routes: reports, reported users, and restoring a flagged listing.
const test = require('node:test');
const assert = require('node:assert/strict');
const adminRouter = require('../admin');
const { withApp } = require('./support');

const ROLE = 'SELECT role FROM users';
const asAdmin = (rules = []) => [[ROLE, { role: 'admin' }], ...rules];

test('admin: a visitor gets 401', async () => {
  await withApp(adminRouter, { userId: undefined }, async ({ call }) => {
    assert.equal((await call('GET', '/admin/reports')).status, 401);
  });
});

test('admin: a normal user gets 403', async () => {
  await withApp(adminRouter, { userId: 2, rules: [[ROLE, { role: 'user' }]] }, async ({ call }) => {
    assert.equal((await call('GET', '/admin/reports')).status, 403);
    assert.equal((await call('GET', '/admin/users')).status, 403);
  });
});

test('admin: lists all reports', async () => {
  const reports = [{ id: 1, reason: 'No show', accused_name: 'Rina', accused_total_reports: 2 }];
  await withApp(adminRouter, { userId: 1, rules: asAdmin([['FROM reports r', reports]]) }, async ({ call }) => {
    const res = await call('GET', '/admin/reports');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, reports);
  });
});

test('admin: lists users who have been reported', async () => {
  const users = [{ id: 9, name: 'Rina', reports_against: 3 }];
  await withApp(adminRouter, { userId: 1, rules: asAdmin([['GROUP BY u.id', users]]) }, async ({ call }) => {
    const res = await call('GET', '/admin/users');
    assert.deepEqual(res.body, users);
  });
});

test('admin: restores a flagged listing', async () => {
  const rules = asAdmin([["UPDATE items SET status = 'available'", () => ({ changes: 1 })]]);
  await withApp(adminRouter, { userId: 1, rules }, async ({ call, mock }) => {
    const res = await call('POST', '/admin/items/5/restore');
    assert.equal(res.status, 200);
    const update = mock.calls.find((c) => c.sql.includes("SET status = 'available'"));
    assert.deepEqual(update.args, [5]);
  });
});

test('admin: restoring an item that is not flagged returns 404', async () => {
  const rules = asAdmin([["UPDATE items SET status = 'available'", () => ({ changes: 0 })]]);
  await withApp(adminRouter, { userId: 1, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/admin/items/5/restore')).status, 404);
  });
});
