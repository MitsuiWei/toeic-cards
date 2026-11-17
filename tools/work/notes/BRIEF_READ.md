# Task: per-option explanations for reading questions (TOEIC Part 6 and Part 7 style)

Read `/home/claude/work/notes/BRIEF_COMMON.md` first.

## Input

A JSON array of passages: `{"id", "part": 6 | 7, "title", "text", "questions": [{"n", "q", "options": [4], "answer", "old_explanation"}]}`.
Part 6 passages contain blanks written `[1] -------`; question `q` is then `"[1]"`.
Part 7 questions are ordinary comprehension questions about the passage.

## Output

A JSON array, one object per passage, same order:

```json
{"id": "r600-07", "qs": [
  {"n": 1,
   "key": "細節題：用 Friday 回文章找 → 第二段 will be closed on Friday",
   "notes": [
    {"o": "It will be closed for one day",  "zh": "將關閉一天",       "use": "", "why": "文中 will be closed on Friday，只有週五一天"},
    {"o": "It will move to a new building", "zh": "將搬到新大樓",     "use": "", "why": "文中沒提到搬遷"},
    {"o": "It will open earlier",           "zh": "將提早開門",       "use": "", "why": "文中說的是關閉，不是提早營業"},
    {"o": "It will hire more staff",        "zh": "將增聘員工",       "use": "", "why": "文中沒提到徵人"}
   ]}
]}
```

- `qs`: one object per question, `n` matching the input; `notes`: exactly four, **in the same order
  as `options`**, with `o` copied exactly.
- `key` (解題關鍵, at most 60 characters): start with the question type, then where the answer is.
  - Part 7 types: `主旨題` `細節題` `推論題` `NOT 題` `字義題`. Say what to scan for and where it is
    (which line or which words), e.g. 「推論題：找能支持的那一句 → 'please bring your receipt'」.
  - Part 6 types: `單字` `詞性` `時態／語態` `連接詞` `句子插入`. Say the clue, as in Part 5:
    「連接詞：前句說延誤、後句說免運費補償 → 因果，用 Therefore」.
- `zh` (at most 30 characters):
  - Part 7 options and Part 6 sentence options: the Chinese translation of the option.
  - Part 6 word options: part of speech and meaning, e.g. `(v.) 租用`, `(adv.) 然而`.
- `use` (at most 50 characters): only for Part 6 word options where a pattern is worth learning
  (`be responsible for + N`, `However, + 句子`); otherwise an empty string.
- `why` (at most 50 characters):
  - correct option: the evidence. For Part 7 quote the few English words from the passage that
    prove it (in single quotes or after「文中」), then the link if needed. For NOT questions say
    that the other three appear and this one does not. For Part 6 give the reason it fits.
  - wrong option: be specific — 「文中沒提到」only when it truly is absent; otherwise say what the
    passage actually says (「文中是 Monday，不是 Friday」), or for Part 6 the grammar or meaning clash.

Read each passage carefully before writing: every claim about what the passage says must be
checkable against the text.

## Validate

```
python3 /home/claude/work/notes/validate.py read <input file> <output file>
```
