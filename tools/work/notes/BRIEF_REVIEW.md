# Task: fact-check per-option explanations for TOEIC-style questions

A Taiwanese learner studies with a practice website. After each question the site shows a
「解題關鍵」 line and a short explanation under each option. These explanations were written by someone
else. He will trust them and repeat them in his head on the real test — a wrong grammar rule or a
false statement about a passage would actively hurt him. Your job is to find statements that are
**wrong or misleading** and supply a corrected line.

## Files

You get pairs of files: the questions (with the answer key) and the explanations written for them.
The explanation formats are described in `/home/claude/work/notes/BRIEF_P5.md`,
`/home/claude/work/notes/BRIEF_READ.md` and `/home/claude/work/notes/BRIEF_LISTEN.md` (read the one
for your kind), and the shared rules in `/home/claude/work/notes/BRIEF_COMMON.md`.

## What counts as a problem

Flag it when a statement is:

1. **False about English** — a grammar rule that is not a rule (「whether 一定要搭配 or not」), a
   pattern or collocation that is not standard, a wrong part of speech, a wrong meaning, a claim
   that a form "cannot" go somewhere when it can.
2. **False about this question** — the reason given for an option being wrong does not actually
   hold in this sentence; a wrong option is said to be ungrammatical when it is grammatical and
   fails only on meaning (or the reverse); the `key` points at the wrong clue.
3. **False about the passage** (reading) — a quoted phrase is not in the passage, 「文中沒提到」 for
   something the passage does mention, a wrong date, name or number.
4. **Wrong trap label** (listening) — only when the label is clearly wrong, not when two labels
   are both defensible.
5. **Wrong Chinese** — a mistranslation, a Simplified character, or mainland-only wording.
6. **Empty calories** — a `why` that gives no reason at all (「不是此處的固定搭配」「語意不合」 with
   nothing else). Supply the actual reason.

Do **not** flag style, length, or anything that is correct but could be phrased differently. If an
item is fine, say nothing about it. Expect most items to be fine.

## Output

A JSON array with one object per problem (an empty array `[]` if you find none):

```json
{"id": "r800-23.3", "field": "notes.1.why", "problem": "whether does not require 'or not'",
 "fix": "Whether 是「是否／不論」，放句首語意不通"}
```

- `id`: the question id. For reading use `<passage id>.<n>`, e.g. `r800-23.3`.
- `field`: `key`, or `notes.<i>.<name>` where `<i>` is the 0-based position of the note in that
  question's `notes` array and `<name>` is the field (`why`, `use`, `zh`, `pos`, `trap`).
- `problem`: one short English sentence saying what is wrong.
- `fix`: the full replacement text for that field, following the original brief's style and length
  limits (key ≤ 60, use ≤ 50, why ≤ 45 for Part 5 and listening or ≤ 50 for reading, zh ≤ 16 for
  Part 5 or ≤ 30 for reading). Traditional Chinese, Taiwan usage. It must itself be accurate.

Work through **every** question — do not sample. Write your findings to the output file as you go
(append in batches), then check it:

```
python3 /home/claude/work/notes/review_check.py <explanations file> <your output file>
```

It must print `OK`. Do not edit the explanation files themselves. Do not spawn other agents.
Final reply: the number of problems found per file, nothing else.
