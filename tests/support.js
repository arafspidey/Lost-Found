// Shared test tools: a mock database and a small Express app for route tests.
const express = require('express');
const db = require('../db');

// Replaces db.prepare and db.tx with fakes. rules = [[sqlFragment, valueOrFunction], ...].
// The first rule whose fragment appears in the SQL answers the call. Every call is recorded.
function installMockDb(rules = []) {
  const calls = [];
  const original = { prepare: db.prepare, tx: db.tx };

  function answer(sql, method, args) {
    calls.push({ sql, method, args });
    for (const [fragment, value] of rules) {
      if (sql.includes(fragment)) return typeof value === 'function' ? value(args, method) : value;
    }
    if (method === 'run') return { changes: 1, lastInsertRowid: 1 };
    if (method === 'all') return [];
    return undefined;
  }

  db.prepare = (sql) => ({
    get: (...args) => answer(sql, 'get', args),
    all: (...args) => answer(sql, 'all', args),
    run: (...args) => answer(sql, 'run', args),
  });
  db.tx = (fn) => fn();

  return {
    calls,
    restore() { db.prepare = original.prepare; db.tx = original.tx; },
  };
}

// Starts a throw-away app with a fake session, then runs the test body.
async function withApp(router, { userId, rules = [], regenerateError = null }, body) {
  const mock = installMockDb(rules);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = {
      userId,
      regenerate(cb) { cb(regenerateError); },
      destroy(cb) { cb(); },
    };
    next();
  });
  app.use('/api', router);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, path, payload) {
    const res = await fetch(base + path, {
      method,
      headers: payload ? { 'Content-Type': 'application/json' } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, body: json };
  }

  try {
    await body({ call, base, mock });
  } finally {
    server.closeAllConnections();
    server.close();
    mock.restore();
  }
}

// True if a write (run) containing this SQL text happened.
function ran(mock, text) {
  return mock.calls.some((c) => c.method === 'run' && c.sql.includes(text));
}

module.exports = { withApp, installMockDb, ran };
