export function emptyDraft(matchups, categories) {
  const d = {};
  for (const m of matchups) d[m.id] = { overall: null, categories: {} };
  return d;
}

export const DEFAULT_SHARE = 51;

export function setAnswer(draft, matchupId, key, value) {
  const next = JSON.parse(JSON.stringify(draft));
  if (key === 'overall') next[matchupId].overall = value;
  else next[matchupId].categories[key] = value;
  return next;
}

export function isComplete(draft, matchups, categories) {
  for (const m of matchups) {
    const entry = draft[m.id];
    if (!entry || !entry.overall || !entry.overall.vote || !entry.overall.predicted) return false;
    for (const c of categories) {
      const a = entry.categories[c.key];
      if (!a || !a.vote || !a.contestant || typeof a.share !== 'number') return false;
    }
  }
  return true;
}

const KEY = 'theone.draft.v1';

export function saveDraft(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export function loadDraft() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

/** True only for an explicit ?reset= flag, so a participant never resets by accident. */
export function wantsReset(search) {
  const v = new URLSearchParams(search || '').get('reset');
  return v !== null && v !== '0' && v !== 'false' && v !== '';
}

/** The matchups and categories a draft was written against. */
export function shapeOf(matchups, categories) {
  return matchups.map(m => m.id).join(',') + '|' + categories.map(c => c.key).join(',');
}

/** True only if a saved draft was written against the configuration now in force. */
export function draftMatches(saved, matchups, categories) {
  return !!saved && saved.shape === shapeOf(matchups, categories);
}

/** Empties one matchup's answers, leaving every other matchup untouched. */
export function clearMatchup(draft, matchupId) {
  const next = JSON.parse(JSON.stringify(draft));
  next[matchupId] = { overall: null, categories: {} };
  return next;
}

/**
 * One slider, both sides. The value is the LEFT contestant's predicted share, so
 * sliding past half predicts the left contestant and below half predicts the right.
 * Exactly half predicts nobody, which is the same reason the specification floors a
 * category prediction at 51.
 */
export function splitFromSlider(value, leftId, rightId) {
  if (value === 50) return null;
  return value > 50
    ? { contestant: leftId, share: value }
    : { contestant: rightId, share: 100 - value };
}

/** The slider position that represents a stored prediction. */
export function sliderFromSplit(answer, leftId) {
  if (!answer || !answer.contestant || typeof answer.share !== 'number') return 50;
  return answer.contestant === leftId ? answer.share : 100 - answer.share;
}
