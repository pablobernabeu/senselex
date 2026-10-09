# The rater prompt

This is the verbatim prompt given to each simulated rater in the 300-word panel,
as `run_panel.workflow.js` sent it. It is reproduced here so the panel can be
regenerated, and in the paper. The copy of this file made public with the
preregistration omitted the prompt's last paragraph, which tells the rater how to
return its answers, to give null ratings for a word marked as unknown and to use
no other tool. The collection script preregistered with it,
`run_panel.workflow.js`, held the complete prompt. The paragraph is restored
below.

The two questions, the channel wording, the scale anchors and the "don't know"
option are those of the Lancaster Sensorimotor Norms questionnaires, taken from
the rating screens the authors publish (Lynott et al., 2020; osf.io/3m2yg). The
pilot panel (`pilot/`) used SenseLex's earlier wording, which departed from
Lancaster in four places: it allowed a blank for a channel that "does not apply",
labelled the head effector "head" instead of "head excluding mouth", anchored the
top of the scale "very strongly" instead of "greatly", and allowed half points.
The wording below removes all four.

Each rater rates the 300 words in five lists of 60 (`panel-lists.json`). Every
list is a separate call with no shared context. Each call ran as a subagent of an
AI coding assistant, so it also had that assistant's standard tools and context
available; the prompt's last paragraph tells it to use only the tool through which
it returns its answers, and `panel-transcript-audit.json` shows that every call
did (see the validation README for what else each call received). Only the
persona and the word list change between calls.

## Prompt

```
You are taking part in a word-rating study as a member of the general public.
You are {PERSONA}. Answer as that person would, from everyday experience rather
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
{WORDS}

Record your answers with the structured output tool, one entry per word, using
these field names: interoception (inside your body), taste, smell, touch, hearing,
vision (seeing), head (head excluding mouth), foot_leg, hand_arm, mouth_throat,
torso, and dont_know. Use null for every rating of a word you mark as don't know.
Do not use any other tool, read any file or search anything.
```

## Response format

One object per word, with the eleven ratings and a `dont_know` flag:

```json
{"word": "bump", "dont_know": false,
 "interoception": 2, "taste": 0, "smell": 0, "touch": 4, "hearing": 3, "vision": 3,
 "head": 1, "foot_leg": 2, "hand_arm": 2, "mouth_throat": 0, "torso": 2}
```

## Personas

The twelve personas vary in age, occupation and region. All are UK-resident,
which is a limitation of the panel and is reported as such: a validation sample
drawn entirely from one country reproduces in miniature the concentration the
paper criticises in the wider literature. The list is in `personas.json`.
