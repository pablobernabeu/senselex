// The rating protocol follows the Lancaster Sensorimotor Norms (Lynott, Connell,
// Brysbaert, Brand, & Carney, 2020): six perceptual channels and five action
// effectors, each rated from 0 to 5. Keeping these as the single source of truth
// means the database schema, the validators, the norm maths, and the rating form
// can never drift apart.

export const PERCEPTUAL_DIMENSIONS = Object.freeze([
  'touch',
  'hearing',
  'smell',
  'taste',
  'vision',
  'interoception',
]);

export const ACTION_DIMENSIONS = Object.freeze([
  'mouth_throat',
  'hand_arm',
  'foot_leg',
  'head',
  'torso',
]);

export const ALL_DIMENSIONS = Object.freeze([
  ...PERCEPTUAL_DIMENSIONS,
  ...ACTION_DIMENSIONS,
]);

export const RATING_MIN = 0;
export const RATING_MAX = 5;

// Elicitation responses are coded in the tradition Majid and colleagues use, so
// that codability can be quantified rather than only described.
export const RESPONSE_TYPES = Object.freeze(['abstract', 'source_based', 'evaluative']);
