export const BANDS = [[50, 59], [60, 69], [70, 79], [80, 89], [90, 100]];
export const FLOOR = 51;
export const MAX_PER_MATCHUP = 2 + 4 * (1 + 5);

export function bandOf(share) {
  if (share < 50) return null;
  for (let i = 0; i < BANDS.length; i++) {
    if (share >= BANDS[i][0] && share <= BANDS[i][1]) return i;
  }
  return null;
}

export function scoreCategory(prediction, crowdShares) {
  const actual = crowdShares[prediction.contestant];
  if (actual === undefined) return { points: 0, exact: false, reason: 'no-data' };
  if (actual < FLOOR) return { points: 0, exact: false, reason: 'below-floor', actual };
  const exact = Math.round(actual) === Math.round(prediction.share);
  const sameBand = bandOf(actual) !== null && bandOf(actual) === bandOf(prediction.share);
  const points = (sameBand ? 1 : 0) + (exact ? 5 : 0);
  return { points, exact, sameBand, actual, reason: points ? 'scored' : 'wrong-band' };
}

export function scoreOverall(predicted, crowdWinner) {
  if (crowdWinner === null || crowdWinner === undefined) return 0;
  return predicted === crowdWinner ? 2 : 0;
}

export function scoreMatchup(answer, crowd) {
  const a = answer || {};
  const overall = scoreOverall(a.overall && a.overall.predicted, crowd.overallWinner);
  const categories = {};
  let total = overall;
  for (const key of Object.keys(a.categories || {})) {
    const r = scoreCategory(a.categories[key], crowd.categories[key] || {});
    categories[key] = r;
    total += r.points;
  }
  return { overall, categories, total };
}
