import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crowdResult, leaderboard, sessionStats } from './stats.js';

const rows = (votes) => votes.map((v, i) => ({
  submissionId: 's' + i,
  participant: v.name,
  answers: { m1: { overall: { vote: v.vote, predicted: v.pred },
                   categories: { smile: { vote: v.vote, contestant: v.pred, share: v.share } } } }
}));

test('crowd result counts votes and computes shares', () => {
  const r = crowdResult(rows([
    { name: 'a', vote: 'A', pred: 'A', share: 60 },
    { name: 'b', vote: 'A', pred: 'A', share: 60 },
    { name: 'c', vote: 'B', pred: 'A', share: 60 },
    { name: 'd', vote: 'A', pred: 'A', share: 60 }
  ]), 'm1', ['smile']);
  assert.equal(r.overallWinner, 'A');
  assert.equal(r.overallCounts.A, 3);
  assert.equal(r.categories.smile.A, 75);
  assert.equal(r.categories.smile.B, 25);
});

test('an even split has no winner and is reported as tied', () => {
  const r = crowdResult(rows([
    { name: 'a', vote: 'A', pred: 'A', share: 60 },
    { name: 'b', vote: 'B', pred: 'A', share: 60 }
  ]), 'm1', ['smile']);
  assert.equal(r.overallWinner, null);
  assert.equal(r.overallTied, true);
});

test('two people with the same name stay separate participants', () => {
  const data = rows([
    { name: 'Ana', vote: 'A', pred: 'A', share: 60 },
    { name: 'Ana', vote: 'A', pred: 'B', share: 60 }
  ]);
  const r = leaderboard(data, { m1: crowdResult(data, 'm1', ['smile']) });
  assert.equal(r.length, 2);
  assert.notEqual(r[0].submissionId, r[1].submissionId);
});

test('leaderboard ranks by total, highest first', () => {
  const data = rows([
    { name: 'high', vote: 'A', pred: 'A', share: 100 },
    { name: 'low', vote: 'A', pred: 'B', share: 51 }
  ]);
  const crowd = { m1: crowdResult(data, 'm1', ['smile']) };
  const board = leaderboard(data, crowd);
  assert.equal(board[0].participant, 'high');
  assert.ok(board[0].total >= board[1].total);
});

test('session stats rank the categories by how badly they were predicted', () => {
  const data = rows([
    { name: 'a', vote: 'A', pred: 'A', share: 100 },
    { name: 'b', vote: 'A', pred: 'A', share: 51 }
  ]);
  const s = sessionStats(data, { m1: crowdResult(data, 'm1', ['smile']) });
  assert.equal(s.categoryDifficulty.length, 1);
  assert.equal(s.categoryDifficulty[0].key, 'smile');
  assert.ok(s.spread.best >= s.spread.worst);
});

test('session stats report how often the room was exactly predicted', () => {
  const data = rows([
    { name: 'a', vote: 'A', pred: 'A', share: 100 },
    { name: 'b', vote: 'A', pred: 'A', share: 100 }
  ]);
  const s = sessionStats(data, { m1: crowdResult(data, 'm1', ['smile']) });
  assert.equal(s.participants, 2);
  assert.ok(s.exactRate >= 0 && s.exactRate <= 1);
  assert.ok('meanAbsoluteError' in s);
});
