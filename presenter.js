import { MATCHUPS, CATEGORIES, SURVEY, SESSION_LABEL, WAKE } from './config.js';
import { fetchRows, fetchSurvey, fetchSession, setState, resetSheet, release, mergeByPlayer,
         normalizeCode, wake } from './store.js';
import { escapeHtml as esc } from './html.js';
import { formatCounts, answerRows } from './present-format.js';
import { crowdResult, sessionStats, contestantStanding, boardTable } from './stats.js';
import { surveyTable } from './survey.js';

// The page shows the whole sheet. ?code=X on the URL narrows it to one session's rows.
// Releasing and closing apply to SESSION_LABEL, which is what every new lock carries.
const CODE = new URLSearchParams(location.search).get('code') || '';
// an older session viewed through ?code= predates releases: every matchup counts
const LEGACY_VIEW = !!CODE && normalizeCode(CODE) !== normalizeCode(SESSION_LABEL);

const out = document.getElementById('out');
const keyInput = document.getElementById('key');
const login = document.getElementById('login');
const statsEl = document.getElementById('stats');
const loginErr = document.getElementById('loginErr');
const projector = document.getElementById('projector');

function showStats() { login.hidden = true; statsEl.hidden = false; }
function showLogin(message) {
  statsEl.hidden = true; login.hidden = false;
  loginErr.innerHTML = message ? `<p class="warn">${esc(message)}</p>` : '';
}
let rows = [];        // raw, one per lock, for the export
let players = [];     // one per player, a player's matchup rows joined
let surveyRows = [];
let live = [];        // the released matchups, in matchup order
let board = [];

function key() { return keyInput.value.trim(); }

// The key stays on the presenter's own device. It is remembered so a mid-session
// refresh does not lose it, and it is only ever sent to our own endpoint.
const KEY_STORE = 'theone.presenterKey';
try { keyInput.value = localStorage.getItem(KEY_STORE) || ''; } catch (e) {}
keyInput.oninput = () => { try { localStorage.setItem(KEY_STORE, keyInput.value); } catch (e) {} };

function buildCrowd(rows, matchups) {
  const keys = CATEGORIES.map(c => c.key);
  const crowd = {};
  for (const m of matchups) crowd[m.id] = crowdResult(rows, m.id, keys, [m.a.id, m.b.id]);
  return crowd;
}

const numberOf = (m) => MATCHUPS.indexOf(m) + 1;
const pair = (m) => `<img class="thumb" src="${esc(m.a.photo)}" alt="">${esc(m.a.name)} v <img class="thumb" src="${esc(m.b.photo)}" alt="">${esc(m.b.name)}`;

function competitions(released, allCrowd) {
  return `<h2>Competitions</h2>
    <p class="note">Release a matchup and every waiting phone opens it within seconds. Release one or several;
      players answer them in matchup order, one lock each. A release cannot be taken back.</p>
    <div class="comps">${MATCHUPS.map(m => {
      const on = released.includes(m.id);
      const n = allCrowd[m.id] ? allCrowd[m.id].voters : 0;
      return `<div class="comp ${on ? 'on' : ''}">
        <span class="num">${numberOf(m)}</span>
        <span class="who">${pair(m)}</span>
        <span class="count">${n} locked</span>
        ${on ? '<span class="flag">Released</span>'
             : `<button class="cta release" data-release="${esc(m.id)}">Release</button>`}
      </div>`;
    }).join('')}</div>`;
}

function boardSection() {
  if (!live.length) return `<h2>The board</h2><p class="note">Nothing released yet. The board fills in as players lock released matchups.</p>`;
  if (!board.length) return `<h2>The board</h2><p class="note">Nobody has locked a released matchup yet.</p>`;
  return `<h2>The board — after matchup ${live.map(numberOf).join(', ')}</h2>
    <table><tr><th>#</th><th>Name</th>${live.map(m => `<th>${numberOf(m)}</th>`).join('')}<th>Total</th></tr>
      ${board.map(r => `<tr><td>${r.rank}</td><td><a href="#player-${esc(r.submissionId)}">${esc(r.participant)}</a></td>
        ${r.cells.map(c => `<td>${c === null ? '—' : c}</td>`).join('')}<td><strong>${r.total}</strong></td></tr>`).join('')}
    </table>
    <p class="note">One column per released matchup, scored against the room's votes on that matchup only. — means the player has not locked it. Tap a name for their answers.</p>`;
}

/** The board alone, large, for the room's screen: no answers and no survey on it. */
function renderProjector() {
  if (projector.hidden) return;
  const many = board.length > 12;
  projector.innerHTML = `<div class="proj-head">
      <h1 class="logo">THE ONE <span class="badge">1</span></h1>
      <p>${live.length ? `The board · after matchup ${live.map(numberOf).join(', ')}` : 'The board'}</p>
      <button id="projClose" class="ghost">Close</button></div>
    ${board.length
      ? `<ol class="proj-board ${many ? 'two' : ''}">${board.map(r => `<li>
          <span class="rank">${r.rank}</span><span class="name">${esc(r.participant)}</span>
          <span class="total">${r.total}</span></li>`).join('')}</ol>`
      : '<p class="proj-empty">Waiting for the first locks.</p>'}`;
  document.getElementById('projClose').onclick = closeProjector;
}

function openProjector() {
  projector.hidden = false;
  renderProjector();
  try { const p = projector.requestFullscreen && projector.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function closeProjector() {
  projector.hidden = true;
  if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !projector.hidden) projector.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !projector.hidden) closeProjector(); });
document.getElementById('project').onclick = openProjector;

// "Start meeting". An idle server took up to 11 s to answer its first request (2026-09-29), and a
// player saw a stuck Lock button. This wakes both games' servers, shows how fast each answered,
// and asks them again every minute while this page is open. It writes nothing, releases nothing.
const KEEP_AWAKE_MS = 60000;
let keepAwake = null;
async function wakeAll() {
  const results = await Promise.all(WAKE.map(async (s) => ({ label: s.label, r: await wake(s.endpoint, s.code) })));
  const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('wakeStatus').innerHTML = results.map(({ label, r }) => r.ok
    ? `<strong>${esc(label)}</strong>: awake, answered in ${(r.ms / 1000).toFixed(1)} s`
    : `<strong>${esc(label)}</strong>: not answering (${esc(r.error)}), asking again`).join(' · ')
    + ` · checked at ${esc(at)}. Kept awake while this page is open.`;
  return results.every(x => x.r.ok);
}
document.getElementById('startMeeting').onclick = async () => {
  const btn = document.getElementById('startMeeting');
  btn.disabled = true; btn.classList.add('busy');
  btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Waking the servers…';
  const ok = await wakeAll();
  btn.classList.remove('busy'); btn.disabled = false;
  btn.textContent = ok ? 'Servers awake · check again' : 'Start meeting · try again';
  clearInterval(keepAwake);
  keepAwake = setInterval(wakeAll, KEEP_AWAKE_MS);
};

function playerCards(stats, crowd) {
  const byId = {};
  for (const r of players) byId[r.submissionId] = r;
  return stats.leaderboard.map(p => {
    const raw = byId[p.submissionId];
    const subtotals = live.map(m => (p.perMatchup[m.id] ? p.perMatchup[m.id].total : 0));
    return `<div class="player" id="player-${esc(p.submissionId)}">
      <h3><span>${p.rank}. ${esc(p.participant)}</span><span class="pts">${p.total} pts <a href="#top" class="up">top</a></span></h3>
      <p class="note">Matchups ${subtotals.join(' + ')} = <strong>${p.total}</strong></p>
      ${live.map(m => {
        const s = p.perMatchup[m.id];
        const lines = answerRows(m, raw && raw.answers && raw.answers[m.id], crowd[m.id], s, CATEGORIES);
        return `<h4>${numberOf(m)}. ${pair(m)} <span class="pts">${lines.map(l => l.points).join(' + ')} = ${s ? s.total : 0}</span></h4>
          <table><tr><th>Question</th><th>Player said</th><th>Room said</th><th>Points</th><th>Why</th></tr>
          ${lines.map(l => `<tr><td>${esc(l.question)}</td><td>${esc(l.yours)}</td><td>${esc(l.room)}</td><td class="pts">${l.points}</td><td>${esc(l.why)}</td></tr>`).join('')}
          </table>`;
      }).join('')}
    </div>`;
  }).join('');
}

function surveySection() {
  const t = surveyTable(surveyRows, SURVEY);
  if (!t.rows.length) return `<h2>The survey</h2><p class="note">No survey answers yet. They arrive from the survey page, which players open after finishing both games.</p>`;
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
    players = mergeByPlayer(rows);
    showStats();
    // the survey tab is created by the first answer; a missing one is not an error
    surveyRows = await fetchSurvey(CODE, key()).catch(() => []);
    const session = await fetchSession(SESSION_LABEL).catch(() => ({ state: 'unknown', released: [] }));
    live = LEGACY_VIEW ? MATCHUPS : MATCHUPS.filter(m => session.released.includes(m.id));
    const allCrowd = buildCrowd(players, MATCHUPS);
    const crowd = buildCrowd(players, live);
    const stats = sessionStats(players, crowd);
    board = boardTable(stats.leaderboard, live.map(m => m.id))
      // a player who has locked only unreleased matchups (a test row) has nothing on the board
      .filter(r => r.cells.some(c => c !== null));
    renderProjector();

    const pending = CATEGORIES.filter(c => c.needsReplacement);
    const warning = pending.length
      ? `<p class="warn">${pending.map(c => c.label).join(' and ')} still need replacing in config.js — they are judged from video, and there is none for this session.</p>` : '';
    const header = `<p>${CODE ? `Showing session <strong>${esc(CODE)}</strong> only. ` : 'Everything in the sheet. '}Round is <strong>${session.state}</strong>. Players who have locked something: <strong>${players.length}</strong>. Survey answered: <strong>${surveyRows.length}</strong>.</p>`;
    const strip = LEGACY_VIEW
      ? '<p class="note">An older session: every matchup is counted, and releases apply only to the live session.</p>'
      : competitions(session.released, allCrowd);

    if (!live.length || !board.length) {
      out.innerHTML = `${warning}${header}${strip}${boardSection()}${surveyRows.length ? surveySection() : ''}
        <p class="note">This updates itself every 10 seconds.</p>`;
      return;
    }

    out.innerHTML = `
      ${warning}${header}${strip}${boardSection()}
      <p>Exact category hits: ${(stats.exactRate * 100).toFixed(1)}%.
         Average error predicting the room: ${stats.meanAbsoluteError.toFixed(1)} points.
         ${stats.ties.length ? 'Tied matchups: ' + stats.ties.join(', ') : 'No ties.'}</p>
      <p>Hardest to predict: ${stats.categoryDifficulty.length
        ? stats.categoryDifficulty.map(d => `${(CATEGORIES.find(c => c.key === d.key) || {}).label || d.key} (average error ${d.meanAbsoluteError.toFixed(1)})`).join(', ')
        : 'no data yet'}.</p>

      <h2>The contest — how the contestants did</h2>
      <p class="note">This is the room's own vote, not the predictions, on the released matchups. <strong>Crowd share</strong> is the share of the room
        that picked her as the one in her matchup; above 50% she won it. Each <strong>category</strong> shows the share of the room
        that picked her for that question, and a tick where hers was the larger share. <strong>Won</strong> counts those ticks.</p>
      <table class="contest"><tr><th>Contestant</th><th>Against</th><th>Result</th><th>Crowd share</th>
        ${CATEGORIES.map(cat => `<th>${esc(cat.label)}</th>`).join('')}<th>Won</th></tr>
        ${contestantStanding(players, live, CATEGORIES).map(c =>
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
      ${live.map(m => {
        const c = crowd[m.id];
        return `<h3>${numberOf(m)}. ${pair(m)}</h3>
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

// the strip is redrawn on every refresh, so its buttons are handled here, once
out.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-release]');
  if (!btn) return;
  const m = MATCHUPS.find(x => x.id === btn.dataset.release);
  if (!m) return;
  if (!confirm(`Release matchup ${numberOf(m)}, ${m.a.name} v ${m.b.name}? Every waiting phone opens it within seconds. It cannot be taken back.`)) return;
  btn.disabled = true; btn.textContent = 'Releasing…';
  try {
    const r = await release(SESSION_LABEL, m.id, key());
    if (!r || r.ok !== true) throw new Error((r && r.error) || 'the server refused it');
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Release';
    alert(`Could not release matchup ${numberOf(m)}: ${err.message}.`);
    return;
  }
  refresh();
});

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
  if (!confirm('Wipe the sheet? Every answer, survey, release and round state goes. Export first if you want to keep them.')) return;
  if (!confirm('This cannot be undone. Wipe everything now?')) return;
  try {
    const r = await resetSheet(key(), SESSION_LABEL);
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
setInterval(() => { if (key() && login.hidden) refresh(); }, 10000);
if (key()) refresh();
