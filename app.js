import { MATCHUPS, CATEGORIES } from './config.js';
import { submit, fetchState, fetchRows, normalizeCode } from './store.js';
import { escapeHtml as esc } from './html.js';
import { summariseMatchup } from './present-format.js';
import { crowdResult, leaderboard } from './stats.js';
import { emptyDraft, setAnswer, isComplete, saveDraft, loadDraft } from './draft.js';

const el = document.getElementById('screen');
const ordinal = (n) => n + (['th','st','nd','rd'][(n%100-n%10!=10)*(n%10<4)*n%10] || 'th');
const state = loadDraft() || {
  screen: 'join', sessionCode: '', participant: '',
  submissionId: 'sub-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
  index: 0, draft: emptyDraft(MATCHUPS, CATEGORIES)
};

function go(screen) { state.screen = screen; saveDraft(state); render(); }
function set(matchupId, key, value) {
  state.draft = setAnswer(state.draft, matchupId, key, value);
  saveDraft(state); render();
}

function render() {
  if (state.screen === 'join') return renderJoin();
  if (state.screen === 'play') return renderPlay();
  if (state.screen === 'review') return renderReview();
  if (state.screen === 'locked') return renderLocked();
  if (state.screen === 'results') return renderResults();
}

function renderJoin() {
  el.innerHTML = `
    <svg class="crown" viewBox="0 0 64 42" aria-hidden="true" fill="none"><path d="M6 36 L4 10 L18 22 L32 4 L46 22 L60 10 L58 36 Z" fill="#F2B134" stroke="#E09A1E" stroke-width="2.5" stroke-linejoin="round"/></svg>
    <p class="wordmark">THE ONE</p>
    <p class="tagline">Who will be the one?</p>
    <div class="q">
      <label for="code">Session code</label>
      <input id="code" placeholder="The presenter will say it">
      <p class="ask" style="margin-top:16px"><label for="name">Your name</label></p>
      <input id="name" placeholder="How you want to appear on the board">
      <button id="start" class="cta">Start</button>
      <p class="err" id="joinErr"></p>
    </div>
    <p class="note">You will see five matchups. For each one you say who you pick, and who you think the room will pick.</p>`;
  document.getElementById('start').onclick = () => {
    const code = document.getElementById('code').value.trim();
    const name = document.getElementById('name').value.trim();
    if (!code || !name) { document.getElementById('joinErr').textContent = 'Both are needed.'; return; }
    state.sessionCode = normalizeCode(code); state.participant = name; go('play');
  };
}

function renderPlay() {
  const m = MATCHUPS[state.index];
  const entry = state.draft[m.id];
  const on = (who, chosen) => `aria-pressed="${chosen === who ? 'true' : 'false'}"`;
  el.innerHTML = `
    <p class="eyebrow">Matchup ${state.index + 1} of ${MATCHUPS.length}</p>
    <div class="pair">
      <div><img src="${m.a.photo}" alt="${m.a.name}"><p>${m.a.name}</p></div>
      <div><img src="${m.b.photo}" alt="${m.b.name}"><p>${m.b.name}</p></div>
    </div>
    <div class="q">
      <h3>Who is the one?</h3>
      <p class="ask">Your own pick</p>
      <div class="choices">
        <button data-q="overall" data-f="vote" data-v="${m.a.id}" ${on(m.a.id, entry.overall?.vote)}>${m.a.name}</button>
        <button data-q="overall" data-f="vote" data-v="${m.b.id}" ${on(m.b.id, entry.overall?.vote)}>${m.b.name}</button>
      </div>
      <p class="ask">Who will the room pick?</p>
      <div class="choices">
        <button data-q="overall" data-f="predicted" data-v="${m.a.id}" ${on(m.a.id, entry.overall?.predicted)}>${m.a.name}</button>
        <button data-q="overall" data-f="predicted" data-v="${m.b.id}" ${on(m.b.id, entry.overall?.predicted)}>${m.b.name}</button>
      </div>
    </div>
    ${CATEGORIES.map(c => renderCategory(m, c, entry.categories[c.key])).join('')}
    <button id="next" class="cta">${state.index + 1 === MATCHUPS.length ? 'Review my answers' : 'Next matchup'}</button>`;
  wirePlay(m);
}

function renderCategory(m, c, a) {
  const onPred = (who) => `aria-pressed="${a && a.contestant === who ? 'true' : 'false'}"`;
  const onVote = (who) => `aria-pressed="${a && a.vote === who ? 'true' : 'false'}"`;
  const share = a && typeof a.share === 'number' ? a.share : 51;
  const who = a && a.contestant ? (a.contestant === m.a.id ? m.a.name : m.b.name) : 'them';
  return `
    <div class="q">
      <h3>${c.label}</h3>
      <p class="ask">Your own pick</p>
      <div class="choices">
        <button data-q="${c.key}" data-f="vote" data-v="${m.a.id}" ${onVote(m.a.id)}>${m.a.name}</button>
        <button data-q="${c.key}" data-f="vote" data-v="${m.b.id}" ${onVote(m.b.id)}>${m.b.name}</button>
      </div>
      <p class="ask">Who will the room pick, and by how much?</p>
      <div class="choices">
        <button data-q="${c.key}" data-f="contestant" data-v="${m.a.id}" ${onPred(m.a.id)}>${m.a.name}</button>
        <button data-q="${c.key}" data-f="contestant" data-v="${m.b.id}" ${onPred(m.b.id)}>${m.b.name}</button>
      </div>
      <div class="slider">
        <input type="range" min="51" max="100" value="${share}" data-q="${c.key}" data-f="share"
               aria-label="${c.label}: share of the room">
        <p class="share">${share}%<small>of the room pick ${who}</small></p>
      </div>
    </div>`;
}

function wirePlay(m) {
  el.querySelectorAll('button[data-q]').forEach(b => {
    b.onclick = () => {
      const q = b.dataset.q, f = b.dataset.f, v = b.dataset.v;
      const cur = q === 'overall' ? (state.draft[m.id].overall || {}) : (state.draft[m.id].categories[q] || {});
      set(m.id, q, { ...cur, [f]: v });
    };
  });
  el.querySelectorAll('input[type=range]').forEach(r => {
    r.oninput = () => {
      const q = r.dataset.q;
      const cur = state.draft[m.id].categories[q] || {};
      set(m.id, q, { ...cur, share: Number(r.value) });
    };
  });
  document.getElementById('next').onclick = () => {
    if (state.index + 1 === MATCHUPS.length) go('review');
    else { state.index++; go('play'); }
  };
}

function renderReview() {
  const done = isComplete(state.draft, MATCHUPS, CATEGORIES);
  const summaries = MATCHUPS.map(m => summariseMatchup(m, state.draft[m.id], CATEGORIES));
  const missing = summaries.filter(s => !s.complete).map(s => s.title);
  el.innerHTML = `
    <h1>Review</h1>
    <p>${done ? 'Everything is answered. Check it, then lock.'
              : `Not finished. Still missing: <strong>${missing.join(', ')}</strong>.`}</p>
    ${summaries.map(s => `
      <div class="card">
        <h3>${s.title}</h3>
        <ul>${s.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      </div>`).join('')}
    <button id="back" class="ghost">Back to the matchups</button>
    <button id="lock" class="cta" ${done ? '' : 'disabled'}>Lock my answers</button>
    <p class="err" id="lockErr"></p>`;
  document.getElementById('back').onclick = () => { state.index = 0; go('play'); };
  document.getElementById('lock').onclick = async () => {
    const btn = document.getElementById('lock');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await submit({ sessionCode: state.sessionCode, participant: state.participant,
                     answers: state.draft, submissionId: state.submissionId },
                    { onAttempt: (n) => { btn.textContent = n === 1 ? 'Submitting…' : `Still submitting… (try ${n})`; } });
      go('locked');
    } catch (err) {
      document.getElementById('lockErr').textContent =
        'Did not save. Tap to try again; it cannot double-count.';
      btn.disabled = false; btn.textContent = 'Lock. This cannot be undone.';
    }
  };
}

function renderLocked() {
  el.innerHTML = `
    <div class="banner"><strong>Locked</strong>Your predictions are in and cannot be changed.</div>
    <p class="note">Waiting for the presenter to reveal the results. This screen will change by itself.</p>`;
  const poll = async () => {
    const s = await fetchState(state.sessionCode).catch(() => 'open');
    if (s === 'revealed') go('results'); else setTimeout(poll, 10000);
  };
  poll();
}

async function renderResults() {
  el.innerHTML = '<p>Working out the results…</p>';
  let rows;
  try {
    rows = await fetchRows(state.sessionCode);
  } catch (err) {
    el.innerHTML = '<h1>Results</h1><p class="err">Could not load the results.</p><button id="retry">Try again</button>';
    document.getElementById('retry').onclick = () => renderResults();
    return;
  }
  const keys = CATEGORIES.map(c => c.key);
  const crowd = {};
  for (const m of MATCHUPS) crowd[m.id] = crowdResult(rows, m.id, keys, [m.a.id, m.b.id]);
  const board = leaderboard(rows, crowd);
  const me = board.find(r => r.submissionId === state.submissionId);
  const label = (k) => (CATEGORIES.find(c => c.key === k) || {}).label || k;
  const why = (r) => r.exact ? 'exact hit, 6'
    : r.sameBand ? 'right band, 1'
    : r.reason === 'no-data' ? 'nobody in the room picked your contestant, 0'
    : r.reason === 'below-floor' ? `your contestant only got ${r.actual}%, below the floor, 0`
    : `the room said ${r.actual}%, wrong band, 0`;
  el.innerHTML = `
    <p class="eyebrow">Results</p>
    ${me ? `<div class="banner"><strong>${me.total}</strong>points, ${ordinal(me.rank)} of ${board.length}</div>`
         : '<p class="err">Your submission was not found.</p>'}
    ${me ? MATCHUPS.map(m => {
      const s = me.perMatchup[m.id];
      if (!s) return '';
      const c = crowd[m.id];
      const winner = [m.a, m.b].find(x => x.id === c.overallWinner);
      return `<div class="card">
        <h3>${m.a.name} v ${m.b.name} <span class="score">${s.total}</span></h3>
        <p>Who is the one: ${c.overallTied ? 'the room tied, so nobody scored'
          : `the room picked ${winner ? winner.name : 'nobody'}, you scored ${s.overall}`}</p>
        <ul>${Object.entries(s.categories).map(([k, r]) =>
          `<li><strong>${label(k)}</strong>: ${r.points} — ${why(r)}</li>`).join('')}</ul></div>`;
    }).join('') : ''}
    <h2>Leaderboard</h2>
    <ol class="board">${board.map(r =>
      `<li class="${r.submissionId === state.submissionId ? 'me' : ''}">${esc(r.participant)}<span class="pts">${r.total}</span></li>`).join('')}</ol>`;
}

render();
