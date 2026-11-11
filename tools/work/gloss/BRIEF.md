# Task: build a small English → Traditional Chinese glossary

A Taiwanese learner (TOEIC about 300–400) uses a practice website. When he taps an English word in a
question, the site shows its dictionary form and Chinese meaning and saves it as a flashcard.
You are writing the glossary entries for one chunk of the words that appear in the question bank.

## Input

A JSON array, one object per word form (lowercased, alphabetical):

```json
{"f": "shipped", "ctx": "…the order was shipped on Monday…"}
{"f": "ito", "ctx": "Mr. Ito and his team develop…", "cap": 1}
```

- `f`: the form as it appears in a question (lowercased; a trailing 's has been removed).
- `ctx`: one place it appears, only to help you tell which word it is.
- `cap`: present when the form only ever appears capitalized — it *may* be a proper noun.

`/home/claude/work/gloss/in/list_words.txt` lists 1000 words that already have flashcards.

## Output

A JSON array with **exactly one object per input form, in the same order**:

```json
{"f": "shipped", "l": "ship", "d": [["v.", "運送；寄送"], ["n.", "船"]]}
{"f": "shipping", "l": "ship"}
{"f": "delivered", "l": "deliver"}
{"f": "ito", "name": 1}
```

- `l` — the lemma (dictionary headword), lowercase: plural → singular, verb forms → base form
  (went → go, shipped → ship), comparatives → base adjective (larger → large).
  Keep a form as its own lemma when it is a word in its own right: lexicalized adjectives
  (interested, experienced, following, limited, exciting, tired), plural-only nouns (goods, customs,
  headquarters, savings, clothes), irregular words better treated separately (better, best, worse,
  people), and anything where reducing it would change the meaning.
- `d` — the meanings of the **lemma**: 1 to 3 senses, the ones most useful in everyday and business
  English (what a TOEIC learner needs), most common first. Each sense is `[pos, zh]`.
  - `pos` is one of: `n.` `v.` `adj.` `adv.` `prep.` `conj.` `pron.` `det.` `aux.` `num.` `int.` `abbr.` `phr.`
  - `zh` is short Traditional Chinese as used in Taiwan (at most about 12 characters; separate near
    synonyms with `；`). No pinyin, no English, no example sentences.
  - Give `d` **once per lemma**: on the first entry in your file that uses that lemma. Later forms of
    the same lemma just give `l`.
  - If the lemma is one of the 1000 words in `list_words.txt`, do **not** give `d` (the site already
    has it) — just map the form to it with `l`.
- `name` — use `{"f": …, "name": 1}` (no `l`, no `d`) only for people's names (Ito, Karen, Morgan),
  invented company or brand names, and place names (Tokyo, Oakdale). If the form is also an ordinary
  English word — even when it is only capitalized in the questions because it starts a sentence or
  is part of a company name (Harbor, Green, Summit, Monday, June, English) — gloss it as a word.
- Abbreviations and titles (mr, ms, dr, tv, id, ceo, atm, hr) get pos `abbr.` and a normal gloss.
- Function words (the, of, would, which) also get a short gloss.
- Hyphenated or apostrophe forms (check-in, o'clock, don't, part-time) are glossed as they are.

## Chinese: Traditional, Taiwan usage

Traditional characters only — the learner cannot read Simplified. Use Taiwan wording:
軟體 (not 軟件), 網路, 資訊, 印表機, 列印, 影片, 簡訊, 品質, 計程車, 捷運／地鐵, 資料, 程式, 行動電話／手機,
伺服器, 螢幕, 硬碟, 滑鼠, 預設, 登入, 帳戶, 公車, 馬鈴薯, 優格, 腳踏車, 冷氣.

## How to work

Write the output in batches (for example 250 forms per batch) to the tmp folder you are given, so
nothing is lost if you are interrupted, then merge the batches into the final output file and run:

```
python3 /home/claude/work/gloss/validate.py <input file> <output file>
```

until it prints `OK`. Do not spawn other agents. Final reply: two or three lines (count, validator
result, anything you were unsure about).
