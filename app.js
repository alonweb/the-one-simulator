import { MATCHUPS, CATEGORIES } from './config.js';
import { submit, fetchState, fetchRows, normalizeCode } from './store.js';
import { escapeHtml as esc } from './html.js';
import { summariseMatchup } from './present-format.js';
import { crowdResult, leaderboard, contestantStanding } from './stats.js';
import { emptyDraft, setAnswer, isComplete, saveDraft, loadDraft, clearDraft, wantsReset, shapeOf, draftMatches, clearMatchup } from './draft.js';

const el = document.getElementById('screen');

// ?reset=1 wipes this device and starts over. Deliberately not a visible control during
// play: a participant who resets mid-round would submit twice under a new identity.
if (wantsReset(location.search)) {
  clearDraft();
  location.replace(location.pathname);
}

const ordinal = (n) => n + (['th','st','nd','rd'][(n%100-n%10!=10)*(n%10<4)*n%10] || 'th');
function freshState() {
  return {
    shape: shapeOf(MATCHUPS, CATEGORIES),
    screen: 'join', sessionCode: '', participant: '',
    submissionId: 'sub-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
    index: 0, draft: emptyDraft(MATCHUPS, CATEGORIES)
  };
}

// A draft written against different matchups or categories cannot be resumed against
// these ones. Silently starting fresh beats leaving the device stuck on a blank screen.
const saved = loadDraft();
const state = draftMatches(saved, MATCHUPS, CATEGORIES) ? saved : freshState();
if (saved && state !== saved) clearDraft();

function go(screen) { state.screen = screen; saveDraft(state); render(); }
function set(matchupId, key, value) {
  state.draft = setAnswer(state.draft, matchupId, key, value);
  saveDraft(state); render();
}

function render() {
  try { return route(); }
  catch (err) {
    el.innerHTML = `
      <p class="eyebrow">Something went wrong</p>
      <div class="card"><p class="err">${esc(err.message || String(err))}</p>
      <p class="note">Your answers may still be on this device. Starting again clears them.</p></div>
      <button id="recover" class="cta">Start again</button>`;
    document.getElementById('recover').onclick = () => { clearDraft(); location.replace(location.pathname); };
  }
}

function route() {
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
    <p class="tagline">Pick. Predict. Compete.</p>
    <div class="q">
      <label for="code">Session code</label>
      <input id="code" placeholder="The presenter will say it">
      <p class="ask" style="margin-top:16px"><label for="name">Your name</label></p>
      <input id="name" placeholder="How you want to appear on the board">
      <button id="start" class="cta">Start</button>
      <p class="err" id="joinErr"></p>
    </div>
    <p class="note">Five matchups. On each one you make two calls: who <strong>you</strong> prefer, and who you think <strong>everyone else</strong> will choose. Points come from reading the room, not from your own taste.</p>`;
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
  const summary = summariseMatchup(m, entry, CATEGORIES);
  const gaps = summary.lines.filter(l => !l.answered);
  const on = (who, chosen) => `aria-pressed="${chosen === who ? 'true' : 'false'}"`;
  el.innerHTML = `
    <p class="eyebrow">Matchup ${state.index + 1} of ${MATCHUPS.length}</p>
    <div class="pair">
      <div><img src="${m.a.photo}" alt="${m.a.name}"><p>${m.a.name}</p></div>
      <div><img src="${m.b.photo}" alt="${m.b.name}"><p>${m.b.name}</p></div>
    </div>
    <div class="q" id="q-overall">
      <h3>Who is the one?</h3>
      <p class="ask">Your pick — who do you prefer?</p>
      <div class="choices">
        <button data-q="overall" data-f="vote" data-v="${m.a.id}" ${on(m.a.id, entry.overall?.vote)}>${m.a.name}</button>
        <button data-q="overall" data-f="vote" data-v="${m.b.id}" ${on(m.b.id, entry.overall?.vote)}>${m.b.name}</button>
      </div>
      <p class="ask">Crowd prediction — who will everyone else choose?</p>
      <div class="choices">
        <button data-q="overall" data-f="predicted" data-v="${m.a.id}" ${on(m.a.id, entry.overall?.predicted)}>${m.a.name}</button>
        <button data-q="overall" data-f="predicted" data-v="${m.b.id}" ${on(m.b.id, entry.overall?.predicted)}>${m.b.name}</button>
      </div>
    </div>
    ${CATEGORIES.map(c => renderCategory(m, c, entry.categories[c.key])).join('')}
    ${gaps.length ? `<div class="todo">
      <p><strong>${gaps.length} still to answer on this matchup.</strong></p>
      <ul>${gaps.map(g => `<li><button class="jump" data-k="${g.key}">${esc(g.text.split(' — ')[0])}</button></li>`).join('')}</ul>
    </div>` : ''}
    <div class="nav">
      ${state.index > 0 ? '<button id="prev" class="ghost">Previous matchup</button>' : ''}
      <button id="next" class="cta" ${gaps.length ? 'disabled' : ''}>${
        gaps.length ? 'Answer all five first'
                    : state.index + 1 === MATCHUPS.length ? 'Review my answers' : 'Next matchup'}</button>
    </div>
    <div class="resets">
      <button id="clearOne" class="ghost small">Clear this matchup</button>
      <button id="startOver" class="ghost small">Start from the beginning</button>
    </div>`;
  wirePlay(m, gaps);
}

function renderCategory(m, c, a) {
  const onPred = (who) => `aria-pressed="${a && a.contestant === who ? 'true' : 'false'}"`;
  const onVote = (who) => `aria-pressed="${a && a.vote === who ? 'true' : 'false'}"`;
  const share = a && typeof a.share === 'number' ? a.share : 51;
  const who = a && a.contestant ? (a.contestant === m.a.id ? m.a.name : m.b.name) : 'them';
  return `
    <div class="q" id="q-${c.key}">
      <h3>${c.label}</h3>
      ${c.hint ? `<p class="hint">${c.hint}</p>` : ''}
      <p class="ask">Your pick</p>
      <div class="choices">
        <button data-q="${c.key}" data-f="vote" data-v="${m.a.id}" ${onVote(m.a.id)}>${m.a.name}</button>
        <button data-q="${c.key}" data-f="vote" data-v="${m.b.id}" ${onVote(m.b.id)}>${m.b.name}</button>
      </div>
      <p class="ask">Crowd prediction — who, and by how much?</p>
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

function wirePlay(m, gaps) {
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
  const prev = document.getElementById('prev');
  if (prev) prev.onclick = () => { state.index--; go('play'); };

  for (const g of gaps) {
    const block = document.getElementById('q-' + g.key);
    if (block) block.classList.add('unanswered');
  }
  el.querySelectorAll('.todo button.jump').forEach(b => {
    b.onclick = () => {
      const target = document.getElementById('q-' + b.dataset.k);
      if (target) { target.classList.add('needed'); target.scrollIntoView({ block: 'center' }); }
    };
  });

  // a jump from the review lands on the exact question that was missing
  if (state.focus) {
    const target = document.getElementById('q-' + state.focus);
    state.focus = null; saveDraft(state);
    if (target) {
      target.classList.add('needed');
      target.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }
  document.getElementById('clearOne').onclick = () => {
    if (!confirm(`Clear your answers for ${m.a.name} v ${m.b.name}? The other matchups are not touched.`)) return;
    state.draft = clearMatchup(state.draft, m.id);
    saveDraft(state); render();
  };
  document.getElementById('startOver').onclick = () => {
    if (!confirm('Clear every answer and go back to the start? This cannot be undone.')) return;
    // the submissionId is kept on purpose: the server rejects a repeat of it, so starting
    // over can never put a second entry for this device into the sheet
    state.draft = emptyDraft(MATCHUPS, CATEGORIES);
    state.index = 0;
    go('join');
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
      <div class="card ${s.complete ? '' : 'incomplete'}">
        <h3>${s.title}</h3>
        <ul>${s.lines.map(l => l.answered
          ? `<li>${esc(l.text)}</li>`
          : `<li class="missing">${esc(l.text)} <button class="jump" data-m="${l.matchupId}" data-k="${l.key}">Answer it</button></li>`
        ).join('')}</ul>
      </div>`).join('')}
    <button id="back" class="ghost">Back to the matchups</button>
    <button id="lock" class="cta" ${done ? '' : 'disabled'}>Lock my answers</button>
    <p class="err" id="lockErr"></p>`;
  document.getElementById('back').onclick = () => { state.index = 0; go('play'); };
  el.querySelectorAll('button.jump').forEach(b => {
    b.onclick = () => {
      state.index = MATCHUPS.findIndex(m => m.id === b.dataset.m);
      state.focus = b.dataset.k;
      go('play');
    };
  });
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
    <h2>The contest</h2>
    <p class="note">The other competition: how the contestants did with the crowd.</p>
    <ol class="board">${contestantStanding(rows, MATCHUPS, CATEGORIES).map(c =>
      `<li><span>${esc(c.name)} <small class="note">v ${esc(c.opponent)}</small></span>
        <span class="pts">${c.tied ? 'tied' : c.wonOverall ? 'won' : 'lost'} · ${c.overallShare}% · ${c.categoriesWon}/${c.categoriesTotal}</span></li>`).join('')}</ol>

    <h2>The prediction</h2>
    <p class="note">Who read the room best.</p>
    <ol class="board" id="board">${board.map(r =>
      `<li class="${r.submissionId === state.submissionId ? 'me' : ''}">${esc(r.participant)}<span class="pts">${r.total}</span></li>`).join('')}</ol>
    <button id="again" class="ghost">Start again on this phone</button>
    <p class="note">Only do this once the round is over. It clears your answers from this device.</p>`;
  const again = document.getElementById('again');
  if (again) again.onclick = () => { clearDraft(); location.replace(location.pathname); };
}

render();
