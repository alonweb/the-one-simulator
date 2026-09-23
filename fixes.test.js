import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crowdResult, leaderboard, sessionStats } from './stats.js';
import { scoreMatchup } from './scoring.js';
import { normalizeCode, submit } from './store.js';
import { escapeHtml } from './html.js';
import { emptyDraft, setAnswer, isComplete } from './draft.js';

const CATS = [{ key: 'smile' }];
const MATCHES = [{ id: 'm1' }];

// C1 — a malformed row must not kill the reveal for the whole room
test('crowdResult ignores a row whose matchup payload is empty', () => {
  const rows = [
    { submissionId: 'a', participant: 'a', answers: { m1: {} } },
    { submissionId: 'b', participant: 'b',
      answers: { m1: { overall: { vote: 'c1', predicted: 'c1' },
                       categories: { smile: { vote: 'c1', contestant: 'c1', share: 60 } } } } }
  ];
  const r = crowdResult(rows, 'm1', ['smile']);
  assert.equal(r.voters, 1);
  assert.equal(r.overallWinner, 'c1');
});

test('scoreMatchup ignores an answer with no overall or categories', () => {
  const crowd = { overallWinner: 'c1', categories: { smile: { c1: 60 } } };
  assert.equal(scoreMatchup({}, crowd).total, 0);
  assert.equal(scoreMatchup({ overall: { predicted: 'c1' } }, crowd).total, 2);
});

test('sessionStats survives a malformed row', () => {
  const rows = [{ submissionId: 'a', participant: 'a', answers: { m1: {} } }];
  const s = sessionStats(rows, { m1: crowdResult(rows, 'm1', ['smile']) });
  assert.equal(s.participants, 1);
});

// I8 — a shut-out contestant must read as 0%, not undefined
test('crowdResult reports zero for a contestant nobody voted for', () => {
  const rows = [{ submissionId: 'a', participant: 'a',
    answers: { m1: { overall: { vote: 'c1', predicted: 'c1' },
                     categories: { smile: { vote: 'c1', contestant: 'c2', share: 60 } } } } }];
  const r = crowdResult(rows, 'm1', ['smile'], ['c1', 'c2']);
  assert.equal(r.categories.smile.c1, 100);
  assert.equal(r.categories.smile.c2, 0);
});

// C2 — a server-side rejection must not read as a successful lock
test('submit throws when the server returns ok:false', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false, error: 'quota' }) });
  await assert.rejects(() => submit({ sessionCode: 'x', participant: 'p', answers: {}, submissionId: 's' }));
});

test('submit resolves when the server returns ok:true', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, duplicate: false }) });
  const r = await submit({ sessionCode: 'x', participant: 'p', answers: {}, submissionId: 's' });
  assert.equal(r.ok, true);
});

// I5 — a code typed with different capitalisation must still match
test('session codes normalise to the same value', () => {
  assert.equal(normalizeCode(' abc '), 'ABC');
  assert.equal(normalizeCode('AbC'), normalizeCode('abc'));
});

// I7 — a participant name is free text behind an anonymous endpoint
test('escapeHtml neutralises markup in a name', () => {
  assert.equal(escapeHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assert.equal(escapeHtml('Ana & "Bo"'), 'Ana &amp; &quot;Bo&quot;');
});

// C3 — choosing a contestant must record the displayed default share
test('choosing a category contestant records the default share', () => {
  let d = emptyDraft(MATCHES, CATS);
  d = setAnswer(d, 'm1', 'overall', { vote: 'c1', predicted: 'c1' });
  d = setAnswer(d, 'm1', 'smile', { vote: 'c1', contestant: 'c1' });
  assert.equal(d.m1.categories.smile.share, 51);
  assert.equal(isComplete(d, MATCHES, CATS), true);
});

// minor re-graded: a statistic read aloud must not be understated
test('mean absolute error divides by the answers it actually measured', () => {
  const rows = [{ submissionId: 'a', participant: 'a',
    answers: { m1: { overall: { vote: 'c1', predicted: 'c1' },
                     categories: { smile: { vote: 'c1', contestant: 'c9', share: 60 } } } } }];
  const s = sessionStats(rows, { m1: crowdResult(rows, 'm1', ['smile']) });
  assert.equal(s.meanAbsoluteError, 0);
});

// minor re-graded: equal scores must not be announced as different places
test('equal totals share a rank', () => {
  const mk = (id) => ({ submissionId: id, participant: id,
    answers: { m1: { overall: { vote: 'c1', predicted: 'c1' }, categories: {} } } });
  const rows = [mk('a'), mk('b')];
  const board = leaderboard(rows, { m1: crowdResult(rows, 'm1', []) });
  assert.equal(board[0].total, board[1].total);
  assert.equal(board[0].rank, board[1].rank);
});

// Found by firing 20 simultaneous locks at the live endpoint: 7 of 20 came back as an
// HTML error page because the server lock queue exceeded its wait. Retrying must be
// patient enough to outlast the queue, and a non-JSON reply is retryable, not fatal.
test('submit retries a non-JSON reply and succeeds once the queue clears', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 4) return { ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    return { ok: true, json: async () => ({ ok: true, duplicate: false }) };
  };
  const r = await submit({ sessionCode: 'x', participant: 'p', answers: {}, submissionId: 's' },
                         { attempts: 6, baseDelayMs: 1 });
  assert.equal(r.ok, true);
  assert.equal(calls, 4);
});

test('submit retries a busy server and reports progress while it waits', async () => {
  let calls = 0; const seen = [];
  globalThis.fetch = async () => {
    calls++;
    return calls < 3
      ? { ok: true, json: async () => ({ ok: false, error: 'busy' }) }
      : { ok: true, json: async () => ({ ok: true }) };
  };
  await submit({ sessionCode: 'x', participant: 'p', answers: {}, submissionId: 's' },
               { attempts: 6, baseDelayMs: 1, onAttempt: (n) => seen.push(n) });
  assert.deepEqual(seen, [1, 2, 3]);
});

test('submit gives up only after every attempt', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ ok: false, error: 'busy' }) }; };
  await assert.rejects(() => submit({ sessionCode: 'x', participant: 'p', answers: {}, submissionId: 's' },
                                    { attempts: 4, baseDelayMs: 1 }));
  assert.equal(calls, 4);
});

// The presenter drives this live in front of people. An empty session must say so,
// and vote counts must be readable rather than raw JSON.
import { formatCounts } from './present-format.js';

test('counts read as names, votes and a share', () => {
  const m = { a: { id: 'c1', name: 'Ana' }, b: { id: 'c2', name: 'Bea' } };
  assert.equal(formatCounts({ c1: 7, c2: 13 }, m), 'Bea 13 (65%), Ana 7 (35%)');
});

test('a unanimous count still names the shut-out contestant', () => {
  const m = { a: { id: 'c1', name: 'Ana' }, b: { id: 'c2', name: 'Bea' } };
  assert.equal(formatCounts({ c1: 4, c2: 0 }, m), 'Ana 4 (100%), Bea 0 (0%)');
});

test('no votes yet reads as no votes, not as a row of zeros', () => {
  const m = { a: { id: 'c1', name: 'Ana' }, b: { id: 'c2', name: 'Bea' } };
  assert.equal(formatCounts({ c1: 0, c2: 0 }, m), 'no votes yet');
});

// A participant must be able to check their answers before an irreversible lock.
// Raw JSON is not checkable.
import { summariseMatchup } from './present-format.js';

test('review reads the answers back in words', () => {
  const m = { id:'m1', a:{ id:'c1', name:'Ana' }, b:{ id:'c2', name:'Camila' } };
  const cats = [{ key:'smile', label:'Best Smile' }];
  const entry = { overall:{ vote:'c1', predicted:'c2' },
                  categories:{ smile:{ vote:'c1', contestant:'c2', share:68 } } };
  const s = summariseMatchup(m, entry, cats);
  assert.equal(s.title, 'Ana v Camila');
  assert.deepEqual(s.lines, [
    'Who is the one — you picked Ana, you think the room picks Camila',
    'Best Smile — you picked Ana, you think the room gives Camila 68%'
  ]);
});

test('review shows an unanswered question as missing', () => {
  const m = { id:'m1', a:{ id:'c1', name:'Ana' }, b:{ id:'c2', name:'Camila' } };
  const cats = [{ key:'smile', label:'Best Smile' }];
  const s = summariseMatchup(m, { overall: null, categories: {} }, cats);
  assert.deepEqual(s.lines, ['Who is the one — not answered', 'Best Smile — not answered']);
  assert.equal(s.complete, false);
});

// A device keeps its answers so a reload cannot lose them, which also means a device
// cannot start a second round without an explicit reset.
import { wantsReset } from './draft.js';

test('a reset is requested only by the explicit query flag', () => {
  assert.equal(wantsReset('?reset=1'), true);
  assert.equal(wantsReset('?reset=yes'), true);
  assert.equal(wantsReset(''), false);
  assert.equal(wantsReset('?code=ABC'), false);
  assert.equal(wantsReset('?reset=0'), false);
});
