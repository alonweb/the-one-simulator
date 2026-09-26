import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerRows } from './present-format.js';

const M = { id: 'm1', a: { id: 'c1', name: 'Ana' }, b: { id: 'c2', name: 'Camila' } };
const CATS = [{ key: 'smile', label: 'Best smile' }];
const crowd = { overallWinner: 'c2', overallTied: false, categories: { smile: { c1: 25, c2: 75 } } };
const score = { overall: 2, categories: { smile: { points: 1 } }, total: 3 };

test('answerRows puts what the player said next to what the room said, with points', () => {
  const answer = { overall: { vote: 'c1', predicted: 'c2' }, categories: { smile: { vote: 'c1', contestant: 'c2', share: 70 } } };
  const rows = answerRows(M, answer, crowd, score, CATS);
  assert.deepEqual(rows, [
    { question: 'Who is the one', yours: 'Camila (voted Ana)', room: 'Camila', points: 2 },
    { question: 'Best smile', yours: 'Camila 70% (voted Ana)', room: 'Camila 75%', points: 1 }
  ]);
});

test('answerRows survives a missing answer and a tied room', () => {
  const rows = answerRows(M, undefined, { ...crowd, overallWinner: null, overallTied: true }, undefined, CATS);
  assert.equal(rows[0].yours, 'not answered');
  assert.equal(rows[0].room, 'tied');
  assert.equal(rows[0].points, 0);
  assert.equal(rows[1].yours, 'not answered');
  assert.equal(rows[1].room, 'Ana 25%, Camila 75%');
});
