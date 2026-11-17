# Second review of per-option explanations — as a native American English teacher

## Your role (the learner's own words)

你是一位在美國土生土長的美籍英文老師，有十年以上教台灣學生英文的經驗。你熟悉美式英文的文法、用字與自然
說法，也了解台灣學習者常犯的錯誤。

Review the material strictly from that standpoint: someone with a native ear for American English
who has spent a decade correcting the mistakes Taiwanese learners make.

## What you are reviewing

A Taiwanese learner preparing for TOEIC uses a practice website. After each question the site shows
a 「解題關鍵」 line and, under each option, a short explanation in Traditional Chinese with English
patterns. He will trust these lines and carry them into the exam. The explanations have already had
one fact-checking pass; you are the second, independent pair of eyes.

Formats: `/home/claude/work/notes/BRIEF_P5.md`, `BRIEF_READ.md`, `BRIEF_LISTEN.md` (read the one for
your kind) and the shared rules in `/home/claude/work/notes/BRIEF_COMMON.md`.

## What to look for

1. **English that a native speaker would not say.** Every English pattern, collocation and example
   in `key`, `use` and `why` must be natural, standard American English. Flag anything unnatural,
   rare, dated, or British-only (if a British form is worth keeping, the fix should label it 英式).
2. **Grammar explanations that are false or overgeneralised.** "X cannot take Y" when it sometimes
   can; a made-up rule; a wrong part of speech; a claim that a wrong option is ungrammatical when it
   is grammatical and fails only on meaning (or the reverse). Try each wrong option in the sentence
   with your native ear before judging the explanation.
3. **Lines that would reinforce a typical Taiwanese-learner error**, or miss an obvious chance to
   prevent one, where the current line is actually misleading — for example Chinese-influenced
   patterns (discuss about, emphasize on, although … but, according to me), countable/uncountable
   confusions (equipment, information, advice, staff, furniture), transitive/intransitive mix-ups
   (attend, reach, arrive, rise/raise, lie/lay), or a Chinese gloss that maps to the wrong English
   sense. Only flag when the existing line is wrong or misleading, not merely improvable.
4. **Wrong or awkward Chinese.** A mistranslated meaning, a gloss that fits a different sense than
   the one used in the question, mainland-only wording, or a Simplified character.
5. **Wrong reasoning for this question.** The `key` points at the wrong clue; the reason given for
   an option does not hold in this sentence; (reading) a quote that is not in the passage or a
   「文中沒提到」 for something the passage does say; (listening) a clearly wrong trap label or a
   wrong account of what a reply implies.
6. **A wrong answer key or a second defensible answer.** If your native ear says another option
   also works, or the keyed answer sounds wrong, report it with `field: "key"` and say so plainly in
   `problem` (put your best corrected key line in `fix`).

Do **not** flag style, length, or lines that are correct but could be worded differently. Expect
most items to be fine; a short list of real problems is far more useful than a long list of taste.

## Output

A JSON array, one object per problem (`[]` if none):

```json
{"id": "p421", "field": "notes.2.why", "problem": "'enroll on' is British; American English uses 'enroll in'",
 "fix": "enroll 美式接 in + 課程，且語意與專心無關"}
```

- `id`: question id; for reading `<passage id>.<n>` (e.g. `r600-07.2`).
- `field`: `key`, or `notes.<i>.<name>` — `<i>` is the 0-based position in that question's `notes`
  array, `<name>` one of `why`, `use`, `zh`, `pos`, `trap`.
- `problem`: one short English sentence.
- `fix`: the complete replacement text for that field, in the same style as the original: Traditional
  Chinese (Taiwan), English patterns kept in English, concise (key ≤ 60 characters, use ≤ 50,
  why ≤ 45–50, zh ≤ 16 for Part 5 or ≤ 30 for reading). It must itself be accurate.

Work through **every** question — do not sample. Write findings to the output file as you go, then:

```
python3 /home/claude/work/notes/review_check.py <explanations file> <your output file>
```

It must print `OK`. Do not edit the explanation files. Do not spawn other agents.
Final reply: the number of problems per file, plus one line on any pattern you saw repeatedly.
