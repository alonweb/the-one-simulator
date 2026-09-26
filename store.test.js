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
  assert.throws(() => buildStateWrite('X1', 'open', 'k'), /closed or revealed/i);
  assert.throws(() => buildStateWrite('X1', 'nonsense', 'k'), /closed or revealed/i);
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
