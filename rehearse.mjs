// Submits synthetic participants so the whole path can be exercised before the day.
//   ENDPOINT="https://script.google.com/.../exec" CODE=REHEARSAL node rehearse.mjs
// Requires the CURRENT apps-script.gs to be deployed as a NEW VERSION.
import { MATCHUPS, CATEGORIES } from './config.js';

const ENDPOINT = process.env.ENDPOINT;
const CODE = process.env.CODE || 'REHEARSAL';
const N = Number(process.env.N || 20);
if (!ENDPOINT) { console.error('Set ENDPOINT.'); process.exit(1); }

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const started = Date.now();
let ok = 0;

for (let i = 1; i <= N; i++) {
  const answers = {};
  for (const m of MATCHUPS) {
    answers[m.id] = {
      overall: { vote: pick([m.a.id, m.b.id]), predicted: pick([m.a.id, m.b.id]) },
      categories: {}
    };
    for (const c of CATEGORIES) {
      answers[m.id].categories[c.key] = {
        vote: pick([m.a.id, m.b.id]),
        contestant: pick([m.a.id, m.b.id]),
        share: 51 + Math.floor(Math.random() * 50)
      };
    }
  }
  const body = { kind: 'submission', sessionCode: CODE, submissionId: `rehearse-${CODE}-${started}-${i}`,
                 participant: `Tester ${i}`, answers };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const out = await res.json();
  if (out.ok) ok++;
  console.log(i, out.ok ? (out.duplicate ? 'duplicate' : 'written') : 'FAILED ' + (out.error || res.status));
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${ok}/${N} accepted in ${secs}s (${(secs / N).toFixed(2)}s each).`);
console.log('If the whole room locks at once, expect them to queue at roughly this rate.');
