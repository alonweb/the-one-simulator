import { MATCHUPS, CATEGORIES } from './config.js';
import { fetchRows, fetchState, setState, normalizeCode } from './store.js';
import { escapeHtml as esc } from './html.js';
import { crowdResult, sessionStats } from './stats.js';

const out = document.getElementById('out');
const codeInput = document.getElementById('code');
let rows = [];

function code() { return normalizeCode(codeInput.value); }

export function buildCrowd(rows) {
  const keys = CATEGORIES.map(c => c.key);
  const crowd = {};
  for (const m of MATCHUPS) crowd[m.id] = crowdResult(rows, m.id, keys, [m.a.id, m.b.id]);
  return crowd;
}

let refreshing = false;

async function refresh() {
  if (!code()) { out.textContent = 'Enter the session code.'; return; }
  if (refreshing) return;
  refreshing = true;
  try {
  rows = await fetchRows(code());
  const crowd = buildCrowd(rows);
  const stats = sessionStats(rows, crowd);
  const state = await fetchState(code()).catch(() => 'unknown');
  const unnamed = CATEGORIES.filter(c => c.label.startsWith('TO BE NAMED'));
  out.innerHTML = `
    ${unnamed.length ? `<p class="warn">${unnamed.length} category label(s) still unnamed in config.js.</p>` : ''}
    <p>State: <strong>${state}</strong>. Locked in: <strong>${rows.length}</strong>.</p>
    <p>Exact category hits: ${(stats.exactRate * 100).toFixed(1)}%.
       Average error predicting the room: ${stats.meanAbsoluteError.toFixed(1)} points.
       ${stats.ties.length ? 'Tied matchups: ' + stats.ties.join(', ') : 'No ties.'}</p>
    <p>Hardest to predict: ${stats.categoryDifficulty.length
      ? stats.categoryDifficulty.map(d => `${(CATEGORIES.find(c => c.key === d.key) || {}).label || d.key} (${d.meanAbsoluteError.toFixed(1)})`).join(', ')
      : 'no data yet'}.</p>
    <h2>Leaderboard</h2>
    <table><tr><th>#</th><th>Name</th><th>Points</th></tr>
      ${stats.leaderboard.map(r => `<tr><td>${r.rank}</td><td>${esc(r.participant)}</td><td>${r.total}</td></tr>`).join('')}
    </table>
    <h2>What the room said</h2>
    ${MATCHUPS.map(m => {
      const c = crowd[m.id];
      return `<h3>${m.a.name} v ${m.b.name}</h3>
        <p>Who is the one: ${JSON.stringify(c.overallCounts)} ${c.overallTied ? '(tied, scores zero)' : ''}</p>
        <p>${CATEGORIES.map(cat => `${cat.label}: ${JSON.stringify(c.categories[cat.key])}`).join('<br>')}</p>`;
    }).join('')}`;
  } catch (err) {
    out.innerHTML = `<p class="warn">Could not reach the sheet: ${esc(err.message)}. Nothing was changed. Press Load to try again.</p>`;
  } finally {
    refreshing = false;
  }
}

document.getElementById('load').onclick = refresh;
async function change(to) {
  if (!code()) { out.textContent = 'Enter the session code first.'; return; }
  try { await setState(code(), to); } 
  catch (err) { out.innerHTML = `<p class="warn">Could not set the round to ${to}: ${esc(err.message)}. Try again.</p>`; return; }
  refresh();
}
document.getElementById('close').onclick = () => change('closed');
document.getElementById('reveal').onclick = () => change('revealed');
document.getElementById('export').onclick = () => {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `the-one-session-${code()}.json`;
  a.click();
};
setInterval(() => { if (code()) refresh(); }, 15000);
