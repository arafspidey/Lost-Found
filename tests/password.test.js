// Password hashing: salted, never plain text, and checkable.
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, checkPassword } = require('../password');

test('hashPassword returns salt:hash and not the password', () => {
  const stored = hashPassword('secret1');
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(stored.includes('secret1'), false);
});

test('the same password gets a different hash each time (random salt)', () => {
  assert.notEqual(hashPassword('secret1'), hashPassword('secret1'));
});

test('checkPassword accepts the right password', () => {
  assert.equal(checkPassword('secret1', hashPassword('secret1')), true);
});

test('checkPassword rejects a wrong password', () => {
  assert.equal(checkPassword('wrong', hashPassword('secret1')), false);
});

test('checkPassword rejects malformed stored values', () => {
  assert.equal(checkPassword('secret1', 'not-a-hash'), false);
  assert.equal(checkPassword('secret1', ''), false);
  assert.equal(checkPassword('secret1', undefined), false);
});
