import { MATCHUPS, CATEGORIES, SURVEY, SESSION_LABEL } from './config.js';
import { submit, submitSurvey } from './store.js';
import { escapeHtml as esc } from './html.js';
import { summariseMatchup } from './present-format.js';
import { setSurveyAnswer, isSurveyComplete } from './survey.js';
import { emptyDraft, setAnswer, isComplete, saveDraft, loadDraft, clearDraft, wantsReset,
         shapeOf, draftMatches, clearMatchup } from './draft.js';
import { questionsOf, nextStop, prevStop, isQuestionAnswered, predictionPatch, sliderOf } from './flow.js';

const el = document.getElementById('screen');
const QUESTIONS = questionsOf(CATEGORIES);

// ?reset=1 wipes this device and starts over. Deliberately not a visible control during
// play: a participant who resets mid-round would submit twice under a new identity.
if (wantsReset(location.search)) {
  clearDraft();
  location.replace(location.pathname);
}

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l5.5 5.5L20 5" fill="none" stroke="#000" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function freshState() {
  return {
    shape: shapeOf(MATCHUPS, CATEGORIES),
    screen: 'join', sessionCode: SESSION_LABEL, participant: '',
    submissionId: 'sub-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
    surveyId: 'srv-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
    index: 0, step: 0, draft: emptyDraft(MATCHUPS, CATEGORIES), survey: {}
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
if (!state.survey) state.survey = {};
if (!state.surveyId) state.surveyId = 'srv-' + Math.random().toString(36).slice(2) + '-' + Date.now();
if (state.screen === 'locked') state.screen = 'survey';
if (state.screen === 'results') state.screen = 'done';

function go(screen) { state.screen = screen; state.menu = false; saveDraft(state); render(); window.scrollTo(0, 0); }

/** The chrome every screen carries: the wordmark, and the menu behind the three lines. */
function chrome() {
  return `<header class="top">
      <h1 class="logo">THE ONE <span class="badge">1</span></h1>
      <button class="menu-btn" id="menuBtn" aria-label="Menu" aria-expanded="${state.menu ? 'true' : 'false'}">
        <span></span><span></span><span></span></button>
    </header>
    ${state.menu ? `<nav class="menu">
      <button id="mReview">Review my answers</button>
      <button id="mSurvey" ${state.surveySent ? 'disabled' : ''}>${state.surveySent ? 'Survey sent' : 'Answer the survey'}</button>
      <button id="mClear">Clear this matchup</button>
      <button id="mOver">Start from the beginning</button>
    </nav>` : ''}`;
}

function wireChrome(m) {
  const btn = document.getElementById('menuBtn');
  if (btn) btn.onclick = () => { state.menu = !state.menu; saveDraft(state); render(); };
  const review = document.getElementById('mReview');
  if (review) review.onclick = () => go('review');
  // the survey can be answered at any point; it remembers where to come back to
  const survey = document.getElementById('mSurvey');
  if (survey && !state.surveySent) survey.onclick = () => { state.surveyReturn = state.screen; go('survey'); };
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
  if (state.screen === 'join') return renderJoin();
  if (state.screen === 'play') return renderPlay();
  if (state.screen === 'review') return renderReview();
  if (state.screen === 'survey') return renderSurvey();
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
      <p>Points come from reading the room, not from your own taste.</p>
    </div>
    <p class="eyebrow" style="margin-top:22px">Tonight's ten</p>
    <div class="strip">${MATCHUPS.flatMap(m => [m.a, m.b]).map(c =>
      `<img src="${c.photo}" alt="${esc(c.name)}">`).join('')}</div>`;
  document.getElementById('start').onclick = () => {
    const name = document.getElementById('name').value.trim();
    if (!name) { document.getElementById('joinErr').textContent = 'Your name is needed.'; return; }
    state.sessionCode = SESSION_LABEL; state.participant = name;
    state.index = 0; state.step = 0; go('play');
  };
}

/** The both-sides readout under the slider, as its own markup so it can be rewritten
    on its own while a finger is still on the slider. */
function splitMarkup(m, pos) {
  return `<span><b>${pos}%</b> ${esc(m.a.name)}</span><span><b>${100 - pos}%</b> ${esc(m.b.name)}</span>`;
}

function renderPlay() {
  const m = MATCHUPS[state.index];
  state.step = Math.min(Math.max(state.step, 0), QUESTIONS.length - 1);
  const q = QUESTIONS[state.step];
  const entry = state.draft[m.id];
  const ans = (q.key === 'overall' ? entry.overall : entry.categories[q.key]) || null;
  const voted = !!(ans && ans.vote);
  const done = isQuestionAnswered(q.key, ans);
  const pos = sliderOf(q.key, ans, m.a.id);
  const back = prevStop(state.index, state.step, QUESTIONS.length);
  const ahead = nextStop(state.index, state.step, MATCHUPS.length, QUESTIONS.length);

  const shot = (c) => `
    <div class="shot ${voted ? (ans.vote === c.id ? 'chosen' : 'dim') : ''}">
      <div class="frame" data-vote="${c.id}" aria-hidden="true">
        <img src="${c.photo}" alt=""></div>
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
            : ahead ? (ahead.index !== state.index ? 'Next matchup' : 'Next')
                    : 'Review my answers';

  el.innerHTML = `${chrome()}
    <div class="crumbs">
      ${back ? '<button class="back" id="back"><span aria-hidden="true">&lsaquo;</span> Back</button>' : ''}
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
    <button id="next" class="cta" ${done ? '' : 'disabled'}><span class="lbl">${cta}</span>
      <span class="chev" aria-hidden="true">&rsaquo;</span></button>`;

  wireChrome(m);
  wirePlay(m, q, back, ahead);
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
      next.disabled = !ok;
      next.querySelector('.lbl').textContent = ok
        ? (ahead ? (ahead.index !== state.index ? 'Next matchup' : 'Next') : 'Review my answers')
        : 'Move the slider';
    };
    range.onchange = () => { write(predictionPatch(q.key, Number(range.value), m.a.id, m.b.id)); };
  }

  el.querySelectorAll('[data-zoom]').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); lightbox(b.dataset.zoom === m.a.id ? m.a : m.b); };
  });

  document.getElementById('next').onclick = () => {
    if (!ahead) return go('review');
    state.index = ahead.index; state.step = ahead.step; go('play');
  };
  const b = document.getElementById('back');
  if (b) b.onclick = () => { state.index = back.index; state.step = back.step; go('play'); };
}

/** A photograph on its own, because a phone held at arm's length in a meeting room is small. */
function lightbox(c) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<div><img src="${c.photo}" alt="${esc(c.name)}"><p>${esc(c.name)}</p></div>`;
  box.onclick = () => box.remove();
  document.body.appendChild(box);
}

function renderReview() {
  const done = isComplete(state.draft, MATCHUPS, CATEGORIES);
  const summaries = MATCHUPS.map(m => summariseMatchup(m, state.draft[m.id], CATEGORIES));
  const missing = summaries.filter(s => !s.complete).map(s => s.title);
  el.innerHTML = `${chrome()}
    <p class="eyebrow">Before you lock</p>
    <h2 style="margin-top:0">Review</h2>
    <p>${done ? 'Everything is answered. Check it, then lock.'
              : `Not finished. Still missing: <strong>${esc(missing.join(', '))}</strong>.`}</p>
    ${summaries.map(s => `
      <div class="card ${s.complete ? '' : 'incomplete'}">
        <h3>${esc(s.title)}</h3>
        <ul>${s.lines.map(l => l.answered
          ? `<li>${esc(l.text)}</li>`
          : `<li class="missing">${esc(l.text)} <button class="jump" data-m="${l.matchupId}" data-k="${l.key}">Answer it</button></li>`
        ).join('')}</ul>
      </div>`).join('')}
    <p class="err" id="lockErr"></p>
    <button id="lock" class="cta" ${done ? '' : 'disabled'}>${done ? 'Lock my answers' : 'Answer everything first'}</button>
    <div class="nav"><button id="back" class="ghost">Back to the matchups</button></div>`;
  wireChrome(MATCHUPS[state.index]);
  document.getElementById('back').onclick = () => go('play');
  el.querySelectorAll('button.jump').forEach(b => {
    b.onclick = () => {
      state.index = MATCHUPS.findIndex(m => m.id === b.dataset.m);
      state.step = QUESTIONS.findIndex(q => q.key === b.dataset.k);
      if (state.step < 0) state.step = 0;
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
      state.surveyReturn = null;
      go(state.surveySent ? 'done' : 'survey');
    } catch (err) {
      document.getElementById('lockErr').textContent =
        'Did not save. Tap to try again; it cannot double-count.';
      btn.disabled = false; btn.textContent = 'Lock my answers';
    }
  };
}

/** The end of the game. No results on the phone: only the presenter sees those. */
function renderSurvey() {
  const a = state.survey || {};
  const complete = isSurveyComplete(a, SURVEY);
  const field = (q) => {
    if (q.type === 'scale') {
      const min = q.min ?? 1, max = q.max ?? 5;
      const btns = [];
      for (let n = min; n <= max; n++) {
        btns.push(`<button type="button" class="ghost pick ${a[q.key] === n ? 'on' : ''}" data-q="${q.key}" data-v="${n}">${n}</button>`);
      }
      return `<div class="scale">${btns.join('')}</div>
        <div class="ends"><span>${esc(q.low || '')}</span><span>${esc(q.high || '')}</span></div>`;
    }
    if (q.type === 'choice') {
      return `<div class="choice">${(q.options || []).map(o =>
        `<button type="button" class="ghost pick ${a[q.key] === o ? 'on' : ''}" data-q="${q.key}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
    }
    return `<textarea class="text" data-q="${q.key}" rows="3" placeholder="${q.required === false ? 'Optional' : 'A few words'}">${esc(a[q.key] || '')}</textarea>`;
  };
  const fromMenu = !!state.surveyReturn;
  el.innerHTML = `<header class="top"><h1 class="logo">THE ONE <span class="badge">1</span></h1></header>
    ${fromMenu
      ? `<div class="banner"><strong>Survey</strong>A few questions from the team. Your matchup answers are kept.</div>`
      : `<div class="banner"><strong>Locked</strong>Your predictions are in. Last thing: a few questions.</div>`}
    ${SURVEY.map((q, i) => `<div class="card survey">
      <h3>${i + 1}. ${esc(q.label)}${q.required === false ? ' <small>(optional)</small>' : ''}</h3>
      ${field(q)}</div>`).join('')}
    <p class="err" id="surveyErr"></p>
    <button id="send" class="cta" ${complete ? '' : 'disabled'}>${complete ? 'Send my answers' : 'Answer everything first'}</button>
    ${fromMenu ? `<div class="nav"><button id="surveyBack" class="ghost">Back to the game</button></div>` : ''}`;
  const back = document.getElementById('surveyBack');
  if (back) back.onclick = () => { const to = state.surveyReturn; state.surveyReturn = null; go(to); };
  el.querySelectorAll('button.pick').forEach(b => {
    b.onclick = () => {
      const q = SURVEY.find(x => x.key === b.dataset.q);
      const v = q.type === 'scale' ? Number(b.dataset.v) : b.dataset.v;
      state.survey = setSurveyAnswer(state.survey, q.key, v);
      saveDraft(state);
      renderSurvey();
    };
  });
  el.querySelectorAll('textarea.text').forEach(t => {
    t.oninput = () => {
      state.survey = setSurveyAnswer(state.survey, t.dataset.q, t.value);
      saveDraft(state);
      // rewriting the screen would steal the keyboard, so only the button changes
      const ok = isSurveyComplete(state.survey, SURVEY);
      const btn = document.getElementById('send');
      btn.disabled = !ok; btn.textContent = ok ? 'Send my answers' : 'Answer everything first';
    };
  });
  document.getElementById('send').onclick = async () => {
    const btn = document.getElementById('send');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await submitSurvey({ sessionCode: state.sessionCode, participant: state.participant,
                           answers: state.survey, submissionId: state.surveyId },
                         { onAttempt: (n) => { btn.textContent = n === 1 ? 'Sending…' : `Still sending… (try ${n})`; } });
      state.surveySent = true;
      if (state.surveyReturn) { const to = state.surveyReturn; state.surveyReturn = null; go(to); }
      else go('done');
    } catch (err) {
      document.getElementById('surveyErr').textContent = 'Did not save. Tap to try again; it cannot double-count.';
      btn.disabled = false; btn.textContent = 'Send my answers';
    }
  };
}

function renderDone() {
  el.innerHTML = `<header class="top"><h1 class="logo">THE ONE <span class="badge">1</span></h1></header>
    <div class="banner"><strong>Done</strong>Thank you, ${esc(state.participant)}. That is everything.</div>
    <p class="note">Your predictions and your answers are with the presenter.</p>
    <button id="again" class="ghost">Start again on this phone</button>
    <p class="note">Only for handing the phone to someone else. It clears this device.</p>`;
  document.getElementById('again').onclick = () => { clearDraft(); location.replace(location.pathname); };
}

render();
