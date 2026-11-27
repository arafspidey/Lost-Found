// Item routes: locations, categories, search, item details, posting (with photo), and removal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const itemsRouter = require('../items');
const { CATEGORIES } = require('../constants');
const { withApp, ran } = require('./support');

const row = (over = {}) => ({
  id: 1, finder_id: 1, category: 'Wallet', description: 'Black leather wallet', photo: null,
  status: 'available', created_at: 't', location: 'Kazla, Boalia, Rajshahi', finder_name: 'Karim', ...over,
});
const SEARCH = "WHERE i.status = 'available'";

// ---------- Dropdown data ----------
test('categories: returns the fixed category list', async () => {
  await withApp(itemsRouter, { userId: undefined }, async ({ call }) => {
    const res = await call('GET', '/categories');
    assert.deepEqual(res.body, CATEGORIES);
  });
});

test('locations: builds the district > upazila > area tree', async () => {
  const rules = [['FROM areas a', [
    { district_id: 1, district: 'Rajshahi', upazila_id: 2, upazila: 'Boalia', area_id: 3, area: 'Kazla' },
    { district_id: 1, district: 'Rajshahi', upazila_id: 2, upazila: 'Boalia', area_id: 4, area: 'Sagarpara' },
    { district_id: 1, district: 'Rajshahi', upazila_id: 5, upazila: 'Paba', area_id: 6, area: 'Hujuripara' },
  ]]];
  await withApp(itemsRouter, { userId: undefined, rules }, async ({ call }) => {
    const res = await call('GET', '/locations');
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].upazilas.length, 2);
    assert.deepEqual(res.body[0].upazilas[0].areas.map((a) => a.name), ['Kazla', 'Sagarpara']);
  });
});

// ---------- Search ----------
const rows = [
  row({ id: 1, category: 'Wallet', description: 'Black leather wallet' }),
  row({ id: 2, category: 'Phone', description: 'Black phone with cracked screen' }),
  row({ id: 3, category: 'Keys', description: 'Bunch of house keys' }),
];

test('search: results are ranked by matching words and private fields are hidden', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[SEARCH, rows]] }, async ({ call }) => {
    const res = await call('GET', '/items?q=black%20wallet');
    assert.deepEqual(res.body.map((i) => i.id), [1, 2]);
    assert.equal(res.body[0].finder_id, undefined);
    assert.equal(res.body[0].photo_url, null);
  });
});

test('search: without a keyword all available items are returned in order', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[SEARCH, rows]] }, async ({ call }) => {
    const res = await call('GET', '/items');
    assert.deepEqual(res.body.map((i) => i.id), [1, 2, 3]);
  });
});

test('search: one-letter words are ignored', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[SEARCH, rows]] }, async ({ call }) => {
    const res = await call('GET', '/items?q=a');
    assert.equal(res.body.length, 3);
  });
});

test('search: category and area filters are added to the query, area wins over district', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[SEARCH, []]] }, async ({ call, mock }) => {
    await call('GET', '/items?category=Wallet&area=5&district=1');
    const q = mock.calls.find((c) => c.sql.includes(SEARCH));
    assert.ok(q.sql.includes('i.category = ?'));
    assert.ok(q.sql.includes('i.area_id = ?'));
    assert.equal(q.sql.includes('up.district_id = ?'), false);
    assert.deepEqual(q.args, ['Wallet', 5]);
  });
});

test('search: upazila filter is used when no area is given', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[SEARCH, []]] }, async ({ call, mock }) => {
    await call('GET', '/items?upazila=7&district=1');
    const q = mock.calls.find((c) => c.sql.includes(SEARCH));
    assert.ok(q.sql.includes('a.upazila_id = ?'));
    assert.deepEqual(q.args, [7]);
  });
});

test('search: district filter is used when only a district is given', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[SEARCH, []]] }, async ({ call, mock }) => {
    await call('GET', '/items?district=1');
    const q = mock.calls.find((c) => c.sql.includes(SEARCH));
    assert.ok(q.sql.includes('up.district_id = ?'));
    assert.deepEqual(q.args, [1]);
  });
});

// ---------- One item ----------
const ITEM = 'WHERE i.id = ?';
const MY_CLAIM = 'FROM claims WHERE item_id';
const QUESTION = 'SELECT secret_question';

test('item: a missing item returns 404', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[ITEM, undefined]] }, async ({ call }) => {
    assert.equal((await call('GET', '/items/9')).status, 404);
  });
});

test('item: a removed item returns 404', async () => {
  await withApp(itemsRouter, { userId: 1, rules: [[ITEM, row({ status: 'removed' })]] }, async ({ call }) => {
    assert.equal((await call('GET', '/items/1')).status, 404);
  });
});

test('item: a claimed item is hidden from strangers', async () => {
  const rules = [[ITEM, row({ status: 'claimed' })], [MY_CLAIM, undefined]];
  await withApp(itemsRouter, { userId: 5, rules }, async ({ call }) => {
    assert.equal((await call('GET', '/items/1')).status, 404);
  });
});

test('item: a claimed item is visible to the finder', async () => {
  const rules = [[ITEM, row({ status: 'claimed' })], [MY_CLAIM, undefined], [QUESTION, { secret_question: 'Color?' }]];
  await withApp(itemsRouter, { userId: 1, rules }, async ({ call }) => {
    const res = await call('GET', '/items/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.mine, true);
  });
});

test('item: a claimed item is visible to the claimant with their claim', async () => {
  const rules = [
    [ITEM, row({ status: 'claimed' })],
    [MY_CLAIM, { id: 2, status: 'approved' }],
    [QUESTION, { secret_question: 'Color?' }],
  ];
  await withApp(itemsRouter, { userId: 5, rules }, async ({ call }) => {
    const res = await call('GET', '/items/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.my_claim.status, 'approved');
  });
});

test('item: visitors see the item but not the verification question', async () => {
  await withApp(itemsRouter, { userId: undefined, rules: [[ITEM, row()]] }, async ({ call }) => {
    const res = await call('GET', '/items/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.secret_question, undefined);
    assert.equal(res.body.my_claim, null);
  });
});

test('item: logged-in users see the question but never the answer', async () => {
  const rules = [[ITEM, row()], [MY_CLAIM, undefined], [QUESTION, { secret_question: 'Color?' }]];
  await withApp(itemsRouter, { userId: 5, rules }, async ({ call }) => {
    const res = await call('GET', '/items/1');
    assert.equal(res.body.secret_question, 'Color?');
    assert.equal('secret_answer' in res.body, false);
  });
});

// ---------- Posting an item ----------
const validBody = () => ({
  category: 'Wallet', description: 'Black leather wallet found near the gate', area_id: 3,
  secret_question: 'What is inside the wallet?', secret_answer: 'two cards',
});
const AREA = 'SELECT 1 FROM areas';
const INSERT_ITEM = 'INSERT INTO items';
const okRules = () => [[AREA, { 1: 1 }], [INSERT_ITEM, () => ({ lastInsertRowid: 42 })]];

test('post: a visitor who is not logged in gets 401', async () => {
  await withApp(itemsRouter, { userId: undefined }, async ({ call }) => {
    assert.equal((await call('POST', '/items', validBody())).status, 401);
  });
});

test('post: a valid item is saved and its id returned', async () => {
  await withApp(itemsRouter, { userId: 5, rules: okRules() }, async ({ call, mock }) => {
    const res = await call('POST', '/items', validBody());
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 42);
    const insert = mock.calls.find((c) => c.sql.includes(INSERT_ITEM));
    assert.deepEqual(insert.args, [5, 'Wallet', 'Black leather wallet found near the gate', 3, null,
      'What is inside the wallet?', 'two cards']);
  });
});

const invalid = [
  ['an unknown category', { category: 'Boat' }, okRules],
  ['a description that is too short', { description: 'short' }, okRules],
  ['an area that does not exist', {}, () => [[AREA, undefined]]],
  ['a verification question that is too short', { secret_question: 'Why?' }, okRules],
  ['notes that are too long', { secret_answer: 'x'.repeat(301) }, okRules],
];
for (const [name, change, rules] of invalid) {
  test(`post: ${name} returns 400 and saves nothing`, async () => {
    await withApp(itemsRouter, { userId: 5, rules: rules() }, async ({ call, mock }) => {
      const res = await call('POST', '/items', { ...validBody(), ...change });
      assert.equal(res.status, 400);
      assert.equal(ran(mock, INSERT_ITEM), false);
    });
  });
}

function photoForm(bytes, type) {
  const form = new FormData();
  for (const [k, v] of Object.entries(validBody())) form.append(k, String(v));
  form.append('photo', new Blob([bytes], { type }), 'photo.bin');
  return form;
}

test('post: a file with the wrong type is rejected', async () => {
  await withApp(itemsRouter, { userId: 5, rules: okRules() }, async ({ base, mock }) => {
    const res = await fetch(base + '/items', { method: 'POST', body: photoForm('hello', 'text/plain') });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /JPG, PNG or WebP/);
    assert.equal(ran(mock, INSERT_ITEM), false);
  });
});

test('post: a fake image (wrong file bytes) is rejected', async () => {
  await withApp(itemsRouter, { userId: 5, rules: okRules() }, async ({ base, mock }) => {
    const res = await fetch(base + '/items', { method: 'POST', body: photoForm('not really an image', 'image/png') });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /not a valid image/);
    assert.equal(ran(mock, INSERT_ITEM), false);
  });
});

test('post: a real PNG photo is accepted and its file name saved', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  await withApp(itemsRouter, { userId: 5, rules: okRules() }, async ({ base, mock }) => {
    const res = await fetch(base + '/items', { method: 'POST', body: photoForm(png, 'image/png') });
    assert.equal(res.status, 201);
    const insert = mock.calls.find((c) => c.sql.includes(INSERT_ITEM));
    const filename = insert.args[4];
    assert.match(filename, /^[0-9a-f]{24}\.png$/);
    fs.unlinkSync(path.join(__dirname, '..', 'uploads', filename)); // clean up the test upload
  });
});

// ---------- Removing a listing ----------
const OWN_ITEM = 'SELECT finder_id, status FROM items';

test('remove: finder removes an available listing and pending claims are rejected', async () => {
  const rules = [[OWN_ITEM, { finder_id: 5, status: 'available' }]];
  await withApp(itemsRouter, { userId: 5, rules }, async ({ call, mock }) => {
    assert.equal((await call('DELETE', '/items/4')).status, 200);
    assert.ok(ran(mock, "SET status = 'removed'"));
    assert.ok(ran(mock, "SET status = 'rejected'"));
  });
});

test('remove: someone else\'s listing returns 404', async () => {
  const rules = [[OWN_ITEM, { finder_id: 1, status: 'available' }]];
  await withApp(itemsRouter, { userId: 5, rules }, async ({ call }) => {
    assert.equal((await call('DELETE', '/items/4')).status, 404);
  });
});

test('remove: a missing or already removed listing returns 404', async () => {
  await withApp(itemsRouter, { userId: 5, rules: [[OWN_ITEM, { finder_id: 5, status: 'removed' }]] }, async ({ call }) => {
    assert.equal((await call('DELETE', '/items/4')).status, 404);
  });
});

test('remove: a listing in the middle of a handover returns 409', async () => {
  const rules = [[OWN_ITEM, { finder_id: 5, status: 'claimed' }]];
  await withApp(itemsRouter, { userId: 5, rules }, async ({ call, mock }) => {
    assert.equal((await call('DELETE', '/items/4')).status, 409);
    assert.equal(ran(mock, "SET status = 'removed'"), false);
  });
});
