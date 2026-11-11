# Task: short reading passages, TOEIC Part 6 and Part 7 style

Read `/home/claude/work/quiz/BRIEF_COMMON.md` first.

Write **30 passages** for one level: **20 of Part 7 style** (reading comprehension) and
**10 of Part 6 style** (text completion). Each passage has exactly **3 questions**.

## Output format

A JSON array of 30 objects:

```json
{
  "part": 7,
  "kind": "email",
  "title": "Your order has shipped",
  "text": "To: Amy Lin\nFrom: Green Leaf Store\nSubject: Your order has shipped\n\nDear Ms. Lin,\n\nThank you for your order. ...",
  "zh": "收件人：Amy Lin\n寄件人：Green Leaf Store\n主旨：您的訂單已出貨\n\n林小姐您好：\n\n感謝您的訂購。……",
  "words": ["order", "refund", "confirm", "item", "customer"],
  "qs": [
    {"q": "What is the purpose of the e-mail?",
     "answer": "To tell a customer that an order was sent",
     "distractors": ["To ask for a payment", "To cancel an order", "To offer a new job"],
     "ex": "信的開頭說 Your order has shipped，目的是通知訂單已寄出。文中沒有提到要求付款、取消訂單或工作機會。"}
  ]
}
```

- `kind`: one of `email`, `notice`, `memo`, `advertisement`, `message` (text/chat message), `article`,
  `letter`, `announcement`, `review`, `form` (e.g. an order confirmation or schedule written as plain lines).
  Use a good variety across the 30.
- `title`: a short unique label (subject line or headline).
- `text`: plain text, `\n` for line breaks. No tables, no markdown.
- `zh`: full Traditional Chinese translation of the passage (for Part 6, of the completed passage).
- `words`: words **from this level's pool, in their list form**, that actually appear in the passage
  (inflected forms count). At least 3; aim for 5–8. He will see these as a mini word list after answering.
- `qs`: exactly 3 questions, each with `q`, `answer`, three `distractors`, and `ex`.

## Part 7 (20 passages)

- Three questions per passage, a mix of: main purpose / topic; a specific detail (who, when, where,
  how much, what must someone do); and one of inference, "What is NOT mentioned…", or vocabulary in
  context (`The word "X" in the passage is closest in meaning to`).
- The answer must be clearly supported by the text. Distractors: plausible, but contradicted by or
  absent from the text. Options are short (12 words or fewer).
- `ex`: quote the few English words in the passage that prove the answer, then say briefly why.

## Part 6 (10 passages)

- The text contains exactly three blanks written `[1] -------`, `[2] -------`, `[3] -------`.
- `qs[0].q` is `"[1]"`, `qs[1].q` is `"[2]"`, `qs[2].q` is `"[3]"`.
- Each blank tests one of: vocabulary (prefer a pool word as the answer), word form, verb tense/voice,
  or a connecting word. At most one blank per passage may be a whole-sentence insertion (then all four
  options are full sentences).
- Only one option may fit each blank, judged with the surrounding sentences.
- `ex`: same style as Part 5 (collocation / grammar clue, gloss the others).

## Length and difficulty by level

| level | passage length (words) | language |
|---|---|---|
| 400 | 50–85 | short simple sentences, very common words (A2); the pool words are the hardest words in it |
| 600 | 80–125 | B1 |
| 800 | 110–165 | B2, normal business English |
| 990 | 145–215 | C1, dense realistic business prose |

Use many words from this level's pool (and lower-level pools) naturally — the point is for him to meet
the words he is memorizing in real context. Keep everything else at or below the level.
Vary topics: orders and shipping, hotel and travel, meetings and schedules, job postings, office notices,
product ads, customer reviews, IT maintenance, events, banking, building facilities.

## Validate

```
python3 /home/claude/scripts/quiz_validate.py read <your output file> <level>
```

It must print `OK`. It checks structure only — answer correctness is your job.
