import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, setAnswer, isComplete } from './draft.js';

const CATS = [{ key: 'smile' }, { key: 'style' }, { key: 'photo_a' }, { key: 'photo_b' }];
const MATCHES = [{ id: 'm1' }, { id: 'm2' }];

test('a fresh draft is not complete', () => {
  assert.equal(isComplete(emptyDraft(MATCHES, CATS), MATCHES, CATS), false);
});

test('an answer is recorded and read back', () => {
  let d = emptyDraft(MATCHES, CATS);
  d = setAnswer(d, 'm1', 'overall', { vote: 'c1', predicted: 'c2' });
  assert.deepEqual(d.m1.overall, { vote: 'c1', predicted: 'c2' });
});

test('setAnswer does not mutate the draft it was given', () => {
  const before = emptyDraft(MATCHES, CATS);
  setAnswer(before, 'm1', 'overall', { vote: 'c1', predicted: 'c2' });
  assert.equal(before.m1.overall, null);
});

test('a draft is complete only when every question on every matchup is answered', () => {
  let d = emptyDraft(MATCHES, CATS);
  for (const m of MATCHES) {
    d = setAnswer(d, m.id, 'overall', { vote: 'a', predicted: 'a' });
    for (const c of CATS) d = setAnswer(d, m.id, c.key, { vote: 'a', contestant: 'a', share: 60 });
  }
  assert.equal(isComplete(d, MATCHES, CATS), true);
});

test('a category answer without a share is not complete', () => {
  let d = emptyDraft(MATCHES, CATS);
  d = setAnswer(d, 'm1', 'smile', { vote: 'a', contestant: 'a' });
  assert.equal(isComplete(d, MATCHES, CATS), false);
});

test('answering only the first matchup is not complete', () => {
  let d = emptyDraft(MATCHES, CATS);
  d = setAnswer(d, 'm1', 'overall', { vote: 'a', predicted: 'a' });
  for (const c of CATS) d = setAnswer(d, 'm1', c.key, { vote: 'a', contestant: 'a', share: 60 });
  assert.equal(isComplete(d, MATCHES, CATS), false);
});
