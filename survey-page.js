import { SURVEY, SESSION_LABEL } from './config.js';
import { submitSurvey } from './store.js';
import { escapeHtml as esc } from './html.js';
import { setSurveyAnswer, isSurveyComplete } from './survey.js';
import { lastName } from './finish.js';

// The survey page, answered once both games are done. It keeps its own saved state, apart
// from either game's, so a reload keeps the answers and a phone sends the survey once.
const el = document.getElementById('screen');
const KEY = 'theone.survey.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

const state = load() || {
  id: 'srv-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
  name: lastName(), answers: {}, sent: false
};

const chrome = () => `<header class="top"><h1 class="logo">THE ONE <span class="badge">1</span></h1></header>`;
const ready = () => !!state.name.trim() && isSurveyComplete(state.answers, SURVEY);

function field(q) {
  const a = state.answers;
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
}

function renderSent() {
  el.innerHTML = `${chrome()}
    <div class="banner"><strong>Thank you</strong>Your survey is in${state.name ? ', ' + esc(state.name) : ''}. That is everything.</div>`;
}

function syncButton() {
  const btn = document.getElementById('send');
  const ok = ready();
  btn.disabled = !ok; btn.textContent = ok ? 'Send my answers' : 'Answer everything first';
}

function render() {
  if (state.sent) return renderSent();
  el.innerHTML = `${chrome()}
    <div class="banner"><strong>Survey</strong>A few questions about both games.</div>
    <div class="card survey"><h3>Your name</h3>
      <input id="name" value="${esc(state.name)}" placeholder="The name you played under"></div>
    ${SURVEY.map((q, i) => `<div class="card survey">
      <h3>${i + 1}. ${esc(q.label)}${q.required === false ? ' <small>(optional)</small>' : ''}</h3>
      ${field(q)}</div>`).join('')}
    <p class="err" id="surveyErr"></p>
    <button id="send" class="cta" ${ready() ? '' : 'disabled'}>${ready() ? 'Send my answers' : 'Answer everything first'}</button>`;

  // typing is handled without redrawing, which would steal the keyboard
  document.getElementById('name').oninput = (e) => { state.name = e.target.value; save(); syncButton(); };
  el.querySelectorAll('textarea.text').forEach(t => {
    t.oninput = () => { state.answers = setSurveyAnswer(state.answers, t.dataset.q, t.value); save(); syncButton(); };
  });
  el.querySelectorAll('button.pick').forEach(b => {
    b.onclick = () => {
      const q = SURVEY.find(x => x.key === b.dataset.q);
      state.answers = setSurveyAnswer(state.answers, q.key, q.type === 'scale' ? Number(b.dataset.v) : b.dataset.v);
      save();
      const y = window.scrollY; render(); window.scrollTo(0, y);
    };
  });
  document.getElementById('send').onclick = async () => {
    const btn = document.getElementById('send');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await submitSurvey({ sessionCode: SESSION_LABEL, participant: state.name.trim(),
                           answers: state.answers, submissionId: state.id },
                         { onAttempt: (n) => { btn.textContent = n === 1 ? 'Sending…' : `Still sending… (try ${n})`; } });
      state.sent = true; save();
      window.scrollTo(0, 0); render();
    } catch (err) {
      document.getElementById('surveyErr').textContent = 'Did not save. Tap to try again; it cannot double-count.';
      btn.disabled = false; btn.textContent = 'Send my answers';
    }
  };
}

render();
