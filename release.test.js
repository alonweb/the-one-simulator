import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCompetition, nextQuestion, prevQuestion } from './flow.js';
import { buildReleaseWrite, buildResetWrite, parseSession, lockIdOf, playerIdOf, mergeByPlayer } from './store.js';
import { leaderboard, crowdResult, boardTable } from './stats.js';

// The meeting runs one competition (matchup) at a time: the presenter releases each
// with its own switch, one or several at once, and a phone only ever opens a released one.
const M = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];

test('a phone opens the first released competition it has not locked', () => {
  assert.equal(nextCompetition(M, ['m1'], []), 0);
  assert.equal(nextCompetition(M, ['m1', 'm2'], ['m1']), 1);
});

test('with nothing released, or everything released already locked, the phone waits', () => {
  assert.equal(nextCompetition(M, [], []), -1);
  assert.equal(nextCompetition(M, ['m1'], ['m1']), -1);
});

test('released competitions are answered in matchup order, whatever order they were released in', () => {
  assert.equal(nextCompetition(M, ['m3', 'm1'], []), 0);
  assert.equal(nextCompetition(M, ['m3'], []), 2);
});

test('a release naming a matchup this build does not have is ignored', () => {
  assert.equal(nextCompetition(M, ['m9'], []), -1);
});

test('the questions of one competition step forward and back without leaving it', () => {
  assert.equal(nextQuestion(0, 5), 1);
  assert.equal(nextQuestion(4, 5), null);
  assert.equal(prevQuestion(1), 0);
  assert.equal(prevQuestion(0), null);
});

test('a release carries the session, the matchup and the presenter key', () => {
  assert.deepEqual(buildReleaseWrite(' live1 ', 'm2', ' k '),
    { kind: 'release', sessionCode: 'LIVE1', matchupId: 'm2', key: 'k' });
});

test('a release without a key or a matchup is refused before it leaves the page', () => {
  assert.throws(() => buildReleaseWrite('LIVE1', 'm2', ''), /presenter key/i);
  assert.throws(() => buildReleaseWrite('LIVE1', '', 'k'), /matchup/i);
  assert.throws(() => buildReleaseWrite('', 'm2', 'k'), /session code/i);
});

test('a reset names the session so its cached releases are dropped at once', () => {
  assert.deepEqual(buildResetWrite('k', 'live1'), { kind: 'reset', key: 'k', sessionCode: 'LIVE1' });
  assert.deepEqual(buildResetWrite('k'), { kind: 'reset', key: 'k' });
});

test('the session read gives the round state and the released competitions', () => {
  assert.deepEqual(parseSession({ ok: true, state: 'open', released: ['m1', 'm2'], epoch: '1759' }),
    { state: 'open', released: ['m1', 'm2'], epoch: '1759' });
});

test('a server that predates releases reads as open with nothing released', () => {
  assert.deepEqual(parseSession({ ok: true, state: 'closed' }), { state: 'closed', released: [], epoch: null });
  assert.deepEqual(parseSession(null), { state: 'open', released: [], epoch: null });
});

test('each competition is locked under its own id, and the id leads back to the player', () => {
  assert.equal(lockIdOf('sub-abc-1', 'm2'), 'sub-abc-1~m2');
  assert.equal(playerIdOf('sub-abc-1~m2'), 'sub-abc-1');
  // a row written before per-competition locks is its own player
  assert.equal(playerIdOf('sub-abc-1'), 'sub-abc-1');
});

const answer = (vote, pred) => ({ overall: { vote, predicted: pred }, categories: {} });

test("a player's competition rows are joined back into one player", () => {
  const rows = [
    { submissionId: 'p1~m1', participant: 'Ana', answers: { m1: answer('a', 'a') } },
    { submissionId: 'p2~m1', participant: 'Bo', answers: { m1: answer('b', 'b') } },
    { submissionId: 'p1~m2', participant: 'Ana', answers: { m2: answer('c', 'c') } }
  ];
  const out = mergeByPlayer(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].submissionId, 'p1');
  assert.equal(out[0].participant, 'Ana');
  assert.deepEqual(Object.keys(out[0].answers), ['m1', 'm2']);
  assert.deepEqual(Object.keys(out[1].answers), ['m1']);
});

test('the first answer to a competition wins if a player somehow reaches it twice', () => {
  const rows = [
    { submissionId: 'p1~m1', participant: 'Ana', answers: { m1: answer('a', 'a') } },
    { submissionId: 'p1', participant: 'Ana', answers: { m1: answer('b', 'b') } }
  ];
  const out = mergeByPlayer(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].answers.m1.overall.vote, 'a');
});

test('the board has a column per released competition and a dash where a player did not lock', () => {
  const rows = mergeByPlayer([
    { submissionId: 'p1~m1', participant: 'Ana', answers: { m1: answer('a', 'a') } },
    { submissionId: 'p2~m1', participant: 'Bo', answers: { m1: answer('a', 'b') } },
    { submissionId: 'p1~m2', participant: 'Ana', answers: { m2: answer('c', 'c') } }
  ]);
  const crowd = { m1: crowdResult(rows, 'm1', []), m2: crowdResult(rows, 'm2', []) };
  const t = boardTable(leaderboard(rows, crowd), ['m1', 'm2']);
  // Ana predicted and voted the room's pick in both (2 + 1 each); Bo only voted it in m1 (+1)
  assert.deepEqual(t.map(r => [r.rank, r.participant, r.cells, r.total]),
    [[1, 'Ana', [3, 3], 6], [2, 'Bo', [1, null], 1]]);
});

test('an unreleased competition scores nothing, even if rows for it exist', () => {
  const rows = mergeByPlayer([
    { submissionId: 'p1', participant: 'Ana', answers: { m1: answer('a', 'a'), m2: answer('c', 'c') } }
  ]);
  const crowd = { m1: crowdResult(rows, 'm1', []) };
  const t = boardTable(leaderboard(rows, crowd), ['m1']);
  assert.deepEqual(t[0].cells, [3]);
  assert.equal(t[0].total, 3);
});
