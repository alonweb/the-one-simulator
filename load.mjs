// Fires N participants at the server at the same instant, the way a room of phones does
// when the presenter says "lock now", then N surveys the same way. Uses the app's own
// submit path (same retries, same back-off), and checks afterwards that every one landed.
//
//   N=30 KEY=<presenter key> node load.mjs
//
// Rows are stamped LOADTEST so they are easy to tell apart. Reset the sheet afterwards.
import { MATCHUPS, CATEGORIES, SURVEY } from './config.js';
import { submit, submitSurvey, fetchRows, fetchSurvey } from './store.js';

const N = Number(process.env.N || 30);
const KEY = process.env.KEY || '';
const CODE = process.env.CODE || 'LOADTEST';
const run = Date.now();
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function answers() {
  const out = {};
  for (const m of MATCHUPS) {
    out[m.id] = { overall: { vote: pick([m.a.id, m.b.id]), predicted: pick([m.a.id, m.b.id]) }, categories: {} };
    for (const c of CATEGORIES) {
      out[m.id].categories[c.key] = { vote: pick([m.a.id, m.b.id]), contestant: pick([m.a.id, m.b.id]), share: 51 + Math.floor(Math.random() * 50) };
    }
  }
  return out;
}
function survey() {
  const out = {};
  for (const q of SURVEY) {
    out[q.key] = q.type === 'scale' ? 1 + Math.floor(Math.random() * 5)
      : q.type === 'choice' ? pick(q.options) : `load test ${run}`;
  }
  return out;
}

async function wave(label, fn) {
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) => {
    const n = i + 1; let attempts = 0; const started = Date.now();
    return fn(n, () => { attempts++; })
      .then(r => ({ n, ok: true, duplicate: !!r.duplicate, attempts, ms: Date.now() - started }))
      .catch(err => ({ n, ok: false, attempts, ms: Date.now() - started, error: err.message }));
  }));
  const ok = results.filter(r => r.ok);
  const ms = results.map(r => r.ms).sort((a, b) => a - b);
  console.log(`${label}: ${ok.length}/${N} stored in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
    ` · fastest ${(ms[0] / 1000).toFixed(1)}s · median ${(ms[Math.floor(N / 2)] / 1000).toFixed(1)}s · slowest ${(ms[N - 1] / 1000).toFixed(1)}s` +
    ` · needed a retry: ${results.filter(r => r.attempts > 1).length}` +
    ` · max attempts ${Math.max(...results.map(r => r.attempts))}`);
  for (const r of results.filter(r => !r.ok)) console.log(`  FAILED ${label} ${r.n}: ${r.error}`);
  return results;
}

const locks = await wave('locks', (n, onAttempt) =>
  submit({ sessionCode: CODE, participant: `Load ${n}`, answers: answers(), submissionId: `load-${run}-${n}` }, { onAttempt }));
const surveys = await wave('surveys', (n, onAttempt) =>
  submitSurvey({ sessionCode: CODE, participant: `Load ${n}`, answers: survey(), submissionId: `loadsrv-${run}-${n}` }, { onAttempt }));

if (KEY) {
  const rows = await fetchRows(CODE, KEY);
  const mine = rows.filter(r => String(r.submissionId).startsWith(`load-${run}-`));
  const ids = new Set(mine.map(r => r.submissionId));
  const srows = (await fetchSurvey(CODE, KEY)).filter(r => String(r.submissionId).startsWith(`loadsrv-${run}-`));
  console.log(`sheet check: ${ids.size} distinct locks of ${N} (${mine.length} rows, so ${mine.length - ids.size} duplicates) · ${srows.length} surveys of ${N}`);
  process.exit(ids.size === N && mine.length === N && srows.length === N ? 0 : 1);
} else {
  console.log('no KEY given, so the sheet was not read back');
  process.exit(locks.every(r => r.ok) && surveys.every(r => r.ok) ? 0 : 1);
}
