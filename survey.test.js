import test from 'node:test';
import assert from 'node:assert/strict';
import { setSurveyAnswer, isSurveyComplete, surveyTable } from './survey.js';

const Q = [
  { key: 'clear', label: 'How clear was it?', type: 'scale', min: 1, max: 5 },
  { key: 'hardest', label: 'Hardest question?', type: 'choice', options: ['Smile', 'Style'] },
  { key: 'why', label: 'What would bring you back?', type: 'text' },
  { key: 'extra', label: 'Anything else?', type: 'text', required: false }
];

test('setSurveyAnswer returns a new object and keeps the others', () => {
  const a = setSurveyAnswer({ clear: 3 }, 'why', 'the photos');
  assert.deepEqual(a, { clear: 3, why: 'the photos' });
});

test('a survey is complete only when every required question has a valid answer', () => {
  assert.equal(isSurveyComplete({}, Q), false);
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Smile', why: 'fun' }, Q), true);
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Smile', why: '   ' }, Q), false, 'blank text does not count');
  assert.equal(isSurveyComplete({ clear: 9, hardest: 'Smile', why: 'fun' }, Q), false, 'scale out of range');
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Nope', why: 'fun' }, Q), false, 'choice not offered');
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Smile', why: 'fun', extra: '' }, Q), true, 'optional may be empty');
});

test('surveyTable lays every participant out in question order, blank where unanswered', () => {
  const rows = [
    { receivedAt: '2026-09-26T10:00:00Z', submissionId: 's1', participant: 'Ana', answers: { clear: 4, hardest: 'Style', why: 'fun' } },
    { receivedAt: '2026-09-26T10:01:00Z', submissionId: 's2', participant: 'Bo', answers: { clear: 2 } }
  ];
  const t = surveyTable(rows, Q);
  assert.deepEqual(t.header, ['How clear was it?', 'Hardest question?', 'What would bring you back?', 'Anything else?']);
  assert.deepEqual(t.rows, [
    { participant: 'Ana', cells: ['4', 'Style', 'fun', ''] },
    { participant: 'Bo', cells: ['2', '', '', ''] }
  ]);
});

test('surveyTable ignores rows without answers', () => {
  const t = surveyTable([{ participant: 'X', answers: null }, { participant: 'Y' }], Q);
  assert.deepEqual(t.rows, []);
});
