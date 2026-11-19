# Brief: phonics hints and word-part breakdowns for a TOEIC vocabulary card site

## Who reads this

A Taiwanese adult preparing for TOEIC (current level about 300–400) studies 1,000 words on flashcards.
Under each word the card shows ONE hint line, chosen in settings: KK phonetics, IPA, a **phonics
hint (自然發音)** or a **word-part breakdown (字根字首)**. You are writing the last two for a list of
words. He will trust them and build habits on them, so accuracy matters more than coverage: a wrong
root or a wrong sound rule does real harm. Everything Chinese must be Traditional Chinese with
Taiwan usage (never Simplified, no mainland-only terms).

## Input

A JSON array, one object per word: `id`, `w` (the word), `kk` and `ip` (American pronunciation —
a string, or `[[詞性, 音標], …]` when the pronunciation depends on part of speech), `d` (parts of
speech and Chinese meanings). Your hints must agree with `kk`/`ip`.

## Output

A JSON array in the same order, one object per input word:

```json
{"id": 123, "p": {"s": "in·spec·tion", "st": 1, "n": "-tion 唸 /ʃən/；字首 in 的 i 唸短音 /ɪ/"},
 "r": {"p": [["in-", "往內"], ["spect", "看"], ["-ion", "名詞"]], "m": "往內仔細看 → 檢查"}}
```

### `p` — phonics hint (required for every word)

- `s`: the word split into spoken syllables with `·` (U+00B7). Removing every `·` must give back the
  word exactly. Keep hyphens and put `·` only inside multi-syllable parts: `blue-col·lar`;
  `state-of-the-art` stays as it is because every part is one syllable. Split where an American dictionary
  would show the spoken syllables, consistent with `kk` — e.g. `com·pa·ny`, `pas·sen·ger`, `re·ceipt`.
- `st`: 0-based index of the syllable with primary stress (count syllables split by `·` and `-`).
  For words whose stress depends on part of speech, give the stress of the first entry in `kk` and
  mention the other in `n`.
- `n`: the one or two letter–sound rules that most help him read or spell THIS word, in Traditional
  Chinese, at most 45 characters. Write the sound in IPA between slashes. Good targets:
  - the vowel of the stressed syllable (short vowel in a closed syllable, long vowel with silent e,
    vowel teams ee/ea/ai/oa/ou/ow, r-controlled vowels ar/er/ir/or/ur)
  - consonant patterns: ch/sh/th/ph/ck/wh, soft c and g before e/i/y, -dge, -tch, qu
  - common endings: -tion /ʃən/, -sion /ʒən/ or /ʃən/, -ture /tʃɚ/, -ous /əs/, -age /ɪdʒ/, -ate
    (/eɪt/ verb vs /ət/ adjective/noun), -ed, -ly
  - unstressed vowels becoming schwa /ə/
  - silent letters and real exceptions, stated plainly: 「不照規則：p 不發音」
  - stress shift by part of speech: 「名詞重音在前，動詞在後」
  Do not restate the whole pronunciation, do not write KK, do not explain what a syllable is.
  Only state rules that are true for this word AND generally useful; never invent a rule.

### `r` — word-part breakdown, or `null`

Give a breakdown only when it is **etymologically sound and actually helps** a learner connect the
parts to the meaning. Otherwise `null`. Expect many `null`s — plain or opaque words (book, price,
colleague, discuss) and words whose historical parts no longer suggest the meaning should be `null`.

- `p`: 2–5 parts, each `[form, meaning]`, in order. Prefixes end with a hyphen (`re-`, `in-`),
  suffixes start with one (`-tion`, `-able`), roots and free words have none (`spect`, `port`,
  `dead`, `line`). Write each form as it appears in this word (assimilated forms are fine: `ac-` in
  accompany, `col-` in collaborate). Meaning: Traditional Chinese, at most 8 characters. For
  suffixes give the grammatical job the learner needs for Part 5 word-form questions:
  「名詞」「形容詞：可…的」「副詞」「動詞：使…」「人」.
- `m`: at most 30 characters linking the parts to the word's meaning, ending in the actual meaning:
  「往內仔細看 → 檢查」「再＋新 → 更新、續約」「死的＋線 → 截止期限」.
- Compounds count (`deadline`, `workload`, `headquarters`), and so do clear derivations from a common
  English word (`employ` + `-ee` → 員工), which are often the most useful breakdowns.
- Inflections alone (`minutes`, `goods`) are not breakdowns → `null`.
- Never use folk etymology, never force a split to fill the field, never make up a root meaning. If
  you are not sure of a root, use `null`.

## Process

1. Read your input file. Work in batches of about 50 words. After each batch, write the whole array so
   far to your output file (valid JSON), so the work survives an interruption.
2. When finished, run the validator and fix everything it reports:
   `python3 /home/claude/work/aids/validate.py <input file> <output file>`
   It must print `OK`.
3. Do not edit the input. Do not spawn other agents. Scratch files only under the folder named in your
   task.

Final reply: how many words got `r` (breakdown) vs `null`, and any words you were unsure about.
