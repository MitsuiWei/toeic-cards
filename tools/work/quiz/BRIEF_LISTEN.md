# Task: listening question–response items, TOEIC Part 2 style

Read `/home/claude/work/quiz/BRIEF_COMMON.md` first.

Write **100 items** for one level. Each item is one spoken question or statement and three spoken
responses, exactly one of which is an appropriate reply. The site reads them aloud with the browser's
text-to-speech voice; the learner hears them without seeing the text, picks a response, and then sees
the transcript, Chinese translation and explanation.

## Output format

A JSON array of 100 objects:

```json
{
  "type": "wh",
  "q": "Where should I put these boxes?",
  "answer": "In the storage room, please.",
  "distractors": ["Yes, they are heavy.", "At ten o'clock."],
  "zh_q": "這些箱子我該放哪裡？",
  "zh_answer": "請放在儲藏室。",
  "zh_distractors": ["對，它們很重。", "十點。"],
  "ex": "Where 問地點，In the storage room 回答地點。Yes, they are heavy 用 Yes 回答 Where 問句不合；At ten o'clock 回答的是時間。"
}
```

- `type`: `wh`, `yesno`, `choice` (A or B?), `statement`, `tag` (…, isn't it?), `request`
  (Could you…? / Would you mind…? / Why don't we…?), `negative` (Didn't you…? / Isn't there…?).
- Exactly two distractors. `zh_distractors` in the same order as `distractors`.
- `ex`: Traditional Chinese; say what the question asks for and why the answer fits, then why each
  other response fails. Quote the English responses; never refer to letters or positions.

## Because it is read by text-to-speech

- Plain spoken English. No abbreviations except Mr., Mrs., Ms. (write "Doctor", "Street", "Avenue").
  No symbols (%, $, &, /). Write short numbers and times as words: "three o'clock", "ten thirty",
  "twenty dollars", "room two oh five".
- Simple, common names. No quotation marks or parentheses.
- Question: at most 9 / 12 / 14 / 16 words for levels 400 / 600 / 800 / 990. Responses: 12 words or fewer.

## Distractors — use real Part 2 traps

- answers a different question word (a time for *Where*, a person for *When*);
- Yes/No reply to a WH question;
- repeats a word from the question, or uses a related word, but does not answer it;
- (levels 800 and 990) a similar-sounding word (copy / coffee, lunch / launch), or a reply that fits a
  different sense of a word in the question.

Each distractor must be clearly inappropriate as a reply. Be careful with indirect answers: if the
answer is indirect ("I'll ask the manager."), no distractor may also work as an indirect reply.

## Difficulty by level

| level | mix | style |
|---|---|---|
| 400 | about 60 wh, 20 yesno, 10 request, 10 others | short, slow-speech-friendly, direct answers, very common words |
| 600 | about 40 wh, 20 yesno, 15 request, 10 choice, 15 others | mostly direct, about a quarter indirect answers |
| 800 | about 25 wh, 15 yesno, 15 request, 10 choice, 15 statement, 10 tag, 10 negative | about half indirect answers |
| 990 | even spread, statements and negatives well represented | mostly indirect or implied answers, subtle traps, idiomatic office talk |

Use words from this level's pool (`/home/claude/work/quiz/in/pool_<level>.json`) wherever natural — aim
for well over half the items containing a pool word in the question or the answer — and keep the other
vocabulary at or below the level. Vary situations: office, meetings, travel, shopping, restaurants,
shipping, HR, IT, facilities, events. No two items with the same question.

## Validate

```
python3 /home/claude/scripts/quiz_validate.py listen <your output file> <level>
```

It must print `OK`. It checks structure only — whether exactly one response is appropriate is your job.
