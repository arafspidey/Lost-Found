// Claim routes: claiming, dashboards, approve, reject, handover, and no-show reports.
const test = require('node:test');
const assert = require('node:assert/strict');
const claimsRouter = require('../claims');
const { withApp, ran } = require('./support');

const claimRow = (over = {}) => ({
  id: 10, item_id: 4, claimant_id: 9, status: 'pending', finder_id: 1, item_status: 'available', ...over,
});
const LOAD = 'WHERE c.id = ?';
const ITEM_LOOKUP = 'SELECT finder_id, status FROM items';

// ---------- Making a claim ----------
test('claim: a visitor who is not logged in gets 401', async () => {
  await withApp(claimsRouter, { userId: undefined }, async ({ call }) => {
    assert.equal((await call('POST', '/items/4/claims', { answer: 'blue case' })).status, 401);
  });
});

test('claim: an unavailable item returns 404', async () => {
  await withApp(claimsRouter, { userId: 5, rules: [[ITEM_LOOKUP, undefined]] }, async ({ call }) => {
    assert.equal((await call('POST', '/items/4/claims', { answer: 'blue case' })).status, 404);
  });
});

test('claim: a finder cannot claim their own listing', async () => {
  const rules = [[ITEM_LOOKUP, { finder_id: 5, status: 'available' }]];
  await withApp(claimsRouter, { userId: 5, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/items/4/claims', { answer: 'blue case' })).status, 400);
  });
});

test('claim: an answer that is too short is rejected', async () => {
  const rules = [[ITEM_LOOKUP, { finder_id: 1, status: 'available' }]];
  await withApp(claimsRouter, { userId: 5, rules }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/items/4/claims', { answer: 'ab' })).status, 400);
    assert.equal(ran(mock, 'INSERT INTO claims'), false);
  });
});

test('claim: a valid claim is saved and returns 201', async () => {
  const rules = [[ITEM_LOOKUP, { finder_id: 1, status: 'available' }]];
  await withApp(claimsRouter, { userId: 5, rules }, async ({ call, mock }) => {
    const res = await call('POST', '/items/4/claims', { answer: 'blue case with sticker' });
    assert.equal(res.status, 201);
    const insert = mock.calls.find((c) => c.sql.includes('INSERT INTO claims'));
    assert.deepEqual(insert.args, [4, 5, 'blue case with sticker']);
  });
});

test('claim: claiming the same item twice returns 409', async () => {
  const rules = [
    [ITEM_LOOKUP, { finder_id: 1, status: 'available' }],
    ['INSERT INTO claims', () => { throw new Error('UNIQUE constraint failed: claims'); }],
  ];
  await withApp(claimsRouter, { userId: 5, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/items/4/claims', { answer: 'blue case' })).status, 409);
  });
});

// ---------- Dashboards ----------
test('finder dashboard: claimant phone is hidden until the claim is approved', async () => {
  const rules = [
    ['JOIN users u ON u.id = c.claimant_id', [
      { id: 1, answer: 'a', status: 'pending', created_at: 't', claimant_name: 'Rina', claimant_phone: '01711111111', reported_by_me: 0 },
      { id: 2, answer: 'b', status: 'approved', created_at: 't', claimant_name: 'Sumi', claimant_phone: '01822222222', reported_by_me: 1 },
    ]],
    ['i.secret_question', [
      { id: 4, category: 'Wallet', description: 'black wallet', photo: 'a.jpg', status: 'available',
        created_at: 't', secret_question: 'q?', secret_answer: 'notes', location: 'Kazla' },
    ]],
  ];
  await withApp(claimsRouter, { userId: 1, rules }, async ({ call }) => {
    const res = await call('GET', '/my/items');
    assert.equal(res.status, 200);
    assert.equal(res.body[0].photo_url, '/uploads/a.jpg');
    assert.equal(res.body[0].claims[0].claimant_phone, null);
    assert.equal(res.body[0].claims[1].claimant_phone, '01822222222');
    assert.equal(res.body[0].claims[1].reported_by_me, true);
  });
});

test('claimant dashboard: finder phone is hidden until the claim is approved', async () => {
  const base = { item_id: 4, category: 'Keys', description: 'd', item_status: 'available',
    location: 'Kazla', finder_name: 'Karim', finder_phone: '01733333333', created_at: 't' };
  const rules = [['JOIN users f ON f.id = i.finder_id', [
    { ...base, id: 3, status: 'pending', photo: null, reported_by_me: 0 },
    { ...base, id: 4, status: 'completed', photo: 'p.png', reported_by_me: 2 },
  ]]];
  await withApp(claimsRouter, { userId: 9, rules }, async ({ call }) => {
    const res = await call('GET', '/my/claims');
    assert.equal(res.body[0].finder_phone, null);
    assert.equal(res.body[0].photo_url, null);
    assert.equal(res.body[1].finder_phone, '01733333333');
    assert.equal(res.body[1].photo_url, '/uploads/p.png');
    assert.equal(res.body[1].reported_by_me, true);
  });
});

// ---------- Approve ----------
test('approve: finder approves a pending claim, item becomes claimed, others rejected', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, claimRow()]] }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/claims/10/approve')).status, 200);
    assert.ok(ran(mock, "SET status = 'approved'"));
    assert.ok(ran(mock, "SET status = 'claimed'"));
    assert.ok(ran(mock, "SET status = 'rejected'"));
  });
});

test('approve: a user who is not the finder gets 403', async () => {
  await withApp(claimsRouter, { userId: 77, rules: [[LOAD, claimRow()]] }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/claims/10/approve')).status, 403);
    assert.equal(ran(mock, "SET status = 'approved'"), false);
  });
});

test('approve: an already approved claim returns 409', async () => {
  const rules = [[LOAD, claimRow({ status: 'approved', item_status: 'claimed' })]];
  await withApp(claimsRouter, { userId: 1, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/approve')).status, 409);
  });
});

test('approve: a missing claim returns 404', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, undefined]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/99/approve')).status, 404);
  });
});

// ---------- Reject ----------
test('reject: finder rejects a pending claim', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, claimRow()]] }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/claims/10/reject')).status, 200);
    assert.ok(ran(mock, "SET status = 'rejected'"));
  });
});

test('reject: a user who is not the finder gets 403', async () => {
  await withApp(claimsRouter, { userId: 9, rules: [[LOAD, claimRow()]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/reject')).status, 403);
  });
});

test('reject: a claim that is already decided returns 409', async () => {
  const rules = [[LOAD, claimRow({ status: 'rejected' })]];
  await withApp(claimsRouter, { userId: 1, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/reject')).status, 409);
  });
});

test('reject: a missing claim returns 404', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, undefined]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/99/reject')).status, 404);
  });
});

// ---------- Handover ----------
test('handover: the claimant confirms, claim completed and item returned', async () => {
  const rules = [[LOAD, claimRow({ status: 'approved', item_status: 'claimed' })]];
  await withApp(claimsRouter, { userId: 9, rules }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/claims/10/handed-over')).status, 200);
    assert.ok(ran(mock, "SET status = 'completed'"));
    assert.ok(ran(mock, "SET status = 'returned'"));
  });
});

test('handover: the finder can also confirm', async () => {
  const rules = [[LOAD, claimRow({ status: 'approved', item_status: 'claimed' })]];
  await withApp(claimsRouter, { userId: 1, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/handed-over')).status, 200);
  });
});

test('handover: a stranger gets 403', async () => {
  const rules = [[LOAD, claimRow({ status: 'approved', item_status: 'claimed' })]];
  await withApp(claimsRouter, { userId: 55, rules }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/handed-over')).status, 403);
  });
});

test('handover: a claim that is not approved returns 409', async () => {
  await withApp(claimsRouter, { userId: 9, rules: [[LOAD, claimRow()]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/handed-over')).status, 409);
  });
});

test('handover: a missing claim returns 404', async () => {
  await withApp(claimsRouter, { userId: 9, rules: [[LOAD, undefined]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/99/handed-over')).status, 404);
  });
});

// ---------- No-show report ----------
const approved = () => claimRow({ status: 'approved', item_status: 'claimed' });
const REASON = 'The other person never came to meet.';

test('report: finder reports the claimant, the item goes back on the list', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, approved()]] }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/claims/10/report', { reason: REASON })).status, 200);
    const insert = mock.calls.find((c) => c.sql.includes('INSERT INTO reports'));
    assert.deepEqual(insert.args, [10, 1, 9, REASON]);
    const update = mock.calls.find((c) => c.sql.includes('UPDATE items SET status = ?'));
    assert.deepEqual(update.args, ['available', 4]);
  });
});

test('report: claimant reports the finder, the listing is flagged for admin review', async () => {
  await withApp(claimsRouter, { userId: 9, rules: [[LOAD, approved()]] }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/claims/10/report', { reason: REASON })).status, 200);
    const insert = mock.calls.find((c) => c.sql.includes('INSERT INTO reports'));
    assert.deepEqual(insert.args, [10, 9, 1, REASON]);
    const update = mock.calls.find((c) => c.sql.includes('UPDATE items SET status = ?'));
    assert.deepEqual(update.args, ['flagged', 4]);
  });
});

test('report: a stranger gets 403', async () => {
  await withApp(claimsRouter, { userId: 55, rules: [[LOAD, approved()]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/report', { reason: REASON })).status, 403);
  });
});

test('report: only allowed during an active handover (409)', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, claimRow()]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/10/report', { reason: REASON })).status, 409);
  });
});

test('report: a reason that is too short returns 400', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, approved()]] }, async ({ call, mock }) => {
    assert.equal((await call('POST', '/claims/10/report', { reason: 'bad' })).status, 400);
    assert.equal(ran(mock, 'INSERT INTO reports'), false);
  });
});

test('report: a missing claim returns 404', async () => {
  await withApp(claimsRouter, { userId: 1, rules: [[LOAD, undefined]] }, async ({ call }) => {
    assert.equal((await call('POST', '/claims/99/report', { reason: REASON })).status, 404);
  });
});
