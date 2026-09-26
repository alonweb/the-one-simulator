/** The end-of-game survey: pure functions over the answers a participant gives. */

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
    header: qs.map(q => q.label),
    rows: (rows || [])
      .filter(r => r && r.answers && typeof r.answers === 'object')
      .map(r => ({
        participant: r.participant,
        cells: qs.map(q => { const v = r.answers[q.key]; return v == null ? '' : String(v); })
      }))
  };
}
