/** The end-of-game survey: pure functions over the answers a participant gives. */

/** The languages the survey page offers, the first being the one it falls back to. */
export const LANGUAGES = ['en', 'he'];

/**
 * A question's wording in one language. Each option keeps its English text as `value`,
 * which is what gets stored, so answers read the same whatever language gave them.
 * A question with no wording in that language shows its English.
 */
export function localize(q, lang) {
  const t = (lang !== 'en' && q[lang]) || {};
  const shown = t.options || [];
  return {
    label: t.label || q.label, low: t.low || q.low, high: t.high || q.high,
    options: (q.options || []).map((value, i) => ({ value, text: shown[i] || value }))
  };
}

/** The language to open in: a ?lang= link, else the player's own earlier choice, else the phone's, else English. */
export function pickLanguage({ url, saved, browser } = {}) {
  if (LANGUAGES.includes(url)) return url;
  if (LANGUAGES.includes(saved)) return saved;
  for (const tag of browser || []) {
    const base = String(tag).toLowerCase().split('-')[0];
    const code = base === 'iw' ? 'he' : base;
    if (LANGUAGES.includes(code)) return code;
  }
  return LANGUAGES[0];
}

export function setSurveyAnswer(answers, key, value) {
  return { ...(answers || {}), [key]: value };
}

function valid(q, v) {
  if (q.type === 'scale') {
    if (v === '' || v == null) return false;
    const n = Number(v);
    return Number.isFinite(n) && n >= (q.min ?? 1) && n <= (q.max ?? 5);
  }
  if (q.type === 'choice') return (q.options || []).includes(v);
  return typeof v === 'string' && v.trim().length > 0;
}

/** True when every required question has an answer the question allows. */
export function isSurveyComplete(answers, questions) {
  const a = answers || {};
  return (questions || []).every(q => q.required === false || valid(q, a[q.key]));
}

/** Every participant's answers laid out in question order, for the presenter's table. */
export function surveyTable(rows, questions) {
  const qs = questions || [];
  return {
    header: qs.map(q => q.short || q.label),
    rows: (rows || [])
      .filter(r => r && r.answers && typeof r.answers === 'object')
      .map(r => ({
        participant: r.participant,
        cells: qs.map(q => { const v = r.answers[q.key]; return v == null ? '' : String(v); })
      }))
  };
}
