// The procedure that collected the 300-word simulated-rater panel.
//
// This is a Claude Code workflow script, archived so that the collection step is
// as inspectable as the analysis. It was run with `args` set to the contents of
// panel-lists.json. Each call to agent() starts a separate model instance with no
// shared context; the prompt text below is the one reproduced in rater-prompt.md.
//
// The workflow runtime is not needed to reproduce the panel. Any model can fill
// raters.json by sending the prompt in rater-prompt.md once per rater per list
// and recording the replies in the shape documented there.

export const meta = {
  name: 'senselex-panel-300',
  description: 'Collect the 300-word simulated-rater panel: 12 raters x 5 lists of 60, one isolated call per list',
  phases: [{ title: 'Rate', detail: 'sixty isolated calls, one per rater per list' }],
}

const input = typeof args === 'string' ? JSON.parse(args) : args
const CHANNELS = ['interoception', 'taste', 'smell', 'touch', 'hearing', 'vision',
  'head', 'foot_leg', 'hand_arm', 'mouth_throat', 'torso']

const rating = { type: ['integer', 'null'], minimum: 0, maximum: 5 }
const SCHEMA = {
  type: 'object',
  properties: {
    ratings: {
      type: 'array',
      items: {
        type: 'object',
        properties: Object.fromEntries([
          ['word', { type: 'string' }],
          ['dont_know', { type: 'boolean' }],
          ...CHANNELS.map((c) => [c, rating]),
        ]),
        required: ['word', 'dont_know', ...CHANNELS],
      },
    },
  },
  required: ['ratings'],
}

function promptFor(persona, words) {
  return `You are taking part in a word-rating study as a member of the general public.
You are ${persona}. Answer as that person would, from everyday experience rather
than technical or academic knowledge. Do not look anything up, do not reason
about what the "correct" answer might be, and do not try to be consistent with
anyone else. Give your immediate impression.

For each word below, answer two questions.

Question 1. To what extent do you experience WORD
  - by sensations inside your body
  - by tasting
  - by smelling
  - by feeling through touch
  - by hearing
  - by seeing

Question 2. To what extent do you experience WORD by performing an action with the
  - head excluding mouth
  - foot / leg
  - hand / arm
  - mouth / throat
  - torso

Answer every line with a whole number from 0 (not at all) to 5 (greatly). If you
do not experience the word at all in some way, that line is 0. If you do not know
the meaning of a word, mark it as "don't know" and give no ratings for it.

Words:
${words.join('\n')}

Record your answers with the structured output tool, one entry per word, using
these field names: interoception (inside your body), taste, smell, touch, hearing,
vision (seeing), head (head excluding mouth), foot_leg, hand_arm, mouth_throat,
torso, and dont_know. Use null for every rating of a word you mark as don't know.
Do not use any other tool, read any file or search anything.`
}

const jobs = input.raters.flatMap((r) => r.lists.map((words, l) => ({ rater: r.rater, persona: r.persona, list: l + 1, words })))

phase('Rate')
const results = await parallel(jobs.map((j) => async () => {
  const run = () => agent(promptFor(j.persona, j.words), { label: `${j.rater}:list${j.list}`, phase: 'Rate', schema: SCHEMA })
  let r = await run()
  let retried = false
  const complete = (x) => x && Array.isArray(x.ratings) && x.ratings.length === j.words.length
  if (!complete(r)) { retried = true; r = await run() }
  return { rater: j.rater, persona: j.persona, list: j.list, words: j.words, retried, ratings: r ? r.ratings : null }
}))

const failed = results.filter((x) => !x || !x.ratings || x.ratings.length !== x.words.length)
log(`${results.length - failed.length} of ${jobs.length} lists complete; ${results.filter((x) => x && x.retried).length} re-requested once`)
// The runtime forbids reading the clock, so the collection date is recorded in
// raters.json's provenance block after the run returns.
return { results }
