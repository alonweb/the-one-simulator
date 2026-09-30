export const BANDS = [[50, 59], [60, 69], [70, 79], [80, 89], [90, 100]];
export const FLOOR = 51;
// +1 on any question where the girl the player voted for is the one the room picked there
// (Alon, 2026-09-30, during the meeting). A tied question has no pick, so it gives no vote point.
export const VOTE_POINT = 1;
export const MAX_PER_MATCHUP = 2 + VOTE_POINT + 4 * (1 + 5 + VOTE_POINT);

/** The contestant the room gave more than half of a question's votes, or null on a tie. */
export function roomPick(shares) {
  const top = Object.entries(shares || {}).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 50 ? top[0] : null;
}

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

/**
 * `overall` and each category's `points` include the vote point, so a question's points still add up
 * to the matchup total; `overallPrediction`, `overallVote` and a category's `votePoint` keep the parts.
 */
export function scoreMatchup(answer, crowd) {
  const a = answer || {};
  const o = a.overall || {};
  const overallPrediction = scoreOverall(o.predicted, crowd.overallWinner);
  const overallVote = o.vote && crowd.overallWinner && o.vote === crowd.overallWinner ? VOTE_POINT : 0;
  const overall = overallPrediction + overallVote;
  const categories = {};
  let total = overall;
  for (const key of Object.keys(a.categories || {})) {
    const shares = crowd.categories[key] || {};
    const r = scoreCategory(a.categories[key], shares);
    const pick = roomPick(shares);
    const votePoint = a.categories[key].vote && pick && a.categories[key].vote === pick ? VOTE_POINT : 0;
    categories[key] = { ...r, votePoint, points: r.points + votePoint };
    total += r.points + votePoint;
  }
  return { overall, overallPrediction, overallVote, categories, total };
}
