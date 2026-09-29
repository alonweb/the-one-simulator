import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionsOf, isQuestionAnswered, predictionPatch, sliderOf, photoFor } from './flow.js';

const CATS = [{ key: 'smile', label: 'the best smile?' }, { key: 'style', label: 'the best style?' }];

test('the questions are the overall one followed by the categories, numbered from one', () => {
  const qs = questionsOf(CATS);
  assert.deepEqual(qs.map(q => q.key), ['overall', 'smile', 'style']);
  assert.deepEqual(qs.map(q => q.n), [1, 2, 3]);
  assert.equal(qs[0].label, 'who is the one?');
  assert.equal(qs[2].label, 'the best style?');
});

test('the overall question needs a vote and a predicted contestant', () => {
  assert.equal(isQuestionAnswered('overall', { vote: 'c1' }), false);
  assert.equal(isQuestionAnswered('overall', { vote: 'c1', predicted: 'c2' }), true);
});

test('a category needs a vote, a contestant and a share', () => {
  assert.equal(isQuestionAnswered('smile', { vote: 'c1', contestant: 'c1' }), false);
  assert.equal(isQuestionAnswered('smile', { vote: 'c1', contestant: 'c1', share: 60 }), true);
});

test('an unanswered question is not answered', () => {
  assert.equal(isQuestionAnswered('overall', null), false);
  assert.equal(isQuestionAnswered('smile', undefined), false);
});

test('the slider writes predicted for the overall question and contestant for a category', () => {
  assert.deepEqual(predictionPatch('overall', 58, 'c1', 'c2'), { predicted: 'c1', share: 58 });
  assert.deepEqual(predictionPatch('smile', 42, 'c1', 'c2'), { contestant: 'c2', share: 58 });
});

test('the slider at dead centre clears the prediction, because fifty is not a call', () => {
  assert.deepEqual(predictionPatch('overall', 50, 'c1', 'c2'), { predicted: null, share: null });
  assert.deepEqual(predictionPatch('smile', 50, 'c1', 'c2'), { contestant: null, share: null });
});

test('a stored answer puts the slider back where it was left', () => {
  assert.equal(sliderOf('overall', { predicted: 'c1', share: 58 }, 'c1'), 58);
  assert.equal(sliderOf('overall', { predicted: 'c2', share: 58 }, 'c1'), 42);
  assert.equal(sliderOf('smile', { contestant: 'c2', share: 70 }, 'c1'), 30);
  assert.equal(sliderOf('smile', null, 'c1'), 50);
});

test('an overall prediction saved before shares were recorded still places the slider', () => {
  assert.equal(sliderOf('overall', { predicted: 'c1' }, 'c1'), 51);
  assert.equal(sliderOf('overall', { predicted: 'c2' }, 'c1'), 49);
});

test('a category may carry the banner wording separately from its short name', () => {
  const qs = questionsOf([{ key: 'mama', label: 'Take to Mama', question: 'Take to Mama?' }]);
  assert.equal(qs[1].label, 'Take to Mama?');
  assert.equal(qs[1].short, 'Take to Mama');
});

test('each question shows the photograph taken for it, the general one for who is the one', () => {
  const c = { photo: 'photos/c1-general.jpg', photos: { smile: 'photos/c1-smile.jpg' } };
  assert.equal(photoFor(c, 'overall'), 'photos/c1-general.jpg');
  assert.equal(photoFor(c, 'smile'), 'photos/c1-smile.jpg');
});

test('a category without its own photograph falls back to the general one', () => {
  assert.equal(photoFor({ photo: 'photos/c1-general.jpg', photos: {} }, 'body'), 'photos/c1-general.jpg');
  assert.equal(photoFor({ photo: 'photos/c1.jpg' }, 'body'), 'photos/c1.jpg');
});
