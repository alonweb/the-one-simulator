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
