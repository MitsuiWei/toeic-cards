# Task: TOEIC Part 5 style questions (incomplete sentences), one per word

Read `/home/claude/work/quiz/BRIEF_COMMON.md` first.

Your input file has 125 words: `{wid, w, pos, zh, seen_example}`.
Write **exactly one question per word**, in the same order, where **the correct answer is that word**.

## Output format

A JSON array, one object per input word:

```json
{
  "wid": 12,
  "type": "vocab",
  "q": "Customers who are not satisfied with the product can ask for a full ------- within 30 days.",
  "answer": "refund",
  "distractors": ["budget", "survey", "region"],
  "zh": "對產品不滿意的顧客可以在 30 天內要求全額退款。",
  "ex": "ask for a full refund 是「要求全額退款」。budget 是預算、survey 是調查、region 是地區，放進去意思都不通。"
}
```

- `q`: one sentence with exactly one blank written as `-------` (seven hyphens).
- `answer`: the target word. `distractors`: exactly three wrong options. All four are single words
  (unless the target itself is a phrase or hyphenated word).
- `zh`: natural Traditional Chinese translation of the completed sentence.
- `ex`: 1–3 sentences of explanation in Traditional Chinese (see below).

## Two question types

**`vocab`** (about 65% of your items) — tests meaning / collocation.
- The answer is the target word, inflected if the sentence needs it (plural, -s, -ed, -ing).
- The three distractors have the **same part of speech and the same inflection** as the answer, and each
  is clearly wrong here because of meaning or collocation.
- Take distractors from this level's pool first, then lower-level pools, so the options are words he is
  studying. Do **not** use a synonym or near-synonym of the answer, and do not use words from the
  answer's own word family.
- The sentence must contain enough context that only the answer works. "The manager gave a -------" is
  too open; "The manager gave a ------- to thank the team for finishing the project early" is still too
  open; pin it down with a collocation or a concrete situation.

**`form`** (about 35%) — tests word form (part of speech).
- Use only when the word has at least three other real, reasonably common family forms
  (e.g. suit / suitable / suitably / suitability).
- `answer` must be the target word exactly as listed. The distractors are other forms of the same root.
  All four must be real English words.
- The grammar around the blank must admit only one form (article + ___ + of → noun; be + ___ + for →
  adjective; ___ + verb → adverb; to + ___ → verb, and so on).

The word must be used in one of the senses given in its `zh` field. Do not reuse or lightly edit
`seen_example`; he has already memorized that sentence.

## Difficulty by level (important — he gets discouraged by sentences full of unknown words)

| level | words in `q` | everything except the options | distractors |
|---|---|---|---|
| 400 | 8–16 | very common everyday words only (CEFR A2), simple tenses | clearly different meanings |
| 600 | 10–20 | B1 | different meanings, same topic area allowed |
| 800 | 12–24 | B2, normal business English | plausible topic, wrong meaning or collocation |
| 990 | 14–28 | C1, realistic hard TOEIC items | close in topic; eliminated by precise meaning or collocation |

Vary the sentences: different subjects, tenses, settings (office, travel, store, restaurant, shipping,
HR, IT, bank, event). Do not start many sentences the same way.

## Explanation (`ex`) style

- vocab: say why the answer fits (the collocation or the situation), then gloss each distractor as
  `word 是中文`. Example above.
- form: name the grammar clue and the needed part of speech, then label the other forms. Example:
  `be 動詞後面接形容詞，be suitable for 是「適合…」。suitability 是名詞、suitably 是副詞、suit 是動詞或名詞。`
- Never mention option letters or positions.

## More examples

```json
{"wid": 0, "type": "form", "q": "This meeting room is ------- for groups of up to twenty people.",
 "answer": "suitable", "distractors": ["suitability", "suitably", "suit"],
 "zh": "這間會議室適合二十人以內的團體使用。",
 "ex": "be 動詞後面接形容詞，be suitable for 是「適合…」。suitability 是名詞、suitably 是副詞、suit 是動詞或名詞。"}
{"wid": 0, "type": "vocab", "q": "Please ------- your reservation at least two days before your arrival.",
 "answer": "confirm", "distractors": ["contain", "prevent", "retire"],
 "zh": "請在抵達前至少兩天確認您的訂位。",
 "ex": "confirm a reservation 是「確認訂位」，多益常見搭配。contain 是包含、prevent 是預防、retire 是退休。"}
{"wid": 0, "type": "vocab", "q": "Due to the heavy rain, the flight's ------- was delayed by two hours.",
 "answer": "departure", "distractors": ["description", "occupation", "permission"],
 "zh": "由於大雨，班機的起飛時間延後了兩個小時。",
 "ex": "departure 是「出發、起飛」，班機出發被延後。description 是描述、occupation 是職業、permission 是許可。"}
```

## Validate

```
python3 /home/claude/scripts/quiz_validate.py p5 <your output file> <your input file>
```

It must print `OK`. It checks structure only — whether the answer is truly the only correct one is your job.
