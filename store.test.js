import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmission, parseRows } from './store.js';

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
