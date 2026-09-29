import { SURVEY, SURVEY_TEXT, SESSION_LABEL, ENDPOINT } from './config.js';
import { submitSurvey, wake } from './store.js';
import { escapeHtml as esc } from './html.js';
import { setSurveyAnswer, isSurveyComplete, localize, pickLanguage, LANGUAGES } from './survey.js';
import { lastName } from './finish.js';

// The survey page, answered once both games are done. It keeps its own saved state, apart
// from either game's, so a reload keeps the answers and a phone sends the survey once.
// v2: the final questions (2026-09-29); a phone that sent the earlier set answers these too.
const el = document.getElementById('screen');
const KEY = 'theone.survey.v2';
const LANG_KEY = 'theone.lang';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

const state = load() || {
  id: 'srv-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
  name: lastName(), answers: {}, sent: false
};

let savedLang = null;
try { savedLang = localStorage.getItem(LANG_KEY); } catch (e) {}
let lang = pickLanguage({
  url: new URLSearchParams(location.search).get('lang'), saved: savedLang,
  browser: navigator.languages || [navigator.language]
});
const T = () => SURVEY_TEXT[lang] || SURVEY_TEXT.en;
const NAMES = { en: 'English', he: 'עברית' };

function setLanguage(next) {
  lang = next;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

// the wordmark stays left to right in either language; the switch names each language in itself
const chrome = () => `<header class="top has-lang"><h1 class="logo" dir="ltr">THE ONE <span class="badge">1</span></h1>
  <div class="lang" role="group" aria-label="${esc(T().language)}">${LANGUAGES.map(l =>
    `<button type="button" lang="${l}" data-lang="${l}" aria-pressed="${l === lang}">${NAMES[l]}</button>`).join('')}</div></header>`;
const ready = () => !!state.name.trim() && isSurveyComplete(state.answers, SURVEY);

function field(q) {
  const a = state.answers;
  const w = localize(q, lang);
  if (q.type === 'scale') {
    const min = q.min ?? 1, max = q.max ?? 5;
    const btns = [];
    for (let n = min; n <= max; n++) {
      btns.push(`<button type="button" class="ghost pick ${a[q.key] === n ? 'on' : ''}" data-q="${q.key}" data-v="${n}">${n}</button>`);
    }
    // more than five numbers go on two rows, so each stays big enough to tap
    return `<p class="hint">${esc(T().scaleHint(min, max))}</p>
      <div class="scale ${max - min + 1 > 5 ? 'wide' : ''}">${btns.join('')}</div>
      <div class="ends">${w.low ? `<span>${min} = ${esc(w.low)}</span>` : ''}${w.high ? `<span>${max} = ${esc(w.high)}</span>` : ''}</div>`;
  }
  if (q.type === 'choice') {
    return `<div class="choice">${w.options.map(o =>
      `<button type="button" class="ghost pick ${a[q.key] === o.value ? 'on' : ''}" data-q="${q.key}" data-v="${esc(o.value)}">${esc(o.text)}</button>`).join('')}</div>`;
  }
  return `<textarea class="text" dir="auto" data-q="${q.key}" rows="3" placeholder="${esc(q.required === false ? T().textOptional : T().textPlaceholder)}">${esc(a[q.key] || '')}</textarea>`;
}

function page() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = T().pageTitle;
}

function bindChrome() {
  el.querySelectorAll('.lang button').forEach(b => {
    b.onclick = () => { if (b.dataset.lang !== lang) setLanguage(b.dataset.lang); };
  });
}

function renderSent() {
  el.innerHTML = `${chrome()}
    <div class="banner"><strong>${esc(T().thanks)}</strong>${esc(T().thanksBody(state.name))}</div>`;
  bindChrome();
}

/** A button that is sending: it stays bright and turns, so a slow server never reads as a stuck page. */
function busy(btn, text) {
  btn.classList.add('busy');
  btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(text)}`;
}

function syncButton() {
  const btn = document.getElementById('send');
  const ok = ready();
  btn.disabled = !ok; btn.textContent = ok ? T().send : T().incomplete;
}

function render() {
  page();
  if (state.sent) return renderSent();
  el.innerHTML = `${chrome()}
    <div class="banner"><strong>${esc(T().heading)}</strong>${esc(T().intro)}</div>
    <div class="card survey"><h3>${esc(T().name)}</h3>
      <input id="name" dir="auto" value="${esc(state.name)}" placeholder="${esc(T().namePlaceholder)}"></div>
    ${SURVEY.map((q, i) => `<div class="card survey">
      <h3>${i + 1}. ${esc(localize(q, lang).label)}${q.required === false ? ` <small>(${esc(T().optional)})</small>` : ''}</h3>
      ${field(q)}</div>`).join('')}
    <p class="err" id="surveyErr"></p>
    <button id="send" class="cta" ${ready() ? '' : 'disabled'}>${esc(ready() ? T().send : T().incomplete)}</button>
    <p class="note" id="sendNote" role="status" hidden>${esc(T().sendingNote)}</p>`;
  bindChrome();

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
    const note = document.getElementById('sendNote');
    btn.disabled = true; note.hidden = false;
    busy(btn, T().sending);
    try {
      // the answers are stored in English; `lang` records which language the player read them in
      await submitSurvey({ sessionCode: SESSION_LABEL, participant: state.name.trim(),
                           answers: { ...state.answers, lang }, submissionId: state.id },
                         { onAttempt: (n) => busy(btn, n === 1 ? T().sending : T().retrying(n)) });
      state.sent = true; save();
      window.scrollTo(0, 0); render();
    } catch (err) {
      document.getElementById('surveyErr').textContent = T().failed;
      btn.classList.remove('busy'); note.hidden = true;
      btn.disabled = false; btn.textContent = T().send;
    }
  };
}

render();
// wake the server while the player answers, so Send does not wait for it (an idle server took
// up to 11 s to answer, 2026-09-29)
if (!state.sent) wake(ENDPOINT, SESSION_LABEL);
