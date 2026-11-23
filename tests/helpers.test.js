// Unit tests for helpers.js: the adapter that hides private item fields.
const test = require('node:test');
const assert = require('node:assert/strict');
const { publicItem, CONTACT_VISIBLE } = require('../helpers');

test('publicItem hides finder notes and phone numbers', () => {
  const row = {
    id: 7, category: 'Keys', description: 'Red keychain', location: 'Kazla, Rajshahi',
    photo: 'abc.jpg', status: 'available', created_at: '2026-01-01', finder_name: 'Rahim',
    finder_id: 3, secret_question: 'What is on it?', secret_answer: 'private note',
  };
  const out = publicItem(row);
  assert.equal(out.photo_url, '/uploads/abc.jpg');
  assert.equal(out.finder_name, 'Rahim');
  assert.equal(out.secret_answer, undefined);
  assert.equal(out.secret_question, undefined);
  assert.equal(out.finder_id, undefined);
});

test('publicItem gives null photo_url when there is no photo', () => {
  const out = publicItem({ id: 1, photo: null, status: 'available' });
  assert.equal(out.photo_url, null);
});

test('contact details are visible only after approval states', () => {
  assert.deepEqual(CONTACT_VISIBLE, ['approved', 'completed', 'reported']);
  assert.equal(CONTACT_VISIBLE.includes('pending'), false);
  assert.equal(CONTACT_VISIBLE.includes('rejected'), false);
});
