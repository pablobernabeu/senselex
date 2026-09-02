// Reference seed data. It populates a small, illustrative slice of the kind of
// content the Atlas holds: a spread of languages chosen to vary orthographic
// depth and script, a few Concepticon-style concepts, and enough ratings and
// naming responses per word that the norm computations return something
// meaningful. It is deterministic so that demonstrations and the smoke test are
// repeatable.

const LANGUAGES = [
  { code: 'eng', name: 'English', script: 'Latin', orthographicDepth: 'deep', direction: 'ltr' },
  { code: 'fin', name: 'Finnish', script: 'Latin', orthographicDepth: 'shallow', direction: 'ltr' },
  { code: 'arb', name: 'Modern Standard Arabic', script: 'Arabic', orthographicDepth: 'intermediate', direction: 'rtl' },
  { code: 'kan', name: 'Kannada', script: 'Kannada', orthographicDepth: 'non_alphabetic', direction: 'ltr' },
  { code: 'cmn', name: 'Mandarin Chinese', script: 'Han', orthographicDepth: 'non_alphabetic', direction: 'ltr' },
  { code: 'jhi', name: 'Jahai', script: 'Latin', orthographicDepth: 'shallow', direction: 'ltr' },
];

// A concept's own id is local to the study; concepticonId is the optional link
// out to the Concepticon catalogue (https://concepticon.clld.org), which is what
// lets norms from different languages be compared concept by concept.
//
// Only SMOKE carries an id here, checked against concepticon.clld.org/parameters/778
// (concept set SMOKE (EXHAUST)). The others are null on purpose. An unverified
// identifier is worse than an absent one, because a wrong link silently joins two
// unrelated concepts in any later merge, and nothing in the suite validates the
// field. Resolve these against the catalogue before using them for anything real.
const CONCEPTS = [
  { id: 'COFFEE', gloss: 'coffee', concepticonId: null },
  { id: 'SMOKE', gloss: 'smoke', concepticonId: '778' },
  { id: 'LEMON', gloss: 'lemon', concepticonId: null },
  { id: 'THUNDER', gloss: 'thunder', concepticonId: null },
  { id: 'SOFT', gloss: 'soft', concepticonId: null },
];

// A handful of words with several rater vectors each. Strengths are plausible
// rather than empirical; they exist to exercise the maths.
const WORDS = [
  {
    language: 'eng', concept: 'COFFEE', word: 'coffee',
    vectors: [
      { smell: 5, taste: 5, vision: 3, touch: 2, hearing: 1, interoception: 2 },
      { smell: 5, taste: 4, vision: 3, touch: 2, hearing: 1, interoception: 1 },
      { smell: 4, taste: 5, vision: 2, touch: 1, hearing: 0, interoception: 2 },
    ],
  },
  {
    language: 'eng', concept: 'THUNDER', word: 'thunder',
    vectors: [
      { hearing: 5, vision: 3, touch: 1, smell: 0, taste: 0, interoception: 2 },
      { hearing: 5, vision: 4, touch: 0, smell: 0, taste: 0, interoception: 1 },
      { hearing: 5, vision: 3, touch: 1, smell: 0, taste: 0, interoception: 2 },
    ],
  },
  {
    language: 'fin', concept: 'COFFEE', word: 'kahvi',
    vectors: [
      { smell: 5, taste: 5, vision: 3, touch: 1, hearing: 0, interoception: 2 },
      { smell: 4, taste: 5, vision: 2, touch: 1, hearing: 1, interoception: 1 },
    ],
  },
  {
    language: 'jhi', concept: 'SMOKE', word: 'cŋɛs',
    vectors: [
      { smell: 5, vision: 2, taste: 1, touch: 1, hearing: 0, interoception: 1 },
      { smell: 5, vision: 3, taste: 1, touch: 0, hearing: 0, interoception: 1 },
      { smell: 5, vision: 2, taste: 2, touch: 1, hearing: 0, interoception: 2 },
    ],
  },
];

// Free-naming responses, coded by type, used for the codability norms.
const RESPONSES = [
  { language: 'eng', concept: 'SMOKE', responses: [
    ['smoky', 'source_based'], ['burnt', 'source_based'], ['bonfire', 'source_based'],
    ['acrid', 'abstract'], ['woody', 'source_based'], ['horrible', 'evaluative'],
  ] },
  { language: 'jhi', concept: 'SMOKE', responses: [
    ['cŋɛs', 'abstract'], ['cŋɛs', 'abstract'], ['cŋɛs', 'abstract'],
    ['ltpɨt', 'abstract'], ['cŋɛs', 'abstract'], ['ltpɨt', 'abstract'],
  ] },
];

export function seed(repo) {
  for (const language of LANGUAGES) repo.upsertLanguage(language);
  for (const concept of CONCEPTS) repo.upsertConcept(concept);

  let counter = 0;
  for (const entry of WORDS) {
    entry.vectors.forEach((vector, index) => {
      repo.insertRating({
        clientId: `seed-r-${entry.language}-${entry.concept}-${index}`,
        languageCode: entry.language,
        conceptId: entry.concept,
        word: entry.word,
        participantRef: null,
        ratings: vector,
        source: 'import',
      });
      counter += 1;
    });
  }

  let responseCounter = 0;
  for (const block of RESPONSES) {
    block.responses.forEach(([name, type], index) => {
      repo.insertResponse({
        clientId: `seed-n-${block.language}-${block.concept}-${index}`,
        languageCode: block.language,
        conceptId: block.concept,
        name,
        responseType: type,
        length: name.split(/\s+/).filter(Boolean).length,
        participantRef: null,
        source: 'import',
      });
      responseCounter += 1;
    });
  }

  return { languages: LANGUAGES.length, concepts: CONCEPTS.length, ratings: counter, responses: responseCounter };
}
