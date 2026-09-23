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
