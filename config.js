// Session configuration. Everything a run of the session needs to change lives here.
export const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzuWOwMRpYABdBa3q3MYHlR_jQaiXm5j7EQ3VJOjy3-SDDD6ckSH7sBAUo0Xg0RFNP_/exec';

// The four categories, taken from the pilot mockup (Pilot mockup.pdf, 2026-09-23).
// The mockup answers the question the design left open: Confidence and Sense of Humour
// need video, and the pilot replaces them with two categories that can be judged from a
// photograph. `question` is the wording on the yellow banner; `label` is the short name
// used on the review, results and presenter screens.
export const CATEGORIES = [
  { key: 'smile', label: 'Best smile', question: 'the best smile?', media: 'image',
    hint: 'Expression, smile, eyes, overall look.' },
  { key: 'style', label: 'Style', question: 'the best style?', media: 'image',
    hint: 'Fashion, grooming, hair, accessories.' },
  { key: 'body',  label: 'Body', question: 'the best body?', media: 'image',
    hint: 'Posture, presence, the whole frame.' },
  { key: 'mama',  label: 'Take to Mama', question: 'Take to Mama?', media: 'image',
    hint: 'Who would you introduce at home?' }
];

// Ten contestants in five matchups. These are the AI demo portraits already used in the
// mockups, labelled as such there; they are not real contestants. Swap in the real set
// when Avishai delivers it, keeping the c1..c10 ids so stored answers still resolve.
export const MATCHUPS = [
  { id: 'm1', a: { id: 'c1', name: 'Ana', photo: 'photos/c1.jpg' }, b: { id: 'c2', name: 'Camila', photo: 'photos/c2.jpg' } },
  { id: 'm2', a: { id: 'c3', name: 'Carolina', photo: 'photos/c3.jpg' }, b: { id: 'c4', name: 'Daniela', photo: 'photos/c4.jpg' } },
  { id: 'm3', a: { id: 'c5', name: 'Gabriela', photo: 'photos/c5.jpg' }, b: { id: 'c6', name: 'Isabella', photo: 'photos/c6.jpg' } },
  { id: 'm4', a: { id: 'c7', name: 'Juliana', photo: 'photos/c7.jpg' }, b: { id: 'c8', name: 'Laura', photo: 'photos/c8.jpg' } },
  { id: 'm5', a: { id: 'c9', name: 'Luciana', photo: 'photos/c9.jpg' }, b: { id: 'c10', name: 'Manuela', photo: 'photos/c10.jpg' } }
];
