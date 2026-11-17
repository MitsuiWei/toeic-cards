# Task: per-option explanations for listening question–response items (TOEIC Part 2 style)

Read `/home/claude/work/notes/BRIEF_COMMON.md` first.

## Input

A JSON array: `{"id", "type", "q", "options": [3], "answer", "zh_q", "zh_options": [3], "old_explanation"}`.
`q` is a spoken question or statement; `options` are three spoken responses; `answer` is the one
appropriate response. The learner hears them without seeing the text, answers, then sees the
transcript with Chinese translations (already on the site — do not translate again).

## Output

A JSON array, one object per item, same order:

```json
{"id": "l400-001",
 "key": "Where 問地點 → 只聽「地點」；聽到 Yes／No 或時間就刪掉",
 "notes": [
  {"o": "Yes, they are heavy.",          "trap": "Yes／No 陷阱", "why": "WH 問句不能用 Yes／No 回答"},
  {"o": "In the storage room, please.",  "trap": "",             "why": "In the storage room 是地點，直接回答 Where"},
  {"o": "At ten o'clock.",               "trap": "答非所問",     "why": "回答的是時間，那是 When 的答案"}
 ]}
```

- `notes`: exactly three, **in the same order as `options`**, with `o` copied exactly.
- `key` (解題關鍵, at most 50 characters): what to catch when listening — the question word or
  sentence type and what kind of reply it calls for. For indirect answers, say what the reply
  implies. Make it a listening technique he can reuse.
- `trap`: empty string for the correct response. For each wrong response, one label from this list:
  - `Yes／No 陷阱` — Yes/No reply to a WH question, or to an A-or-B question
  - `答非所問` — answers a different question word (a time for Where, a person for When…)
  - `重複字陷阱` — repeats a word from the question but does not answer it
  - `相關字陷阱` — uses a word associated with the topic but does not answer it
  - `相似音陷阱` — uses a word that sounds like one in the question (copy／coffee)
  - `一字多義陷阱` — answers a different sense of a word in the question
  - `時態或主詞不合` — wrong tense or wrong person for the question
  - `語意不連貫` — simply does not follow as a reply
- `why` (at most 45 characters):
  - correct response: why it works as a reply. If it is an indirect reply, spell out the implied
    answer (「沒直接說地點，但『我去問經理』表示自己不知道 → 合理回應」).
  - wrong response: the concrete reason, naming the word involved
    (「重複了 meeting，但沒回答『幾點』」).

## Validate

```
python3 /home/claude/work/notes/validate.py listen <input file> <output file>
```
