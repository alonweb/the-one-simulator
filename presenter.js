import { MATCHUPS, CATEGORIES } from './config.js';
import { fetchRows, fetchState, setState, normalizeCode } from './store.js';
import { escapeHtml as esc } from './html.js';
import { formatCounts } from './present-format.js';
import { crowdResult, sessionStats, contestantStanding } from './stats.js';

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
  const pending = CATEGORIES.filter(c => c.needsReplacement);
  const warning = pending.length
    ? `<p class="warn">${pending.map(c => c.label).join(' and ')} still need replacing in config.js — they are judged from video, and there is none for this session.</p>` : '';
  const header = `<p>Round is <strong>${state}</strong>. Locked in: <strong>${rows.length}</strong>${
    rows.length ? '' : ' — nobody has locked yet'}.</p>`;

  // Before anyone locks there is nothing to report, and a page of zeros reads as a fault.
  if (!rows.length) {
    out.innerHTML = `${warning}${header}
      <p>This updates itself every 15 seconds. Numbers appear as people lock.</p>`;
    return;
  }

  out.innerHTML = `
    ${warning}${header}
    <p>Exact category hits: ${(stats.exactRate * 100).toFixed(1)}%.
       Average error predicting the room: ${stats.meanAbsoluteError.toFixed(1)} points.
       ${stats.ties.length ? 'Tied matchups: ' + stats.ties.join(', ') : 'No ties.'}</p>
    <p>Hardest to predict: ${stats.categoryDifficulty.length
      ? stats.categoryDifficulty.map(d => `${(CATEGORIES.find(c => c.key === d.key) || {}).label || d.key} (average error ${d.meanAbsoluteError.toFixed(1)})`).join(', ')
      : 'no data yet'}.</p>
    <h2>The contest — how the contestants did</h2>
    <table><tr><th>Contestant</th><th>Against</th><th>Result</th><th>Crowd share</th><th>Categories won</th></tr>
      ${contestantStanding(rows, MATCHUPS, CATEGORIES).map(c =>
        `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.opponent)}</td>
         <td>${c.tied ? 'tied' : c.wonOverall ? 'won' : 'lost'}</td>
         <td>${c.overallShare}%</td><td>${c.categoriesWon} of ${c.categoriesTotal}</td></tr>`).join('')}
    </table>

    <h2>The prediction — who read the room best</h2>
    <table><tr><th>#</th><th>Name</th><th>Points</th></tr>
      ${stats.leaderboard.map(r => `<tr><td>${r.rank}</td><td>${esc(r.participant)}</td><td>${r.total}</td></tr>`).join('')}
    </table>
    <h2>What the room said</h2>
    ${MATCHUPS.map(m => {
      const c = crowd[m.id];
      return `<h3>${m.a.name} v ${m.b.name}</h3>
        <table>
          <tr><th>Question</th><th>How the room voted</th></tr>
          <tr><td>Who is the one</td><td>${formatCounts(c.overallCounts, m)}${
            c.overallTied ? ' <strong>— tied, so this question scores zero for everyone</strong>' : ''}</td></tr>
          ${CATEGORIES.map(cat =>
            `<tr><td>${cat.label}</td><td>${formatCounts(c.categories[cat.key], m)}</td></tr>`).join('')}
        </table>`;
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
