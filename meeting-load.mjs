// Plays the meeting against the real server: N phones wait and poll, the presenter releases
// matchups in waves, every phone locks each matchup the moment it opens (THINK=0, the worst
// case) or after a random think time, then N surveys go in at once. A presenter page reads the
// sheet throughout. Afterwards the sheet is read back to prove nothing was lost.
//
//   N=30 KEY=<presenter key> CODE=LOADTEST node meeting-load.mjs
//   THINK=90   each phone waits 0..90 s before locking, as people answering five questions do
//   WAVES="m1|m2,m3|m4,m5"   which matchups each release wave opens
//
// Rows are stamped CODE (LOADTEST), and releases apply to that code only, so live phones on
// LIVE1 are not moved. The rows still land in the one sheet: Reset it afterwards.
import { MATCHUPS, CATEGORIES, SURVEY } from './config.js';
import { fetchSession, submit, submitSurvey, release, fetchRows, fetchSurvey, mergeByPlayer, lockIdOf } from './store.js';
import { nextCompetition } from './flow.js';

const N = Number(process.env.N || 30);
const KEY = process.env.KEY || '';
const CODE = process.env.CODE || 'LOADTEST';
const THINK = Number(process.env.THINK || 0) * 1000;
const WAVES = (process.env.WAVES || 'm1|m2,m3|m4,m5').split('|').map(w => w.split(','));
if (!KEY) { console.error('Set KEY to the presenter key.'); process.exit(1); }

const run = Date.now();
const t = () => ((Date.now() - run) / 1000).toFixed(1) + 's';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const stats = { polls: 0, pollErrors: 0, pollMs: [], locks: [], presenterReads: [], presenterErrors: 0 };

function answerFor(m) {
  const cats = {};
  for (const { key: k } of CATEGORIES) {
    cats[k] = { vote: pick([m.a.id, m.b.id]), contestant: pick([m.a.id, m.b.id]), share: 51 + Math.floor(Math.random() * 50) };
  }
  return { overall: { vote: pick([m.a.id, m.b.id]), predicted: pick([m.a.id, m.b.id]), share: 60 }, categories: cats };
}

const releasedAt = {};
const seenAt = {};   // matchupId -> [ms from release until each phone saw it]

async function phone(n) {
  const id = `load-${run}-${n}`;
  const locked = [];
  let released = [];
  while (locked.length < MATCHUPS.length) {
    const t0 = Date.now();
    try {
      const s = await fetchSession(CODE);
      stats.polls++; stats.pollMs.push(Date.now() - t0);
      for (const m of s.released) {
        if (!released.includes(m) && releasedAt[m]) (seenAt[m] = seenAt[m] || []).push(Date.now() - releasedAt[m]);
      }
      released = s.released;
    } catch (e) { stats.pollErrors++; }
    // a phone answers every released matchup it has not locked, in order, then waits again
    for (let i = nextCompetition(MATCHUPS, released, locked); i >= 0; i = nextCompetition(MATCHUPS, released, locked)) {
      const m = MATCHUPS[i];
      if (THINK) await sleep(Math.random() * THINK);
      const l0 = Date.now(); let attempts = 0;
      try {
        await submit({ sessionCode: CODE, participant: `Load ${n}`, answers: { [m.id]: answerFor(m) },
                       submissionId: lockIdOf(id, m.id) }, { onAttempt: (a) => { attempts = a; } });
        stats.locks.push({ n, m: m.id, ok: true, ms: Date.now() - l0, attempts });
      } catch (err) {
        stats.locks.push({ n, m: m.id, ok: false, ms: Date.now() - l0, attempts, error: err.message });
      }
      locked.push(m.id);
    }
    if (locked.length < MATCHUPS.length) await sleep(4000 + Math.random() * 2000);
  }
}

let presenterOn = true;
async function presenter() {
  while (presenterOn) {
    const t0 = Date.now();
    try { await fetchRows(CODE, KEY); stats.presenterReads.push(Date.now() - t0); }
    catch (e) { stats.presenterErrors++; }
    await sleep(10000);
  }
}

const locksDone = (ids) => stats.locks.filter(l => ids.includes(l.m)).length >= N * ids.length;
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const secs = (ms) => (ms / 1000).toFixed(1) + 's';

console.log(`${t()} ${N} phones join and wait (session ${CODE}${THINK ? `, think time up to ${THINK / 1000}s` : ', locking the instant a matchup opens'})`);
const phones = Array.from({ length: N }, (_, i) => phone(i + 1));
const pres = presenter();
await sleep(8000);

for (const wave of WAVES) {
  for (const m of wave) {
    const r = await release(CODE, m, KEY);
    if (!r || r.ok !== true) { console.error('release refused:', r && r.error); process.exit(1); }
    releasedAt[m] = Date.now();
  }
  console.log(`${t()} released ${wave.join(' + ')}`);
  const w0 = Date.now();
  while (!locksDone(wave)) await sleep(500);
  const ls = stats.locks.filter(l => wave.includes(l.m));
  const seen = wave.flatMap(m => seenAt[m] || []);
  console.log(`${t()}   ${ls.filter(l => l.ok).length}/${ls.length} locks stored in ${secs(Date.now() - w0)}` +
    ` · every phone saw the release within ${secs(Math.max(...seen))} (median ${secs(q(seen, .5))})` +
    ` · lock time median ${secs(q(ls.map(l => l.ms), .5))}, slowest ${secs(Math.max(...ls.map(l => l.ms)))}` +
    ` · needed a retry ${ls.filter(l => l.attempts > 1).length} · most attempts ${Math.max(...ls.map(l => l.attempts))}`);
  for (const l of ls.filter(l => !l.ok)) console.log(`    FAILED phone ${l.n} ${l.m}: ${l.error}`);
  await sleep(3000);
}
await Promise.all(phones);

console.log(`${t()} ${N} surveys at once`);
const s0 = Date.now();
const surveys = await Promise.all(Array.from({ length: N }, (_, i) => {
  const answers = {};
  for (const qn of SURVEY) answers[qn.key] = qn.type === 'choice' ? pick(qn.options) : `load test ${run}`;
  let attempts = 0; const a0 = Date.now();
  return submitSurvey({ sessionCode: CODE, participant: `Load ${i + 1}`, answers, submissionId: `loadsrv-${run}-${i + 1}` },
                      { onAttempt: (a) => { attempts = a; } })
    .then(() => ({ ok: true, attempts, ms: Date.now() - a0 }))
    .catch(err => ({ ok: false, attempts, ms: Date.now() - a0, error: err.message }));
}));
console.log(`${t()}   ${surveys.filter(s => s.ok).length}/${N} surveys stored in ${secs(Date.now() - s0)}` +
  ` · slowest ${secs(Math.max(...surveys.map(s => s.ms)))} · needed a retry ${surveys.filter(s => s.attempts > 1).length}`);
for (const s of surveys.filter(s => !s.ok)) console.log(`    FAILED survey: ${s.error}`);
presenterOn = false; await pres;

const rows = (await fetchRows(CODE, KEY)).filter(r => String(r.submissionId).startsWith(`load-${run}-`));
const players = mergeByPlayer(rows);
const complete = players.filter(p => MATCHUPS.every(m => p.answers[m.id]));
const srows = (await fetchSurvey(CODE, KEY)).filter(r => String(r.submissionId).startsWith(`loadsrv-${run}-`));
console.log(`\nwaiting phones: ${stats.polls} state reads, ${stats.pollErrors} failed (retried on the next poll), median ${secs(q(stats.pollMs, .5))}, slowest ${secs(Math.max(...stats.pollMs))}`);
console.log(`presenter page: ${stats.presenterReads.length} reads, ${stats.presenterErrors} failed, slowest ${secs(Math.max(0, ...stats.presenterReads))}`);
const lost = rows.length < N * MATCHUPS.length || complete.length < N || srows.length < N;
console.log(`sheet check: ${rows.length}/${N * MATCHUPS.length} lock rows · ${complete.length}/${N} players with all five matchups · ${srows.length}/${N} surveys` +
  (lost ? '  <-- ROWS LOST' : '  <-- nothing lost'));
process.exit(lost || stats.locks.some(l => !l.ok) || surveys.some(s => !s.ok) ? 1 : 0);
