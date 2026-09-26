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
    const subtotals = MATCHUPS.map(m => (p.perMatchup[m.id] ? p.perMatchup[m.id].total : 0));
    return `<div class="player" id="player-${esc(p.submissionId)}">
      <h3><span>${p.rank}. ${esc(p.participant)}</span><span class="pts">${p.total} pts <a href="#top" class="up">top</a></span></h3>
      <p class="note">Matchups ${subtotals.join(' + ')} = <strong>${p.total}</strong></p>
      ${MATCHUPS.map(m => {
        const s = p.perMatchup[m.id];
        const lines = answerRows(m, raw && raw.answers && raw.answers[m.id], crowd[m.id], s, CATEGORIES);
        return `<h4><img class="thumb" src="${esc(m.a.photo)}" alt="">${esc(m.a.name)} v <img class="thumb" src="${esc(m.b.photo)}" alt="">${esc(m.b.name)} <span class="pts">${lines.map(l => l.points).join(' + ')} = ${s ? s.total : 0}</span></h4>
          <table><tr><th>Question</th><th>Player said</th><th>Room said</th><th>Points</th><th>Why</th></tr>
          ${lines.map(l => `<tr><td>${esc(l.question)}</td><td>${esc(l.yours)}</td><td>${esc(l.room)}</td><td class="pts">${l.points}</td><td>${esc(l.why)}</td></tr>`).join('')}
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
        ${stats.leaderboard.map(r => `<tr><td>${r.rank}</td><td><a href="#player-${esc(r.submissionId)}">${esc(r.participant)}</a></td><td>${r.total}</td></tr>`).join('')}
      </table>
      <p class="note">Tap a name to jump to that player's answers and points.</p>
      <p>Exact category hits: ${(stats.exactRate * 100).toFixed(1)}%.
         Average error predicting the room: ${stats.meanAbsoluteError.toFixed(1)} points.
         ${stats.ties.length ? 'Tied matchups: ' + stats.ties.join(', ') : 'No ties.'}</p>
      <p>Hardest to predict: ${stats.categoryDifficulty.length
        ? stats.categoryDifficulty.map(d => `${(CATEGORIES.find(c => c.key === d.key) || {}).label || d.key} (average error ${d.meanAbsoluteError.toFixed(1)})`).join(', ')
        : 'no data yet'}.</p>

      <h2>The contest — how the contestants did</h2>
      <p class="note">This is the room's own vote, not the predictions. <strong>Crowd share</strong> is the share of the room
        that picked her as the one in her matchup; above 50% she won it. Each <strong>category</strong> shows the share of the room
        that picked her for that question, and a tick where hers was the larger share. <strong>Won</strong> counts those ticks.</p>
      <table class="contest"><tr><th>Contestant</th><th>Against</th><th>Result</th><th>Crowd share</th>
        ${CATEGORIES.map(cat => `<th>${esc(cat.label)}</th>`).join('')}<th>Won</th></tr>
        ${contestantStanding(rows, MATCHUPS, CATEGORIES).map(c =>
          `<tr><td><img class="thumb" src="${esc(c.photo)}" alt=""><strong>${esc(c.name)}</strong></td>
           <td><img class="thumb" src="${esc(c.opponentPhoto)}" alt="">${esc(c.opponent)}</td>
           <td>${c.tied ? 'tied' : c.wonOverall ? 'won' : 'lost'}</td>
           <td>${c.overallShare}%</td>
           ${CATEGORIES.map(cat => { const b = c.byCategory[cat.key] || {};
             return `<td class="${b.won ? 'won' : ''}">${b.share}%${b.won ? ' ✓' : b.tied ? ' =' : ''}</td>`; }).join('')}
           <td><strong>${c.categoriesWon}</strong> of ${c.categoriesTotal}</td></tr>`).join('')}
      </table>

      <h2>Every player's answers, and how the points add up</h2>
      <p class="note">Ranked as above. "Player said" is who they predicted the room would pick and the share they gave; their own vote is in brackets.
        The rules: right overall winner +2. Each category: the room's share for that contestant falls in one of five bands
        (50–59, 60–69, 70–79, 80–89, 90–100); same band as the player's number +1, and the exact number +5 on top.
        A share below 51, a tied room, or a contestant nobody picked scores 0. Most a matchup can give is 26.</p>
      ${playerCards(stats, crowd)}

      ${surveySection()}

      <details><summary>What the room said, matchup by matchup</summary>
      ${MATCHUPS.map(m => {
        const c = crowd[m.id];
        return `<h3><img class="thumb" src="${esc(m.a.photo)}" alt="">${esc(m.a.name)} v <img class="thumb" src="${esc(m.b.photo)}" alt="">${esc(m.b.name)}</h3>
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
