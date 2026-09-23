import { scoreMatchup } from './scoring.js';

/**
 * The room's own votes, turned into the result predictions are scored against.
 * A row that is missing or malformed is skipped rather than trusted: one bad row
 * under the session code must never take the reveal down for everyone.
 * `contestantIds` is optional; pass it so a contestant nobody voted for reads as 0
 * rather than as missing.
 */
export function crowdResult(rows, matchupId, categoryKeys, contestantIds = []) {
  const overallCounts = {};
  const catCounts = {};
  for (const key of categoryKeys) {
    catCounts[key] = {};
    for (const id of contestantIds) catCounts[key][id] = 0;
  }
  for (const id of contestantIds) overallCounts[id] = 0;
  let voters = 0;
  for (const row of rows || []) {
    const m = row && row.answers && row.answers[matchupId];
    if (!m || !m.overall || !m.overall.vote) continue;
    voters++;
    overallCounts[m.overall.vote] = (overallCounts[m.overall.vote] || 0) + 1;
    const cats = m.categories || {};
    for (const key of categoryKeys) {
      const c = cats[key];
      if (!c || !c.vote) continue;
      catCounts[key][c.vote] = (catCounts[key][c.vote] || 0) + 1;
    }
  }
  const entries = Object.entries(overallCounts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const tied = entries.length > 1 && entries[0][1] === entries[1][1];
  const categories = {};
  for (const key of categoryKeys) {
    const counts = catCounts[key];
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    categories[key] = {};
    for (const [who, n] of Object.entries(counts)) {
      categories[key][who] = total ? Math.round((n * 100) / total) : 0;
    }
  }
  return {
    matchupId, voters, overallCounts, categories,
    overallTied: tied,
    overallWinner: (!entries.length || tied) ? null : entries[0][0]
  };
}

/** Scores every submission. Identity is the submissionId, never the name. */
export function leaderboard(rows, crowdByMatchup) {
  const scored = (rows || []).map(row => {
    let total = 0;
    const perMatchup = {};
    for (const [matchupId, crowd] of Object.entries(crowdByMatchup)) {
      const answer = row && row.answers && row.answers[matchupId];
      if (!answer) continue;
      const s = scoreMatchup(answer, crowd);
      perMatchup[matchupId] = s;
      total += s.total;
    }
    return { submissionId: row.submissionId, participant: row.participant, perMatchup, total };
  }).sort((a, b) => b.total - a.total);

  // equal totals share a rank; announcing two identical scores as different places
  // is noticed instantly at a live reveal
  let rank = 0, lastTotal = null;
  return scored.map((r, i) => {
    if (r.total !== lastTotal) { rank = i + 1; lastTotal = r.total; }
    return { ...r, rank };
  });
}

export function sessionStats(rows, crowdByMatchup) {
  const board = leaderboard(rows, crowdByMatchup);
  let exact = 0, categoryAnswers = 0;
  for (const entry of board) {
    for (const s of Object.values(entry.perMatchup)) {
      for (const cat of Object.values(s.categories)) {
        categoryAnswers++;
        if (cat.exact) exact++;
      }
    }
  }
  const perCategory = {};
  let measured = 0, errorSum = 0;
  for (const row of rows || []) {
    for (const [matchupId, crowd] of Object.entries(crowdByMatchup)) {
      const m = row && row.answers && row.answers[matchupId];
      if (!m) continue;
      for (const [key, pred] of Object.entries(m.categories || {})) {
        const actual = (crowd.categories[key] || {})[pred.contestant];
        if (actual === undefined) continue;
        const err = Math.abs(actual - pred.share);
        measured++; errorSum += err;
        perCategory[key] = perCategory[key] || { n: 0, errorSum: 0 };
        perCategory[key].n++;
        perCategory[key].errorSum += err;
      }
    }
  }
  const categoryDifficulty = Object.entries(perCategory)
    .map(([key, v]) => ({ key, meanAbsoluteError: v.errorSum / v.n, answers: v.n }))
    .sort((a, b) => b.meanAbsoluteError - a.meanAbsoluteError);
  const totals = board.map(b => b.total);
  return {
    participants: board.length,
    categoryAnswers,
    measuredAnswers: measured,
    exactRate: categoryAnswers ? exact / categoryAnswers : 0,
    // divided by what was actually measured, not by answers we had no crowd data for
    meanAbsoluteError: measured ? errorSum / measured : 0,
    categoryDifficulty,
    spread: totals.length ? { best: Math.max(...totals), worst: Math.min(...totals) } : null,
    ties: Object.values(crowdByMatchup).filter(c => c.overallTied).map(c => c.matchupId),
    leaderboard: board
  };
}

/**
 * The other competition. The deck is explicit that two run at once: contestants
 * compete for the crowd's vote while players compete to predict it, and there are
 * two winners. This is the contestants' side, which the leaderboard never showed.
 */
export function contestantStanding(rows, matchups, categories) {
  const keys = categories.map(c => c.key);
  const out = [];
  for (const m of matchups) {
    const crowd = crowdResult(rows, m.id, keys, [m.a.id, m.b.id]);
    const total = Object.values(crowd.overallCounts).reduce((a, b) => a + b, 0);
    for (const side of [m.a, m.b]) {
      const votes = crowd.overallCounts[side.id] || 0;
      let categoriesWon = 0;
      for (const key of keys) {
        const shares = crowd.categories[key] || {};
        const mine = shares[side.id] || 0;
        const theirs = Object.entries(shares)
          .filter(([id]) => id !== side.id)
          .reduce((mx, [, v]) => Math.max(mx, v), 0);
        if (mine > theirs) categoriesWon++;
      }
      out.push({
        id: side.id, name: side.name, matchupId: m.id,
        opponent: side.id === m.a.id ? m.b.name : m.a.name,
        votes, overallShare: total ? Math.round((votes * 100) / total) : 0,
        wonOverall: crowd.overallWinner === side.id,
        tied: crowd.overallTied, categoriesWon, categoriesTotal: keys.length
      });
    }
  }
  return out.sort((a, b) =>
    (b.wonOverall - a.wonOverall) || (b.overallShare - a.overallShare) || (b.categoriesWon - a.categoriesWon));
}
