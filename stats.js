import { scoreMatchup } from './scoring.js';

export function crowdResult(rows, matchupId, categoryKeys) {
  const overallCounts = {};
  const catCounts = {};
  for (const key of categoryKeys) catCounts[key] = {};
  let voters = 0;
  for (const row of rows) {
    const m = row.answers && row.answers[matchupId];
    if (!m) continue;
    voters++;
    const ov = m.overall.vote;
    overallCounts[ov] = (overallCounts[ov] || 0) + 1;
    for (const key of categoryKeys) {
      const c = m.categories[key];
      if (!c) continue;
      catCounts[key][c.vote] = (catCounts[key][c.vote] || 0) + 1;
    }
  }
  const entries = Object.entries(overallCounts).sort((a, b) => b[1] - a[1]);
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

export function leaderboard(rows, crowdByMatchup) {
  return rows.map(row => {
    let total = 0;
    const perMatchup = {};
    for (const [matchupId, crowd] of Object.entries(crowdByMatchup)) {
      const answer = row.answers && row.answers[matchupId];
      if (!answer) continue;
      const scored = scoreMatchup(answer, crowd);
      perMatchup[matchupId] = scored;
      total += scored.total;
    }
    return { submissionId: row.submissionId, participant: row.participant, perMatchup, total };
  }).sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function sessionStats(rows, crowdByMatchup) {
  const board = leaderboard(rows, crowdByMatchup);
  let exact = 0, categoryAnswers = 0, errorSum = 0;
  for (const entry of board) {
    for (const scored of Object.values(entry.perMatchup)) {
      for (const cat of Object.values(scored.categories)) {
        categoryAnswers++;
        if (cat.exact) exact++;
      }
    }
  }
  const perCategory = {};
  for (const row of rows) {
    for (const [matchupId, crowd] of Object.entries(crowdByMatchup)) {
      const m = row.answers && row.answers[matchupId];
      if (!m) continue;
      for (const [key, pred] of Object.entries(m.categories)) {
        const actual = (crowd.categories[key] || {})[pred.contestant];
        if (actual === undefined) continue;
        errorSum += Math.abs(actual - pred.share);
        perCategory[key] = perCategory[key] || { n: 0, errorSum: 0 };
        perCategory[key].n++;
        perCategory[key].errorSum += Math.abs(actual - pred.share);
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
    exactRate: categoryAnswers ? exact / categoryAnswers : 0,
    meanAbsoluteError: categoryAnswers ? errorSum / categoryAnswers : 0,
    categoryDifficulty,
    spread: totals.length ? { best: Math.max(...totals), worst: Math.min(...totals) } : null,
    ties: Object.values(crowdByMatchup).filter(c => c.overallTied).map(c => c.matchupId),
    leaderboard: board
  };
}
