/** Vote counts as a sentence a presenter can read out, highest first. */
export function formatCounts(counts, matchup) {
  const names = { [matchup.a.id]: matchup.a.name, [matchup.b.id]: matchup.b.name };
  const entries = Object.entries(counts || {});
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return 'no votes yet';
  return entries
    .sort((x, y) => y[1] - x[1])
    .map(([id, n]) => `${names[id] || id} ${n} (${Math.round((n * 100) / total)}%)`)
    .join(', ');
}

/** One matchup's answers read back to the participant before they lock. */
export function summariseMatchup(matchup, entry, categories) {
  const name = (id) => id === matchup.a.id ? matchup.a.name : id === matchup.b.id ? matchup.b.name : 'unknown';
  const e = entry || { overall: null, categories: {} };
  const lines = [];
  let complete = true;
  const add = (text, answered, key) => {
    if (!answered) complete = false;
    lines.push(answered ? { text, answered: true, key, matchupId: matchup.id }
                        : { text, answered: false, key, matchupId: matchup.id });
  };

  const o = e.overall;
  if (o && o.vote && o.predicted) {
    add(`Who is the one — you picked ${name(o.vote)}, you think the room picks ${name(o.predicted)}`, true, 'overall');
  } else { add('Who is the one — not answered', false, 'overall'); }

  for (const c of categories) {
    const a = (e.categories || {})[c.key];
    if (a && a.vote && a.contestant && typeof a.share === 'number') {
      add(`${c.label} — you picked ${name(a.vote)}, you think the room gives ${name(a.contestant)} ${a.share}%`, true, c.key);
    } else { add(`${c.label} — not answered`, false, c.key); }
  }
  return { title: `${matchup.a.name} v ${matchup.b.name}`, lines, complete };
}

/** One player's answers on one matchup, each next to the room's answer, for the presenter. */
export function answerRows(matchup, answer, crowd, score, categories) {
  const name = (id) => id === matchup.a.id ? matchup.a.name : id === matchup.b.id ? matchup.b.name : 'unknown';
  const rows = [];
  const o = (answer && answer.overall) || {};
  const c = crowd || {};
  const overallPts = score ? score.overall || 0 : 0;
  // the prediction's part; a score from before the vote point has no overallPrediction
  const predictedPts = score && typeof score.overallPrediction === 'number' ? score.overallPrediction : overallPts;
  const voteNote = (n) => (n ? '; voted for the room\'s pick, +1' : '');
  rows.push({
    question: 'Who is the one',
    yours: o.predicted ? `${name(o.predicted)} (voted ${name(o.vote)})` : 'not answered',
    room: c.overallTied ? 'tied' : c.overallWinner ? name(c.overallWinner) : 'no votes',
    points: overallPts,
    why: (!o.predicted ? 'not answered, 0'
      : c.overallTied ? 'room tied, nobody scores'
      : !c.overallWinner ? 'no votes, 0'
      : predictedPts ? 'right, +2' : 'wrong, 0') + voteNote(score && score.overallVote)
  });
  for (const cat of categories || []) {
    const a = ((answer && answer.categories) || {})[cat.key];
    const s = score && score.categories && score.categories[cat.key];
    const shares = (c.categories || {})[cat.key] || {};
    const all = Object.entries(shares).map(([id, p]) => `${name(id)} ${p}%`).join(', ') || 'no votes';
    rows.push({
      question: cat.label,
      yours: a && a.contestant ? `${name(a.contestant)} ${a.share}% (voted ${name(a.vote)})` : 'not answered',
      room: a && a.contestant && shares[a.contestant] !== undefined ? `${name(a.contestant)} ${shares[a.contestant]}%` : all,
      points: s ? s.points || 0 : 0,
      why: (!a || !a.contestant || !s ? 'not answered, 0'
        : s.exact ? 'exact hit: same band +1, exact +5'
        : s.sameBand ? 'same band, +1'
        : s.reason === 'below-floor' ? `room gave her ${s.actual}%, below 51, 0`
        : s.reason === 'no-data' ? 'nobody in the room picked her, 0'
        : `room said ${s.actual}%, another band, 0`) + voteNote(s && s.votePoint)
    });
  }
  return rows;
}
