# Task: per-option explanations for sentence-completion questions (TOEIC Part 5 style)

Read `/home/claude/work/notes/BRIEF_COMMON.md` first.

## Input

A JSON array: `{"id", "kind": "單字題" | "詞性題", "q", "options": [4], "answer", "zh", "old_explanation"}`.
`q` has one blank `-------`; `answer` is the correct option; `zh` is the Chinese translation of the
completed sentence.

## Output

A JSON array, one object per question, same order:

```json
{"id": "p608",
 "key": "「動詞 + A + to + B」，B 是原因（車站關閉）→ attribute A to B「把 A 歸因於 B」",
 "notes": [
  {"o": "dispatch",   "pos": "v.", "zh": "派遣；發送",   "use": "dispatch + 人／貨物 + to + 地點", "why": "drop（下滑）不能被「派遣」"},
  {"o": "reallocate", "pos": "v.", "zh": "重新分配",     "use": "reallocate + 預算／資源 + to + 部門", "why": "drop 不是可以分配的資源"},
  {"o": "attribute",  "pos": "v.", "zh": "歸因於",       "use": "attribute A to B；被動 be attributed to", "why": "attribute the drop / increase to + 原因"},
  {"o": "entitle",    "pos": "v.", "zh": "給予權利",     "use": "entitle 人 to + 權利；常用 be entitled to", "why": "受詞必須是人，不能是 drop"}
 ]}
```

- `notes`: exactly four, **in the same order as `options`**, with `o` copied exactly.
- `key` (解題關鍵, at most 60 characters): the fastest route to the answer — the clue in the sentence
  and what it demands. One line. This is the single most valuable line: make it a reusable test
  technique, not a paraphrase of the sentence.
- `pos`: `n.` `v.` `adj.` `adv.` `prep.` `conj.` etc. For inflected forms say which:
  `v.（過去式／過去分詞）`, `v.（-ing）`, `v.（第三人稱單數）`, `n.（複數）`, `n.（人）`.
- `zh` (at most 16 characters): the meaning, the sense relevant to business English.
- `use` (at most 50 characters): how the word is used — the pattern or collocation TOEIC tests.
  Write it as a pattern with Chinese roles: `dispatch + 人／貨物 + to + 地點`,
  `be eligible for + N／to V`, `comply with + 規定`, or two or three typical collocations:
  `conduct a survey／an inspection`.
- `why` (at most 45 characters):
  - for a **wrong** option: why it cannot be chosen in this sentence (the site prefixes「這題：」).
  - for the **correct** option: the collocation or pattern most worth memorising for the test, or the
    exact reason it fits when that is more useful (the site prefixes「常考：」). Do not repeat `use`.

## 詞性題 (word-form questions)

The options are forms of one word family. Here the test point is the slot, so:

- `key`: analyse the slot — what comes before and after the blank and which part of speech that
  requires. Example: 「a strong ------- to：冠詞 + 形容詞後面要名詞 → commitment」.
- `use`: where this part of speech goes, concretely for this word:
  `名詞：a／the／形容詞後；commitment to + N／V-ing`, `副詞：修飾動詞或形容詞`,
  `形容詞：名詞前，或 be 動詞後`.
- `why` for wrong options: the precise slot mismatch (「形容詞後面不能再接形容詞」「介系詞後不能接原形動詞」).
  If two forms are the same part of speech (e.g. two nouns, one a person), explain the difference
  that decides it (可數／不可數、人／事物、單複數、主動／被動).

## 單字題 (vocabulary questions)

All options are usually the same part of speech, so the test point is meaning plus collocation.

- `key`: name the collocation or the word in the sentence that selects the answer
  (the object, the preposition after the blank, the subject type).
- `why` for wrong options: what kind of object, subject or preposition that word actually takes and
  why this sentence does not supply it — or, when grammar fits, the plain meaning mismatch.

## Validate

```
python3 /home/claude/work/notes/validate.py p5 <input file> <output file>
```
