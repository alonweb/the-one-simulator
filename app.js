import { MATCHUPS, CATEGORIES } from './config.js';
import { submit, fetchState, fetchRows, normalizeCode } from './store.js';
import { escapeHtml as esc } from './html.js';
import { crowdResult, leaderboard } from './stats.js';
import { emptyDraft, setAnswer, isComplete, saveDraft, loadDraft } from './draft.js';

const el = document.getElementById('screen');
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
    <h1>THE ONE</h1>
    <p>Enter the code the presenter gave you, and your name.</p>
    <p><input id="code" placeholder="Session code" style="width:100%;font-size:18px;padding:10px"></p>
    <p><input id="name" placeholder="Your name" style="width:100%;font-size:18px;padding:10px"></p>
    <button id="start">Start</button>
    <p class="err" id="joinErr"></p>`;
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
    <p>Matchup ${state.index + 1} of ${MATCHUPS.length}</p>
    <div class="pair">
      <div><img src="${m.a.photo}" alt="${m.a.name}"><p>${m.a.name}</p></div>
      <div><img src="${m.b.photo}" alt="${m.b.name}"><p>${m.b.name}</p></div>
    </div>
    <h2>Who is the one?</h2>
    <p>Your own pick</p>
    <button data-q="overall" data-f="vote" data-v="${m.a.id}" ${on(m.a.id, entry.overall?.vote)}>${m.a.name}</button>
    <button data-q="overall" data-f="vote" data-v="${m.b.id}" ${on(m.b.id, entry.overall?.vote)}>${m.b.name}</button>
    <p>Who will the room pick?</p>
    <button data-q="overall" data-f="predicted" data-v="${m.a.id}" ${on(m.a.id, entry.overall?.predicted)}>${m.a.name}</button>
    <button data-q="overall" data-f="predicted" data-v="${m.b.id}" ${on(m.b.id, entry.overall?.predicted)}>${m.b.name}</button>
    ${CATEGORIES.map(c => renderCategory(m, c, entry.categories[c.key])).join('')}
    <button id="next">${state.index + 1 === MATCHUPS.length ? 'Review' : 'Next matchup'}</button>`;
  wirePlay(m);
}

function renderCategory(m, c, a) {
  const onPred = (who) => `aria-pressed="${a && a.contestant === who ? 'true' : 'false'}"`;
  const onVote = (who) => `aria-pressed="${a && a.vote === who ? 'true' : 'false'}"`;
  return `
    <h2>${c.label}</h2>
    <p>Your own pick</p>
    <button data-q="${c.key}" data-f="vote" data-v="${m.a.id}" ${onVote(m.a.id)}>${m.a.name}</button>
    <button data-q="${c.key}" data-f="vote" data-v="${m.b.id}" ${onVote(m.b.id)}>${m.b.name}</button>
    <p>Who will the room pick, and by how much?</p>
    <button data-q="${c.key}" data-f="contestant" data-v="${m.a.id}" ${onPred(m.a.id)}>${m.a.name}</button>
    <button data-q="${c.key}" data-f="contestant" data-v="${m.b.id}" ${onPred(m.b.id)}>${m.b.name}</button>
    <input type="range" min="51" max="100" value="${a && a.share ? a.share : 51}" data-q="${c.key}" data-f="share">
    <p>${a && typeof a.share === 'number' ? a.share : 51}% of the room</p>`;
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
  el.innerHTML = `
    <h1>Review</h1>
    <p>${done ? 'Everything is answered.' : 'Some answers are missing. Go back and finish them.'}</p>
    <pre style="white-space:pre-wrap">${JSON.stringify(state.draft, null, 1)}</pre>
    <button id="back">Back</button>
    <button id="lock" ${done ? '' : 'disabled'}>Lock. This cannot be undone.</button>
    <p class="err" id="lockErr"></p>`;
  document.getElementById('back').onclick = () => { state.index = 0; go('play'); };
  document.getElementById('lock').onclick = async () => {
    const btn = document.getElementById('lock');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await submit({ sessionCode: state.sessionCode, participant: state.participant,
                     answers: state.draft, submissionId: state.submissionId });
      go('locked');
    } catch (err) {
      document.getElementById('lockErr').textContent =
        'Did not save. Tap to try again; it cannot double-count.';
      btn.disabled = false; btn.textContent = 'Lock. This cannot be undone.';
    }
  };
}

function renderLocked() {
  el.innerHTML = `<h1>Locked</h1><p>Your predictions are in. Waiting for the presenter to reveal the results.</p>`;
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
    <h1>Results</h1>
    <p>${me ? `You scored <strong>${me.total}</strong> and came <strong>${me.rank}</strong> of ${board.length}.`
            : 'Your submission was not found.'}</p>
    ${me ? MATCHUPS.map(m => {
      const s = me.perMatchup[m.id];
      if (!s) return '';
      const c = crowd[m.id];
      const winner = [m.a, m.b].find(x => x.id === c.overallWinner);
      return `<h3>${m.a.name} v ${m.b.name} — ${s.total} points</h3>
        <p>Who is the one: ${c.overallTied ? 'the room tied, so nobody scored'
          : `the room picked ${winner ? winner.name : 'nobody'}, you scored ${s.overall}`}</p>
        <ul>${Object.entries(s.categories).map(([k, r]) =>
          `<li>${label(k)}: ${r.points} — ${why(r)}</li>`).join('')}</ul>`;
    }).join('') : ''}
    <h2>Leaderboard</h2>
    <ol>${board.map(r => `<li>${esc(r.participant)} — ${r.total}</li>`).join('')}</ol>`;
}

render();
