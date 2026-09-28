import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './gas-mock.mjs';

const lock = (id, m) => ({ kind: 'submission', sessionCode: 'LIVE1', submissionId: `${id}~${m}`,
  participant: id, answers: { [m]: { overall: { vote: 'c1', predicted: 'c1' }, categories: {} } } });

test('nothing is released until the presenter releases it', () => {
  const s = loadServer();
  assert.deepEqual(s.get({ what: 'state', code: 'LIVE1' }), { ok: true, state: 'open', released: [] });
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
  assert.deepEqual(s.get({ what: 'state', code: 'LIVE1' }), { ok: true, state: 'open', released: ['m2', 'm1'] });
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
  assert.deepEqual(s.get({ what: 'state', code: 'LIVE1' }), { ok: true, state: 'closed', released: ['m1'] });
  assert.equal(s.post(lock('p2', 'm1')).ok, false);
});

test('a release with a malformed matchup id is refused', () => {
  const s = loadServer();
  assert.equal(s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: '', key: 'k' }).ok, false);
  assert.equal(s.post({ kind: 'release', sessionCode: 'LIVE1', matchupId: 'm1<script>', key: 'k' }).ok, false);
});

test('each matchup lock is its own row, read back under the presenter key', () => {
  const s = loadServer();
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
  assert.deepEqual(s.get({ what: 'state', code: 'LIVE1' }), { ok: true, state: 'open', released: [] });
});
