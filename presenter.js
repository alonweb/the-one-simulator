import { MATCHUPS, CATEGORIES, SURVEY, SESSION_LABEL } from './config.js';
import { fetchRows, fetchSurvey, fetchState, setState, resetSheet } from './store.js';
import { escapeHtml as esc } from './html.js';
import { formatCounts, answerRows } from './present-format.js';
import { crowdResult, sessionStats, contestantStanding } from './stats.js';
import { surveyTable } from './survey.js';

// The page shows the whole sheet. ?code=X on the URL narrows it to one session's rows.
// Closing the round applies to SESSION_LABEL, which is what every new lock carries.
const CODE = new URLSearchParams(location.search).get('code') || '';

const out = document.getElementById('out');
const keyInput = document.getElementById('key');
const login = document.getElementById('login');
const statsEl = document.getElementById('stats');
const loginErr = document.getElementById('loginErr');

function showStats() { login.hidden = true; statsEl.hidden = false; }
function showLogin(message) {
  statsEl.hidden = true; login.hidden = false;
  loginErr.innerHTML = message ? `<p class="warn">${esc(message)}</p>` : '';
}
let rows = [];
let surveyRows = [];

function key() { return keyInput.value.trim(); }

// The key stays on the presenter's own device. It is remembered so a mid-session
// refresh does not lose it, and it is only ever sent to our own endpoint.
const KEY_STORE = 'theone.presenterKey';
try { keyInput.value = localStorage.getItem(KEY_STORE) || ''; } catch (e) {}
keyInput.oninput = () => { try { localStorage.setItem(KEY_STORE, keyInput.value); } catch (e) {} };

export function buildCrowd(rows) {
  const keys = CATEGORIES.map(c => c.key);
  const crowd = {};
  for (const m of MATCHUPS) crowd[m.id] = crowdResult(rows, m.id, keys, [m.a.id, m.b.id]);
  return crowd;
}

function playerCards(stats, crowd) {
  const byId = {};
  for (const r of rows) byId[r.submissionId] = r;
  return stats.leaderboard.map(p => {
    const raw = byId[p.submissionId];
    return `<div class="player">
      <h3><span>${p.rank}. ${esc(p.participant)}</span><span class="pts">${p.total} pts</span></h3>
      ${MATCHUPS.map(m => {
        const s = p.perMatchup[m.id];
        const lines = answerRows(m, raw && raw.answers && raw.answers[m.id], crowd[m.id], s, CATEGORIES);
        return `<h4>${esc(m.a.name)} v ${esc(m.b.name)} <span class="pts">${s ? s.total : 0}</span></h4>
          <table><tr><th>Question</th><th>Player said</th><th>Room said</th><th>Points</th></tr>
          ${lines.map(l => `<tr><td>${esc(l.question)}</td><td>${esc(l.yours)}</td><td>${esc(l.room)}</td><td class="pts">${l.points}</td></tr>`).join('')}
          </table>`;
      }).join('')}
    </div>`;
  }).join('');
}

function surveySection() {
  const t = surveyTable(surveyRows, SURVEY);
  if (!t.rows.length) return `<h2>The survey</h2><p class="note">No survey answers yet. They arrive after each player locks.</p>`;
  return `<h2>The survey — ${t.rows.length} answered</h2>
    <table><tr><th>Name</th>${t.header.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
    ${t.rows.map(r => `<tr><td><strong>${esc(r.participant)}</strong></td>${r.cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
    </table>`;
}

let refreshing = false;

async function refresh() {
  if (!key()) { showLogin('Enter the presenter key.'); return; }
  if (refreshing) return;
  refreshing = true;
  try {
    rows = await fetchRows(CODE, key());
    showStats();
    // the survey tab is created by the first answer; a missing one is not an error
    surveyRows = await fetchSurvey(CODE, key()).catch(() => []);
    const crowd = buildCrowd(rows);
    const stats = sessionStats(rows, crowd);
    const state = await fetchState(SESSION_LABEL).catch(() => 'unknown');
    const pending = CATEGORIES.filter(c => c.needsReplacement);
    const warning = pending.length
      ? `<p class="warn">${pending.map(c => c.label).join(' and ')} still need replacing in config.js — they are judged from video, and there is none for this session.</p>` : '';
    const header = `<p>${CODE ? `Showing session <strong>${esc(CODE)}</strong> only. ` : 'Everything in the sheet. '}Round is <strong>${state}</strong>. Locked in: <strong>${rows.length}</strong>${
      rows.length ? '' : ' — nobody has locked yet'}. Survey answered: <strong>${surveyRows.length}</strong>.</p>`;

    // Before anyone locks there is nothing to report, and a page of zeros reads as a fault.
    if (!rows.length) {
      out.innerHTML = `${warning}${header}
        <p>This updates itself every 15 seconds. Numbers appear as people lock.</p>`;
      return;
    }

    out.innerHTML = `
      ${warning}${header}
      <h2>The prediction — who read the room best</h2>
      <table><tr><th>#</th><th>Name</th><th>Points</th></tr>
        ${stats.leaderboard.map(r => `<tr><td>${r.rank}</td><td>${esc(r.participant)}</td><td>${r.total}</td></tr>`).join('')}
      </table>
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

      <h2>Every player's answers</h2>
      <p class="note">Ranked as above. "Player said" is who they predicted the room would pick and the share they gave; their own vote is in brackets.</p>
      ${playerCards(stats, crowd)}

      ${surveySection()}

      <details><summary>What the room said, matchup by matchup</summary>
      ${MATCHUPS.map(m => {
        const c = crowd[m.id];
        return `<h3>${esc(m.a.name)} v ${esc(m.b.name)}</h3>
          <table>
            <tr><th>Question</th><th>How the room voted</th></tr>
            <tr><td>Who is the one</td><td>${formatCounts(c.overallCounts, m)}${
              c.overallTied ? ' <strong>— tied, so this question scores zero for everyone</strong>' : ''}</td></tr>
            ${CATEGORIES.map(cat =>
              `<tr><td>${esc(cat.label)}</td><td>${formatCounts(c.categories[cat.key], m)}</td></tr>`).join('')}
          </table>`;
      }).join('')}
      </details>`;
  } catch (err) {
    // a refused key sends the presenter back to the login; anything else is shown in place
    if (/key/i.test(err.message)) showLogin(`${err.message}. Check it and try again.`);
    else out.innerHTML = `<p class="warn">Could not load: ${esc(err.message)}. Nothing was changed. It will retry by itself.</p>`;
  } finally {
    refreshing = false;
  }
}

document.getElementById('loginForm').onsubmit = (e) => { e.preventDefault(); refresh(); };
document.getElementById('logout').onclick = () => {
  try { localStorage.removeItem(KEY_STORE); } catch (e) {}
  keyInput.value = ''; out.innerHTML = ''; showLogin('');
};
document.getElementById('close').onclick = async () => {
  if (!key()) { out.innerHTML = '<p class="warn">The presenter key is needed to do that.</p>'; return; }
  if (!confirm('Close the round now? Nobody who has not locked will be able to.')) return;
  try {
    const r = await setState(SESSION_LABEL, 'closed', key());
    if (!r || r.ok !== true) throw new Error((r && r.error) || 'the server refused it');
  } catch (err) {
    out.innerHTML = `<p class="warn">Could not close the round: ${esc(err.message)}.</p>`;
    return;
  }
  refresh();
};
document.getElementById('reset').onclick = async () => {
  if (!key()) { out.innerHTML = '<p class="warn">The presenter key is needed to do that.</p>'; return; }
  if (!confirm('Wipe the sheet? Every answer, survey and round state goes. Export first if you want to keep them.')) return;
  if (!confirm('This cannot be undone. Wipe everything now?')) return;
  try {
    const r = await resetSheet(key());
    if (!r || r.ok !== true) throw new Error((r && r.error) || 'the server refused it');
  } catch (err) {
    out.innerHTML = `<p class="warn">Could not wipe the sheet: ${esc(err.message)}.</p>`;
    return;
  }
  refresh();
};
document.getElementById('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ session: CODE || 'all', answers: rows, survey: surveyRows }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `the-one-${CODE || 'all'}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};
setInterval(() => { if (key() && login.hidden) refresh(); }, 15000);
if (key()) refresh();
