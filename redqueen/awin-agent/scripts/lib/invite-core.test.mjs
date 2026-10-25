import test from 'node:test';
import assert from 'node:assert/strict';
import {
  craftInviteMessage,
  uniqueInviteMessage,
  isWithinCooldown,
  classifySkip,
  rankCandidates,
  trimTo149,
  MAX_MSG,
} from './invite-core.mjs';

test('craftInviteMessage stays <= 149 and includes name', () => {
  const msg = craftInviteMessage({
    name: 'Tech Trade',
    sector: 'Computers',
    hasFeed: true,
    approval: 92,
  });
  assert.ok(msg.length <= MAX_MSG, msg);
  assert.ok(/Tech Trade/i.test(msg), msg);
  assert.ok(/Computer/i.test(msg) || /Smart Catalogue/i.test(msg), msg);
});

test('craftInviteMessage falls back with name only', () => {
  const msg = craftInviteMessage({ name: 'Acme Widgets' });
  assert.ok(msg.length <= MAX_MSG);
  assert.ok(/Acme Widgets/.test(msg));
});

test('uniqueInviteMessage differs within a run', () => {
  const used = new Set();
  const a = uniqueInviteMessage({ id: '1', name: 'Brand A', sector: 'Fashion' }, used);
  const b = uniqueInviteMessage({ id: '2', name: 'Brand A', sector: 'Fashion' }, used);
  assert.notEqual(a, b);
  assert.ok(a.length <= MAX_MSG && b.length <= MAX_MSG);
});

test('trimTo149 word boundary', () => {
  const long = 'word '.repeat(50);
  const t = trimTo149(long);
  assert.ok(t.length <= MAX_MSG);
  assert.ok(!t.endsWith(' '));
});

test('isWithinCooldown 90 days', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  assert.equal(isWithinCooldown('2026-10-18T14:00:00Z', now, 90), true);
  assert.equal(isWithinCooldown('2026-01-01T00:00:00Z', now, 90), false);
  assert.equal(isWithinCooldown(null, now, 90), false);
});

test('classifySkip foldered and cooldown', () => {
  const index = {
    folders: new Set(['9002']),
    invites: new Map([
      ['50519', { blocked90d: true, invitedat: '2026-10-18T14:00:00Z' }],
      ['111', { blocked90d: false, invitedat: '2025-01-01T00:00:00Z' }],
    ]),
  };
  assert.equal(classifySkip('9002', index), 'foldered');
  assert.equal(classifySkip('50519', index), 'cooldown_90d');
  assert.equal(classifySkip('111', index), null);
  assert.equal(classifySkip('999', index), null);
});

test('rankCandidates prefers feed then approval then id', () => {
  const ranked = rankCandidates([
    { id: '20', hasFeed: false, approval: 99 },
    { id: '10', hasFeed: true, approval: 50 },
    { id: '11', hasFeed: true, approval: 80 },
  ]);
  assert.deepEqual(
    ranked.map((r) => r.id),
    ['11', '10', '20']
  );
});
