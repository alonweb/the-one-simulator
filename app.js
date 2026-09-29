import { MATCHUPS, CATEGORIES, SESSION_LABEL, DONE_KEY, SURVEY_URL, ENDPOINT } from './config.js';
import { submit, fetchSession, lockIdOf, wake } from './store.js';
import { escapeHtml as esc } from './html.js';
import { summariseMatchup } from './present-format.js';
import { markDone, clearDone, finishedAll } from './finish.js';
import { emptyDraft, setAnswer, isComplete, saveDraft, loadDraft, clearDraft, wantsReset,
         shapeOf, draftMatches, clearMatchup } from './draft.js';
import { questionsOf, nextCompetition, nextQuestion, prevQuestion, isQuestionAnswered,
         predictionPatch, sliderOf, photoFor } from './flow.js';

const el = document.getElementById('screen');
const QUESTIONS = questionsOf(CATEGORIES);

// ?reset=1 wipes this device and starts over. Deliberately not a visible control during
// play: a participant who resets mid-round would submit twice under a new identity.
if (wantsReset(location.search)) {
  clearDraft(); clearDone(DONE_KEY);
  location.replace(location.pathname);
}

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l5.5 5.5L20 5" fill="none" stroke="#000" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function freshState() {
  return {
    shape: shapeOf(MATCHUPS, CATEGORIES),
    screen: 'join', sessionCode: SESSION_LABEL, participant: '',
    submissionId: 'sub-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
    index: 0, step: 0, draft: emptyDraft(MATCHUPS, CATEGORIES),
    lockedIds: [], released: [], roundState: 'open'
  };
}

// A draft written against different matchups or categories cannot be resumed against
// these ones. Silently starting fresh beats leaving the device stuck on a blank screen.
const saved = loadDraft();
const state = draftMatches(saved, MATCHUPS, CATEGORIES) ? saved : freshState();
if (saved && state !== saved) clearDraft();
if (typeof state.step !== 'number') state.step = 0;
// a draft saved by an earlier build: it typed a session code and had screens after the
// lock that no longer exist. Everything a player locks now carries the fixed label.
state.sessionCode = SESSION_LABEL;
// an earlier build locked all five matchups at once
if (!Array.isArray(state.lockedIds)) state.lockedIds = state.locked ? MATCHUPS.map(m => m.id) : [];
if (!Array.isArray(state.released)) state.released = [];
if (!state.roundState) state.roundState = 'open';

const isLocked = (id) => state.lockedIds.includes(id);
const allLocked = () => MATCHUPS.every(m => isLocked(m.id));
// the survey moved to its own page; a phone saved on it, or on an older end screen, resumes
if (['locked', 'results', 'survey'].includes(state.screen)) state.screen = allLocked() ? 'done' : 'wait';

function go(screen) { state.screen = screen; state.menu = false; saveDraft(state); render(); window.scrollTo(0, 0); }

/**
 * Moves the player on from wherever they are: into the next released matchup, to the
 * end once all five are locked, or nowhere (false), which means wait.
 */
function advance() {
  if (allLocked()) { go('done'); return true; }
  if (state.roundState !== 'open') return false;
  const i = nextCompetition(MATCHUPS, state.released, state.lockedIds);
  if (i < 0) return false;
  state.index = i; state.step = 0; go('play');
  return true;
}

// The waiting phone asks the server every few seconds which matchups are released.
// The jitter keeps a room of phones from asking in the same instant.
let pollTimer = null;
let polling = false;
function pollSoon(ms) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, ms); }
async function poll() {
  if (state.screen !== 'wait' || polling) return;
  polling = true;
  try {
    const s = await fetchSession(SESSION_LABEL);
    state.released = s.released; state.roundState = s.state; state.offline = false;
    saveDraft(state);
  } catch (e) { state.offline = true; }
  finally { polling = false; }
  if (state.screen !== 'wait' || advance()) return;
  renderWait();
  pollSoon(4000 + Math.random() * 2000);
}

/** The chrome every screen carries: the wordmark, and the menu behind the three lines. */
function chrome() {
  return `<header class="top">
      <h1 class="logo">THE ONE <span class="badge">1</span></h1>
      <button class="menu-btn" id="menuBtn" aria-label="Menu" aria-expanded="${state.menu ? 'true' : 'false'}">
        <span></span><span></span><span></span></button>
    </header>
    ${state.menu ? `<nav class="menu">
      ${state.screen === 'play' ? '<button id="mReview">Review my answers</button>' : ''}
      ${state.screen === 'play' || state.screen === 'review' ? '<button id="mClear">Clear this matchup</button>' : ''}
      ${state.lockedIds.length ? '<button id="mAgain">Start again on this phone</button>' : '<button id="mOver">Start from the beginning</button>'}
    </nav>` : ''}`;
}

function wireChrome(m) {
  const btn = document.getElementById('menuBtn');
  if (btn) btn.onclick = () => { state.menu = !state.menu; saveDraft(state); render(); };
  const review = document.getElementById('mReview');
  if (review) review.onclick = () => go('review');
  // a locked matchup is final, so from the first lock on only a clean start is offered
  const again = document.getElementById('mAgain');
  if (again) again.onclick = () => {
    if (!confirm('Clear this phone and start again? Only for handing it to someone else.')) return;
    clearDraft(); clearDone(DONE_KEY); location.replace(location.pathname);
  };
  const clear = document.getElementById('mClear');
  if (clear) clear.onclick = () => {
    if (!confirm(`Clear your answers for ${m.a.name} v ${m.b.name}? The other matchups are not touched.`)) return;
    state.draft = clearMatchup(state.draft, m.id);
    state.menu = false; state.step = 0; saveDraft(state); render();
  };
  const over = document.getElementById('mOver');
  if (over) over.onclick = () => {
    if (!confirm('Clear every answer and go back to the start? This cannot be undone.')) return;
    // the submissionId is kept on purpose: the server rejects a repeat of it, so starting
    // over can never put a second entry for this device into the sheet
    state.draft = emptyDraft(MATCHUPS, CATEGORIES);
    state.index = 0; state.step = 0;
    go('join');
  };
}

function render() {
  try { return route(); }
  catch (err) {
    el.innerHTML = `${chrome()}
      <p class="eyebrow">Something went wrong</p>
      <div class="card"><p class="err">${esc(err.message || String(err))}</p>
      <p class="note">Your answers may still be on this device. Starting again clears them.</p></div>
      <button id="recover" class="cta">Start again</button>`;
    document.getElementById('recover').onclick = () => { clearDraft(); location.replace(location.pathname); };
  }
}

function route() {
  if (state.screen !== 'wait') clearTimeout(pollTimer);
  if (state.screen === 'join') return renderJoin();
  if (state.screen === 'wait') { renderWait(); if (!polling) pollSoon(0); return; }
  if (state.screen === 'play') return renderPlay();
  if (state.screen === 'review') return renderReview();
  if (state.screen === 'done') return renderDone();
  return renderJoin();
}

function renderJoin() {
  el.innerHTML = `
    <div class="hero"><h1 class="logo">THE ONE <span class="badge">1</span></h1></div>
    <p class="hero-line">Pick. Predict. Compete.</p>
    <div class="join">
      <label for="name">Your name</label>
      <input id="name" placeholder="How you appear on the board">
      <p class="err" id="joinErr"></p>
      <button id="start" class="cta">Start <span class="chev" aria-hidden="true">&rsaquo;</span></button>
    </div>
    <div class="rules">
      <p>Five matchups, five questions each. Every question asks you twice: who <strong>you</strong>
      pick, and how you think <strong>the room</strong> will split.</p>
      <p>The presenter opens each matchup when it is time. Lock it, and wait for the next.</p>
      <p>Points come from reading the room, not from your own taste.</p>
    </div>
    <p class="eyebrow" style="margin-top:22px">Tonight's ten</p>
    <div class="strip">${MATCHUPS.flatMap(m => [m.a, m.b]).map(c =>
      `<img src="${c.photo}" alt="${esc(c.name)}">`).join('')}</div>`;
  document.getElementById('start').onclick = () => {
    const name = document.getElementById('name').value.trim();
    if (!name) { document.getElementById('joinErr').textContent = 'Your name is needed.'; return; }
    state.sessionCode = SESSION_LABEL; state.participant = name;
    state.index = 0; state.step = 0; go('wait');
  };
}

/** Between matchups: nothing to do until the presenter releases the next one. */
function renderWait() {
  const n = state.lockedIds.length;
  const closed = state.roundState !== 'open';
  const banner = closed
    ? `<strong>Closed</strong>The presenter has closed the game. Thank you, ${esc(state.participant)}.`
    : n === 0
      ? `<strong>Ready</strong>Hi ${esc(state.participant)}. The first matchup opens when the presenter releases it.`
      : `<strong>Locked</strong>Matchup ${n} of ${MATCHUPS.length} is in. The next one opens when the presenter releases it.`;
  el.innerHTML = `${chrome()}
    <div class="banner">${banner}</div>
    <div class="strip">${MATCHUPS.map(m => `<div class="slot ${isLocked(m.id) ? 'done' : ''}">
      <img src="${m.a.photo}" alt=""><img src="${m.b.photo}" alt="">
      <span>${isLocked(m.id) ? 'Locked' : 'Matchup ' + (MATCHUPS.indexOf(m) + 1)}</span></div>`).join('')}</div>
    ${closed ? '' : '<p class="note">Keep this page open. It moves on by itself.</p>'}
    ${state.offline ? '<p class="err">Cannot reach the server. Still trying.</p>' : ''}`;
  wireChrome(MATCHUPS[state.index] || MATCHUPS[0]);
}

/** The both-sides readout under the slider, as its own markup so it can be rewritten
    on its own while a finger is still on the slider. */
function splitMarkup(m, pos) {
  return `<span><b>${pos}%</b> ${esc(m.a.name)}</span><span><b>${100 - pos}%</b> ${esc(m.b.name)}</span>`;
}

function renderPlay() {
  const m = MATCHUPS[state.index];
  // a saved screen that points at a matchup already locked, or never released
  if (!m || isLocked(m.id) || !state.released.includes(m.id)) return go('wait');
  state.step = Math.min(Math.max(state.step, 0), QUESTIONS.length - 1);
  const q = QUESTIONS[state.step];
  const entry = state.draft[m.id];
  const ans = (q.key === 'overall' ? entry.overall : entry.categories[q.key]) || null;
  const voted = !!(ans && ans.vote);
  const done = isQuestionAnswered(q.key, ans);
  const pos = sliderOf(q.key, ans, m.a.id);
  const back = prevQuestion(state.step);
  const ahead = nextQuestion(state.step, QUESTIONS.length);

  const shot = (c) => `
    <div class="shot ${voted ? (ans.vote === c.id ? 'chosen' : 'dim') : ''}">
      <div class="frame" data-vote="${c.id}" aria-hidden="true">
        <img src="${photoFor(c, q.key)}" alt=""></div>
      <button class="vote" data-vote="${c.id}" aria-pressed="${voted && ans.vote === c.id}">
        <b>Vote</b> ${esc(c.name)} <span class="chev" aria-hidden="true">&rsaquo;</span></button>
      <button class="zoom" data-zoom="${c.id}" aria-label="See ${esc(c.name)} larger">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none"
             stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6"/></svg></button>
      <span class="tick">${CHECK}</span>
    </div>`;

  const cta = !voted ? 'Pick one first'
            : !done ? 'Move the slider'
            : ahead !== null ? 'Next' : 'Review and lock';

  el.innerHTML = `${chrome()}
    <div class="crumbs">
      ${back !== null ? '<button class="back" id="back"><span aria-hidden="true">&lsaquo;</span> Back</button>' : ''}
      <span class="where">Matchup ${state.index + 1} of ${MATCHUPS.length} &middot; question ${q.n} of ${QUESTIONS.length}</span>
    </div>
    <div class="stage">
      ${shot(m.a)}
      <p class="ask">${q.n}. ${esc(q.label)}</p>
      ${shot(m.b)}
    </div>
    <div class="predict ${voted ? 'live' : 'idle'}">
      <p class="plabel">Predict the crowd</p>
      <input type="range" min="0" max="100" value="${pos}" style="--pos:${pos}%" ${voted ? '' : 'disabled'}
             aria-label="${esc(q.label)}: how the room splits between ${esc(m.a.name)} and ${esc(m.b.name)}">
      <div class="split">${splitMarkup(m, pos)}</div>
    </div>
    <button id="next" class="cta" aria-disabled="${done ? 'false' : 'true'}"><span class="lbl">${cta}</span>
      <span class="chev" aria-hidden="true">&rsaquo;</span></button>`;

  wireChrome(m);
  wirePlay(m, q, back, ahead);
  preload(m);
}

/** Every question shows its own photograph: fetch the matchup's ahead of time, so the
    next question never opens on an empty frame. */
const preloaded = new Set();
function preload(m) {
  if (preloaded.has(m.id)) return;
  preloaded.add(m.id);
  [m.a, m.b].forEach(c => QUESTIONS.forEach(q => { new Image().src = photoFor(c, q.key); }));
}

function wirePlay(m, q, back, ahead) {
  const write = (patch) => {
    const cur = (q.key === 'overall' ? state.draft[m.id].overall : state.draft[m.id].categories[q.key]) || {};
    state.draft = setAnswer(state.draft, m.id, q.key, { ...cur, ...patch });
    saveDraft(state);
  };

  el.querySelectorAll('[data-vote]').forEach(node => {
    node.onclick = () => {
      write({ vote: node.dataset.vote });
      const y = window.scrollY; render(); window.scrollTo(0, y);
    };
  });

  const range = el.querySelector('input[type=range]');
  if (range) {
    // while a finger is on the slider, touch only the readout and the fill: rebuilding
    // the screen would destroy the control under the finger
    range.oninput = () => {
      const pos = Number(range.value);
      range.style.setProperty('--pos', pos + '%');
      el.querySelector('.split').innerHTML = splitMarkup(m, pos);
      write(predictionPatch(q.key, pos, m.a.id, m.b.id));
      const next = document.getElementById('next');
      const ok = pos !== 50;
      next.setAttribute('aria-disabled', String(!ok));
      next.querySelector('.lbl').textContent = ok
        ? (ahead !== null ? 'Next' : 'Review and lock')
        : 'Move the slider';
    };
    range.onchange = () => { write(predictionPatch(q.key, Number(range.value), m.a.id, m.b.id)); };
    followFinger(range);
  }

  el.querySelectorAll('[data-zoom]').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); lightbox(b.dataset.zoom === m.a.id ? m.a : m.b, q.key); };
  });

  document.getElementById('next').onclick = () => {
    // not ready: point at what is missing, the slider once a side is picked, else the votes
    if (document.getElementById('next').getAttribute('aria-disabled') === 'true') {
      return nudge(el.querySelector('.predict.live') ? '.predict' : '.stage');
    }
    if (ahead === null) return go('review');
    state.step = ahead; go('play');
  };
  const b = document.getElementById('back');
  if (b) b.onclick = () => { state.step = back; go('play'); };
}

/**
 * iPhone Safari moves a slider only when the finger lands on its handle: a tap on the bar does
 * nothing, and people read the untouched slider as a stuck game (2026-09-29). Here a finger
 * anywhere on the bar sets it and a drag follows the finger. The value uses the browser's own
 * geometry, the handle's centre travelling between half a handle from each end, so it agrees
 * with a native drag on the phones that have one.
 */
const THUMB = 30; // px, the handle's width in style.css
function followFinger(range) {
  let finger = null;
  const set = (e) => {
    const b = range.getBoundingClientRect();
    const v = Math.round(Math.min(1, Math.max(0, (e.clientX - b.left - THUMB / 2) / (b.width - THUMB))) * 100);
    if (String(v) !== range.value) { range.value = v; range.dispatchEvent(new Event('input')); }
  };
  const up = (e) => { if (e.pointerId !== finger) return; finger = null; range.dispatchEvent(new Event('change')); };
  range.addEventListener('pointerdown', (e) => {
    if (range.disabled) return;
    finger = e.pointerId;
    try { range.setPointerCapture(e.pointerId); } catch (err) {}
    set(e);
  });
  range.addEventListener('pointermove', (e) => { if (e.pointerId === finger) set(e); });
  range.addEventListener('pointerup', up);
  range.addEventListener('pointercancel', up);
}

/** A tap on the button before the question is answered shakes what is missing, rather than doing nothing. */
function nudge(sel) {
  const n = el.querySelector(sel);
  if (!n) return;
  n.classList.remove('nudge'); void n.offsetWidth; n.classList.add('nudge');
}

/** A photograph on its own, because a phone held at arm's length in a meeting room is small. */
function lightbox(c, key) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<div><img src="${photoFor(c, key)}" alt="${esc(c.name)}"><p>${esc(c.name)}</p></div>`;
  box.onclick = () => box.remove();
  document.body.appendChild(box);
}

let warmedFor = null;

/** A button that is saving: it stays bright and turns, so a slow server never reads as a stuck page. */
function busy(btn, text) {
  btn.classList.add('busy');
  btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(text)}`;
}

function renderReview() {
  const m = MATCHUPS[state.index];
  if (!m || isLocked(m.id)) return go('wait');
  const done = isComplete(state.draft, [m], CATEGORIES);
  const summaries = [summariseMatchup(m, state.draft[m.id], CATEGORIES)];
  el.innerHTML = `${chrome()}
    <p class="eyebrow">Before you lock &middot; matchup ${state.index + 1} of ${MATCHUPS.length}</p>
    <h2 style="margin-top:0">Review</h2>
    <p>${done ? 'Everything is answered. Check it, then lock. A locked matchup cannot be changed.'
              : 'Not finished. Answer the questions marked below.'}</p>
    ${summaries.map(s => `
      <div class="card ${s.complete ? '' : 'incomplete'}">
        <h3>${esc(s.title)}</h3>
        <ul>${s.lines.map(l => l.answered
          ? `<li>${esc(l.text)}</li>`
          : `<li class="missing">${esc(l.text)} <button class="jump" data-m="${l.matchupId}" data-k="${l.key}">Answer it</button></li>`
        ).join('')}</ul>
      </div>`).join('')}
    <p class="err" id="lockErr"></p>
    <button id="lock" class="cta" ${done ? '' : 'disabled'}>${done ? 'Lock this matchup' : 'Answer everything first'}</button>
    <p class="note" id="lockNote" role="status" hidden>Saving your answers. This can take up to 10 seconds. Keep this page open.</p>
    <div class="nav"><button id="back" class="ghost">Back to the questions</button></div>`;
  wireChrome(m);
  // wake the server while the player reads their answers, so the lock does not wait for it
  if (warmedFor !== m.id) { warmedFor = m.id; wake(ENDPOINT, SESSION_LABEL); }
  document.getElementById('back').onclick = () => go('play');
  el.querySelectorAll('button.jump').forEach(b => {
    b.onclick = () => {
      state.step = QUESTIONS.findIndex(q => q.key === b.dataset.k);
      if (state.step < 0) state.step = 0;
      go('play');
    };
  });
  document.getElementById('lock').onclick = async () => {
    const btn = document.getElementById('lock');
    const note = document.getElementById('lockNote');
    btn.disabled = true; note.hidden = false;
    busy(btn, 'Saving…');
    try {
      // each matchup is its own row, under the player's id and the matchup's
      await submit({ sessionCode: state.sessionCode, participant: state.participant,
                     answers: { [m.id]: state.draft[m.id] }, submissionId: lockIdOf(state.submissionId, m.id) },
                    { onAttempt: (n) => busy(btn, n === 1 ? 'Saving…' : `Still saving… (try ${n})`) });
      if (!isLocked(m.id)) state.lockedIds = [...state.lockedIds, m.id];
      if (!advance()) go('wait');
    } catch (err) {
      document.getElementById('lockErr').textContent =
        'Did not save. Tap to try again; it cannot double-count.';
      btn.classList.remove('busy'); note.hidden = true;
      btn.disabled = false; btn.textContent = 'Lock this matchup';
    }
  };
}

/**
 * The end of this game. No results on the phone: only the presenter sees those. Once this
 * phone has finished both games, the survey is the last step.
 */
function renderDone() {
  markDone(DONE_KEY, state.participant);
  const both = finishedAll();
  el.innerHTML = `${chrome()}
    <div class="banner"><strong>Done</strong>Thank you, ${esc(state.participant)}. Your predictions are with the presenter.</div>
    ${both
      ? `<a class="cta survey-link" href="${esc(SURVEY_URL)}">Last step: the survey <span class="chev" aria-hidden="true">&rsaquo;</span></a>
         <p class="note">A few questions about both games.</p>`
      : '<p class="note">The presenter will tell you what comes next.</p>'}
    <button id="again" class="ghost">Start again on this phone</button>
    <p class="note">Only for handing the phone to someone else. It clears this device.</p>`;
  wireChrome(MATCHUPS[0]);
  document.getElementById('again').onclick = () => { clearDraft(); clearDone(DONE_KEY); location.replace(location.pathname); };
}

render();
