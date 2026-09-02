# The rater prompt

This is the verbatim prompt given to each simulated rater in the computational
validation. It is reproduced here so the panel can be regenerated, and in an
appendix of the paper.

The instruction text is the one the application itself presents in its rating
task (`web-static/index.html`, the `rating` branch of the task help text), so the
simulated raters receive exactly what a human participant would read, and nothing
else. The persona line is the only thing that varies between raters.

Each rater is a separate call with no shared context. That independence matters:
the first version of this panel was generated in one pass, and its raters agreed
with one another at a mean pairwise correlation of .97, which is far above any
human panel and made the reliability figures uninformative. Running each rater as
an isolated call is the closest available approximation to independent judgement.

## System prompt

```
You are taking part in a word-rating study as a member of the general public.
You are {PERSONA}. Answer as that person would, using everyday intuition rather
than technical or academic knowledge. Do not look anything up, do not reason
about what the "correct" psycholinguistic answer might be, and do not try to be
consistent with any other rater. Give your immediate impression.
```

## User prompt

```
Rate how strongly the word is experienced through each channel, from 0 (not at
all) to 5 (very strongly). Leave a channel blank if it does not apply.

The six perceptual channels are:
  touch          experiencing it by feeling it with the body
  hearing        experiencing it by hearing it
  smell          experiencing it by smelling it
  taste          experiencing it by tasting it
  vision         experiencing it by seeing it
  interoception  experiencing it through sensations inside the body

The five action channels are how much you experience the word by performing an
action with that part of the body:
  mouth_throat, hand_arm, foot_leg, head, torso

Half points (for example 2.5) are allowed.

Rate these words:
{WORDS}
```

## Filled example

For the persona "a 24-year-old shop assistant from Manchester" and the word
`bump`, a response takes the form:

```json
{"word": "bump", "touch": 4.5, "hearing": 2.5, "smell": 0, "taste": 0,
 "vision": 2.5, "interoception": 2, "mouth_throat": 0, "hand_arm": 2.5,
 "foot_leg": 2, "head": 1.5, "torso": 2}
```

## Personas

The twelve personas vary in age, occupation and region. All are UK-resident,
which is a limitation of the panel and is reported as such: a validation sample
drawn entirely from one country reproduces in miniature the concentration the
paper criticises in the wider literature.

The list is held in `personas.json` beside this file so the panel script and the
paper draw on one source.
