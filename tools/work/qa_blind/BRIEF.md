# Task: solve English test questions and report problems

You are checking a bank of original TOEIC-style practice questions written for a Taiwanese learner.
You get the questions **without the answer key**. Solve each one carefully as an expert English
teacher would, and flag any question that is flawed. Your answers will be compared with the key, so
work only from the input file you are given: do not look for, open or search for any other file
under `/home/claude/work/` (no keys, no drafts, no other folders). Do not spawn other agents.

## Input

A JSON file, one of three kinds:

- **p5** (sentence completion): `[{"id","q","options":[4]}]` — `q` has one blank `-------`.
- **listen** (question–response): `[{"id","q","options":[3]}]` — `q` is a spoken question or
  statement; pick the one response that is an appropriate reply.
- **read** (passages): `[{"id","part","title","text","questions":[{"n","q","options":[4]}]}]`.
  Part 6 passages have blanks `[1] -------` etc. and question `q` is `"[1]"`; part 7 questions
  are ordinary comprehension questions.

## What to produce

Write a JSON array to the output path you are given, one object per question:

```json
{"id": "p123", "pick": 2, "sure": true, "note": ""}
```

- `id`: for p5 and listen, the item id. For read, `"<passage id>.<n>"`, e.g. `"r600-07.2"`.
- `pick`: the 0-based index of the option you judge correct.
- `sure`: `false` if you think the question is flawed or you could defend another option. Use it
  honestly — a good test item has exactly one defensible answer.
- `note`: empty when all is fine. Otherwise one short English sentence saying what is wrong, e.g.
  `"option 1 'delay' also fits"`, `"no option is correct"`, `"grammar error: 'informations'"`,
  `"unnatural English: ..."`, `"passage does not say this"`, `"two options identical in meaning"`.

Flag (`sure: false` + note) when:
- more than one option is acceptable, or none is;
- the sentence, passage or an option contains a grammar or spelling mistake, or English a native
  speaker would find clearly unnatural (the intended wrong options being wrong is of course fine);
- for read: the answer is not actually supported by the passage, or the passage contradicts itself
  (dates, names, numbers);
- for listen: a "wrong" response would in fact be a reasonable (even indirect) reply.

Do not flag things merely for being easy or hard.

Work through every question — do not skip or sample. Solve in batches (for example 40–50 questions
at a time), reasoning about each one, and append as you go. When finished, check that your output is
valid JSON and has exactly one entry per question:

```
python3 /home/claude/work/qa_blind/check.py <input file> <output file>
```

It must print `OK`. Then reply with: how many you flagged, and the list of flagged ids with notes.
