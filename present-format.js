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

  const o = e.overall;
  if (o && o.vote && o.predicted) {
    lines.push(`Who is the one — you picked ${name(o.vote)}, you think the room picks ${name(o.predicted)}`);
  } else { lines.push('Who is the one — not answered'); complete = false; }

  for (const c of categories) {
    const a = (e.categories || {})[c.key];
    if (a && a.vote && a.contestant && typeof a.share === 'number') {
      lines.push(`${c.label} — you picked ${name(a.vote)}, you think the room gives ${name(a.contestant)} ${a.share}%`);
    } else { lines.push(`${c.label} — not answered`); complete = false; }
  }
  return { title: `${matchup.a.name} v ${matchup.b.name}`, lines, complete };
}
