// Session configuration. Everything a run of the session needs to change lives here.
export const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzuWOwMRpYABdBa3q3MYHlR_jQaiXm5j7EQ3VJOjy3-SDDD6ckSH7sBAUo0Xg0RFNP_/exec';

// The specification's four categories. Confidence and Sense of Humour are judged from
// video in the real product, and there is no video for this session, so they carry
// `needsReplacement` until Mati and Avishai supply two photo-judgeable categories.
// The presenter console shows a warning while any remain.
export const CATEGORIES = [
  { key: 'smile',      label: 'Best Smile', media: 'image',
    hint: 'Expression, smile, eyes, overall look.' },
  { key: 'style',      label: 'Style', media: 'image',
    hint: 'Fashion, grooming, hair, accessories.' },
  { key: 'confidence', label: 'Confidence', media: 'video', needsReplacement: true,
    hint: 'Character, authenticity, communication, charisma.' },
  { key: 'humour',     label: 'Sense of Humour', media: 'video', needsReplacement: true,
    hint: 'Confidence, body language, eye contact, energy.' }
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
