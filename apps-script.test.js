import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './gas-mock.mjs';

// the state reply also carries the reset epoch; most tests look only at the state and releases
const st = (s, code = 'LIVE1') => { const r = s.get({ what: 'state', code }); return { ok: r.ok, state: r.state, released: r.released }; };
const lock = (id, m) => ({ kind: 'submission', sessionCode: 'LIVE1', submissionId: `${id}~${m}`,
  participant: id, answers: { [m]: { overall: { vote: 'c1', predicted: 'c1' }, categories: {} } } });

test('nothing is released until the presenter releases it', () => {
  const s = loadServer();
  assert.deepEqual(st(s), { ok: true, state: 'open', released: [] });
});

test('a release needs the presenter key', () => {
  const s = loadServer();
  assert.equal(s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm1', key: 'wrong' }).ok, false);
  assert.deepEqual(s.get({ what: 'state', code: 'LIVE1' }).released, []);
});

test('several matchups can be released, in any order, and each is listed once', () => {
  const s = loadServer();
  for (const m of ['m2', 'm1', 'm2']) {
    assert.equal(s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: m, key: 'k' }).ok, true);
  }
  assert.deepEqual(st(s), { ok: true, state: 'open', released: ['m2', 'm1'] });
});

test('a release shows at once, even though the state read is cached', () => {
  const s = loadServer();
  s.get({ what: 'state', code: 'LIVE1' });
  s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm1', key: 'k' });
  assert.deepEqual(s.get({ what: 'state', code: 'LIVE1' }).released, ['m1']);
});

test('releasing does not close the round, and closing keeps the releases', () => {
  const s = loadServer();
  s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm1', key: 'k' });
  assert.equal(s.post(lock('p1', 'm1')).ok, true);
  s.post({ kind: 'state', sessionCode: 'LIVE1', state: 'closed', key: 'k' });
  assert.deepEqual(st(s), { ok: true, state: 'closed', released: ['m1'] });
  assert.equal(s.post(lock('p2', 'm1')).ok, false);
});

test('a release with a malformed matchup id is refused', () => {
  const s = loadServer();
  assert.equal(s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: '', key: 'k' }).ok, false);
  assert.equal(s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm1<script>', key: 'k' }).ok, false);
});

test('each matchup lock is its own row, read back under the presenter key', () => {
  const s = loadServer();
  s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm1', key: 'k' });
  s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm2', key: 'k' });
  s.post(lock('p1', 'm1'));
  s.post(lock('p1', 'm2'));
  const r = s.get({ what: 'rows', key: 'k' });
  assert.deepEqual(r.rows.map(x => x.submissionId), ['p1~m1', 'p1~m2']);
});

test('reset wipes the releases too, and the next read sees it', () => {
  const s = loadServer();
  s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm1', key: 'k' });
  s.get({ what: 'state', code: 'LIVE1' });
  assert.equal(s.post({ kind: 'reset', key: 'k', sessionCode: 'LIVE1' }).ok, true);
  assert.deepEqual(st(s), { ok: true, state: 'open', released: [] });
});

// 2026-09-29: a round was found closed and nothing said when or by whom, and a closed round
// could only come back through a reset that wipes every answer.
const K = (x) => ({ key: 'k', sessionCode: 'LIVE1', ...x });

test('a closed round can be reopened, keeping its releases, and takes locks again', () => {
  const s = loadServer();
  s.post(K({ kind: 'release', matchupId: 'm1' }));
  assert.equal(s.post(lock('p1', 'm1')).ok, true);
  s.post(K({ kind: 'state', state: 'closed' }));
  assert.equal(s.post(lock('p2', 'm1')).ok, false);
  assert.equal(s.post(K({ kind: 'state', state: 'open' })).ok, true);
  assert.deepEqual(st(s), { ok: true, state: 'open', released: ['m1'] });
  assert.equal(s.post(lock('p2', 'm1')).ok, true);
  assert.deepEqual(s.get({ what: 'rows', key: 'k' }).rows.map(r => r.submissionId), ['p1~m1', 'p2~m1']);
});

test('reopening needs the presenter key, and a made-up state is refused', () => {
  const s = loadServer();
  s.post(K({ kind: 'state', state: 'closed' }));
  assert.equal(s.post({ kind: 'state', sessionCode: 'LIVE1', state: 'open', key: 'wrong' }).ok, false);
  assert.equal(s.get({ what: 'state', code: 'LIVE1' }).state, 'closed');
  assert.equal(s.post(K({ kind: 'state', state: 'nonsense' })).ok, false);
});

test('the log records every presenter action with its device, newest first, and survives a reset', () => {
  const s = loadServer();
  s.post(K({ kind: 'release', matchupId: 'm1', by: 'Mac·a1' }));
  s.post(K({ kind: 'state', state: 'closed', by: 'iPhone·b2' }));
  s.post(K({ kind: 'state', state: 'open', by: 'Mac·a1' }));
  s.post(K({ kind: 'reset', by: 'Mac·a1' }));
  s.post({ kind: 'state', sessionCode: 'LIVE1', state: 'closed', key: 'wrong', by: 'Win·c3' });
  const log = s.get({ what: 'log', key: 'k' }).log;
  assert.deepEqual(log.map(e => [e.what, e.detail, e.by]), [
    ['refused', 'closed: wrong presenter key', 'Win·c3'],
    ['reset', '', 'Mac·a1'],
    ['reopen', '', 'Mac·a1'],
    ['closed', '', 'iPhone·b2'],
    ['release', 'm1', 'Mac·a1']
  ]);
  assert.ok(log.every(e => e.sessionCode === 'LIVE1' && e.at));
});

test('the log is the presenter\'s only: no key, no log', () => {
  const s = loadServer();
  s.post(K({ kind: 'release', matchupId: 'm1' }));
  assert.equal(s.get({ what: 'log' }).ok, false);
  assert.equal(s.get({ what: 'log', key: 'wrong' }).ok, false);
});

test('players locking do not write to the log', () => {
  const s = loadServer();
  s.post(K({ kind: 'release', matchupId: 'm1' }));
  assert.equal(s.post(lock('p1', 'm1')).ok, true);
  assert.deepEqual(s.get({ what: 'log', key: 'k' }).log.map(e => e.what), ['release']);
});

// 2026-09-29: a phone that had been open since before a reset kept its old list of releases,
// played matchup 1 though nothing was released, and the server stored the lock.
test('a lock for a matchup that is not released is refused, for good, and stores nothing', () => {
  const s = loadServer();
  const r = s.post(lock('p1', 'm1'));
  assert.equal(r.ok, false);
  assert.match(r.error, /not released/);
  assert.equal(r.retryable, false);
  assert.deepEqual(s.get({ what: 'rows', key: 'k' }).rows, []);
  s.post(K({ kind: 'release', matchupId: 'm1' }));
  assert.equal(s.post(lock('p1', 'm1')).ok, true);
});

test('the state tells phones when the sheet was last reset, so a phone left open can start over', () => {
  const s = loadServer();
  const before = s.get({ what: 'state', code: 'LIVE1' }).epoch;
  assert.equal(typeof before, 'string');
  s.post(K({ kind: 'release', matchupId: 'm1' }));
  s.post(K({ kind: 'state', state: 'closed' }));
  assert.equal(s.get({ what: 'state', code: 'LIVE1' }).epoch, before, 'releasing and closing keep the epoch');
  s.post(K({ kind: 'reset' }));
  const after = s.get({ what: 'state', code: 'LIVE1' }).epoch;
  assert.notEqual(after, before);
  assert.equal(s.get({ what: 'state', code: 'DEVICES1' }).epoch, after, 'one epoch for the whole sheet');
});
