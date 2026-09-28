import { splitFromSlider, sliderFromSplit, DEFAULT_SHARE } from './draft.js';

/**
 * One matchup is five questions, asked one at a time on their own screen, exactly as
 * the pilot mockup shows them: who is the one, then each category in turn.
 */
export function questionsOf(categories) {
  return [{ key: 'overall', label: 'who is the one?', short: 'Who is the one' },
          ...categories.map(c => ({ key: c.key, label: c.question || c.label, short: c.label }))]
    .map((q, i) => ({ ...q, n: i + 1 }));
}

/**
 * The competition a phone should open: the first matchup, in matchup order, that the
 * presenter has released and this player has not locked. -1 means wait.
 */
export function nextCompetition(matchups, released, locked) {
  const open = new Set(released || []);
  const done = new Set(locked || []);
  return matchups.findIndex(m => open.has(m.id) && !done.has(m.id));
}

/** Questions step within one competition; null past its last question, or before its first. */
export function nextQuestion(step, nQuestions) { return step + 1 < nQuestions ? step + 1 : null; }
export function prevQuestion(step) { return step > 0 ? step - 1 : null; }

/** A question is answered once it carries both a vote and a crowd call. */
export function isQuestionAnswered(key, answer) {
  if (!answer || !answer.vote) return false;
  return key === 'overall'
    ? !!answer.predicted
    : !!answer.contestant && typeof answer.share === 'number';
}

/**
 * The prediction a slider position stands for. The overall question records which
 * contestant the room will pick; a category records the share as well. Dead centre is
 * not a call, so it clears the prediction rather than recording a fifty.
 */
export function predictionPatch(key, pos, leftId, rightId) {
  const split = splitFromSlider(pos, leftId, rightId);
  if (!split) return key === 'overall' ? { predicted: null, share: null }
                                       : { contestant: null, share: null };
  return key === 'overall' ? { predicted: split.contestant, share: split.share }
                           : { contestant: split.contestant, share: split.share };
}

/** Where the slider sits for a stored answer. */
export function sliderOf(key, answer, leftId) {
  if (key !== 'overall') return sliderFromSplit(answer, leftId);
  if (!answer || !answer.predicted) return 50;
  // an answer saved before the overall question had a slider carries no share
  const share = typeof answer.share === 'number' ? answer.share : DEFAULT_SHARE;
  return answer.predicted === leftId ? share : 100 - share;
}
