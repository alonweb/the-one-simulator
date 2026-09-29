import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmission, parseRows, buildStateWrite, buildResetWrite } from './store.js';

test('a submission carries the session code and a stable id', () => {
  const s = buildSubmission({ sessionCode: 'X1', participant: 'Ana', answers: { m1: {} }, submissionId: 'fixed-id' });
  assert.equal(s.kind, 'submission');
  assert.equal(s.sessionCode, 'X1');
  assert.equal(s.submissionId, 'fixed-id');
});

test('parseRows tolerates an empty sheet', () => {
  assert.deepEqual(parseRows({ ok: true, rows: [] }), []);
});

test('parseRows drops rows whose payload did not parse', () => {
  const out = parseRows({ ok: true, rows: [{ participant: 'a', answers: null }, { participant: 'b', answers: { m1: {} } }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].participant, 'b');
});

test('parseRows tolerates a failed response', () => {
  assert.deepEqual(parseRows({ ok: false }), []);
  assert.deepEqual(parseRows(null), []);
});

// The presenter key. It is never in the repository: the server keeps it in Script
// Properties and the presenter types it once on their own device.
test('a state write carries the session code, the state and the presenter key', () => {
  const w = buildStateWrite(' x1 ', 'revealed', 'hunter2');
  assert.deepEqual(w, { kind: 'state', sessionCode: 'X1', state: 'revealed', key: 'hunter2' });
});

test('a state write without a key is refused before it reaches the network', () => {
  assert.throws(() => buildStateWrite('X1', 'revealed', ''), /presenter key/i);
  assert.throws(() => buildStateWrite('X1', 'revealed', '   '), /presenter key/i);
  assert.throws(() => buildStateWrite('X1', 'revealed'), /presenter key/i);
});

test('a state write without a session code is refused', () => {
  assert.throws(() => buildStateWrite('', 'revealed', 'hunter2'), /session code/i);
});

test('only the two states the presenter can set are accepted', () => {
  assert.equal(buildStateWrite('X1', 'closed', 'k').state, 'closed');
  // reopening is allowed since 2026-09-29: a closed round had no way back but a reset
  assert.equal(buildStateWrite('X1', 'open', 'k').state, 'open');
  assert.throws(() => buildStateWrite('X1', 'nonsense', 'k'), /open, closed or revealed/i);
});

test('a reset carries the key and nothing else, and refuses to leave without one', () => {
  assert.deepEqual(buildResetWrite(' k1 '), { kind: 'reset', key: 'k1' });
  assert.throws(() => buildResetWrite(''), /presenter key/);
});

test('parseRows keeps the first row per submissionId, so a retried lock counts once', () => {
  const rows = parseRows({ ok: true, rows: [
    { submissionId: 's1', participant: 'Ana', answers: { m1: {} } },
    { submissionId: 's1', participant: 'Ana', answers: { m1: { late: true } } },
    { submissionId: 's2', participant: 'Bo', answers: { m1: {} } }
  ] });
  assert.deepEqual(rows.map(r => r.submissionId), ['s1', 's2']);
  assert.deepEqual(rows[0].answers, { m1: {} });
});

// "Start meeting" and the review screen wake the server before a lock needs it: an idle Apps
// Script took up to 11 s to answer its first request (measured 2026-09-29).
test('wake reads the public state and reports how long the server took', async (t) => {
  const { wake } = await import('./store.js');
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url) => { asked.push(url); return { ok: true, json: async () => ({ ok: true, state: 'open', released: [] }) }; });
  let clock = 1000;
  const r = await wake('https://example.test/exec', ' live1 ', () => (clock += 700));
  assert.deepEqual(r, { ok: true, ms: 700 });
  assert.deepEqual(asked, ['https://example.test/exec?what=state&code=LIVE1']);
});

test('wake never throws: a server that does not answer is reported, not raised', async (t) => {
  const { wake } = await import('./store.js');
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const r = await wake('https://example.test/exec', 'LIVE1');
  assert.equal(r.ok, false);
  assert.match(r.error, /offline/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => { throw new Error('an HTML error page'); } }));
  assert.equal((await wake('https://example.test/exec', 'LIVE1')).ok, false);
});

// The activity log names the presenter device behind each release, close, reopen and reset.
test('presenter writes carry the device that made them, when it is given', async () => {
  const { buildReleaseWrite } = await import('./store.js');
  assert.equal(buildStateWrite('X1', 'open', 'k', 'Mac·ab12').by, 'Mac·ab12');
  assert.equal(buildReleaseWrite('X1', 'm1', 'k', 'Mac·ab12').by, 'Mac·ab12');
  assert.equal(buildResetWrite('k', 'X1', 'Mac·ab12').by, 'Mac·ab12');
  assert.equal('by' in buildStateWrite('X1', 'open', 'k'), false);
});

test('fetchLog returns the log, and null from a server too old to keep one', async (t) => {
  const { fetchLog } = await import('./store.js');
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.match(url, /what=log&key=k$/);
    return { ok: true, json: async () => ({ ok: true, log: [{ at: 't', what: 'reopen' }] }) };
  });
  assert.deepEqual(await fetchLog('k'), [{ at: 't', what: 'reopen' }]);
  // an old server reads what=log as the answers, which carry no log
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ ok: true, rows: [] }) }));
  assert.equal(await fetchLog('k'), null);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ ok: false, error: 'wrong presenter key' }) }));
  await assert.rejects(fetchLog('k'), /wrong presenter key/);
});
