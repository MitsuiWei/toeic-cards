# Brief: original TOEIC Part 5 grammar questions with per-option explanations

## Context

A Taiwanese adult (TOEIC about 300–400, aiming higher; his score decides whether he can work for a
foreign company) practises on his own study site. The site's sentence-completion bank has vocabulary
questions and word-form questions, but none of the **grammar** questions that make up roughly a third
of real Part 5. You are writing those for one level. He will trust every answer key and every
explanation, so correctness matters more than anything else.

- Questions must be **original**. Do not copy or adapt items from real TOEIC tests or any published
  book or site.
- English: natural, standard **American** business English, as an American-born English teacher
  would write it. Chinese: Traditional Chinese with Taiwan usage (never Simplified, no mainland-only
  wording).
- Read `/home/claude/work/notes/BRIEF_COMMON.md` and `/home/claude/work/notes/BRIEF_P5.md` first:
  they define the style of the explanation fields (`key`, `pos`, `zh`, `use`, `why`). This brief
  only says what is different for grammar questions.

## What to write: 50 questions

| `cat` | count | tests |
|---|---|---|
| `verb` | 15 | tense, active/passive, subject–verb agreement, modal + base form, to V / V-ing / p.p. (verbals, participles) |
| `prep` | 10 | choosing the preposition (time, place, fixed patterns) |
| `conj` | 10 | conjunction vs. preposition vs. adverb (because / because of / therefore; although / despite / however), and choosing the right conjunction |
| `pron` | 7 | case (he / him / his / himself), possessives, reflexives, one / ones / those, each other |
| `other` | 8 | relative words (who / which / whose / that / what / where), comparatives and superlatives, quantifiers and determiners (each / every / all / most / few / much) |

Order the output by `cat` in the order above.

### Level guide (you are told your level)

- **400**: simple present / past / future, be + V-ing, basic passive, agreement, modal + base verb,
  want to V / enjoy V-ing; in / on / at / by / for / during / until / before / after;
  because / so / but / if / when / although; I / me / my / mine / myself; who / which / that;
  -er than / the most; many / much / a few / every. Short sentences (10–16 words), easy vocabulary.
- **600**: present perfect vs. simple past, passive with modals, -ed / -ing adjectives, V-ing after
  prepositions, first conditional; within / throughout / among / despite / due to / according to;
  although vs. despite, because vs. because of, while / unless / once / as soon as; each other,
  one / ones, those who, on one's own; whose / where / what, as … as, either / neither / both, each.
- **800**: past perfect, future perfect, to be p.p. / being p.p., reduced relative clauses, subjunctive
  after recommend / request / suggest, second and third conditionals, have something done;
  regarding / prior to / upon V-ing / on behalf of / in accordance with; provided that / in case /
  so that / whereas / whether / now that, and adverb-vs-conjunction traps (however / therefore /
  moreover); whoever / whichever, that / those of; preposition + which, the more … the more,
  most of which.
- **990**: inversion (Should you … / Had we … / Not only … / Rarely …), mixed conditionals, perfect
  participles, "it is imperative that S V", were to; notwithstanding / pending / barring / in lieu
  of / with regard to; given that / in the event that / as long as / assuming (that) / otherwise;
  whomever, one another, none / neither of whom; all of which, whereby, whichever, no sooner … than,
  so … that / such … that. Longer sentences (16–26 words), harder vocabulary.

A level may also reuse points from lower levels in harder sentences. Vary the points — do not test
the same point more than twice in your 50.

### Quality rules for every question

1. One sentence with exactly one blank written as `-------` (seven hyphens). Business / workplace /
   daily-commerce setting, varied (office, sales, travel, HR, finance, manufacturing, customer service).
2. **Exactly one option is correct.** Before you keep a question, try each wrong option in the
   sentence with a native ear: it must be clearly wrong (ungrammatical, or grammatical but with a
   meaning the sentence rules out). No "also possible but less common" distractors.
   - Tense questions need an unambiguous time signal (since 2019, last week, by the time …, next month).
   - Preposition questions must have one idiomatic answer; avoid cases where two prepositions work
     (e.g. on / over the weekend, in / during the meeting, at / in the office).
   - conj-vs-prep questions must be decided by the structure after the blank (clause vs. noun phrase).
   - Pronoun and relative questions must have a clear antecedent.
3. The four options are the same kind of thing (four verb forms of the same verb, four
   prepositions, four connectors, four pronouns …), as on the real test.
4. Do not start the sentence with the blank unless the point requires it (inversion, connectors).
5. No two questions in your file should share the same sentence frame or the same four options.

## Output

A JSON array of 50 objects:

```json
{"cat": "verb",
 "q": "The new safety guidelines ------- to all factory employees last Monday.",
 "answer": "were distributed",
 "distractors": ["distributed", "have distributed", "are distributing"],
 "zh": "新的安全準則已於上週一發給所有工廠員工。",
 "key": "主詞是「準則」（被發放）＋ last Monday → 過去式被動 were + p.p.",
 "notes": [
  {"o": "were distributed", "pos": "過去式被動", "zh": "被發放了", "use": "was／were + p.p.：主詞是「被…」的對象", "why": "guidelines 不會自己發放；last Monday 用過去式"},
  {"o": "distributed", "pos": "過去式主動", "zh": "發放了", "use": "主詞 + V-ed + 受詞", "why": "主動的話後面要有受詞，這裡沒有"},
  {"o": "have distributed", "pos": "現在完成式主動", "zh": "已經發放", "use": "have／has + p.p.；不和明確的過去時間連用", "why": "last Monday 不能配完成式，而且是主動"},
  {"o": "are distributing", "pos": "現在進行式主動", "zh": "正在發放", "use": "am／is／are + V-ing", "why": "時間是上週一，而且是主動"}
 ]}
```

- `answer` first in your head, then three `distractors`; the site shuffles the options.
- `zh`: natural Traditional Chinese translation of the completed sentence.
- `key` (≤ 60 characters): the fastest route to the answer — which words in the sentence are the
  clue and what they demand. Make it a reusable test technique.
- `notes`: exactly four, the answer's note **first**, then the distractors in the same order as
  `distractors`; `o` copied exactly.
  - `pos` (≤ 14 characters): the grammatical label of this option in Traditional Chinese
    (現在完成式, 過去分詞, 介系詞, 連接詞, 副詞, 受格代名詞, 反身代名詞, 關係代名詞, 比較級 …).
  - `zh` (≤ 16): what it means.
  - `use` (≤ 50): the pattern — what comes before / after it, written with Chinese roles.
  - `why` (≤ 48): for the answer, the point most worth memorising (the site prefixes「常考：」);
    for a wrong option, exactly why it fails **in this sentence** (the site prefixes「這題：」).
    Say honestly whether it fails on grammar or on meaning — never call a grammatical option
    ungrammatical, and never state a rule that is not generally true ("X 後面一定接 Y").

## Process

1. Work in batches by `cat`. After each batch, write the whole array so far to your output file
   (valid JSON), so the work survives an interruption.
2. When all 50 are written, re-read every question once more as a test-taker: solve it without
   looking at your answer, and try each distractor. Replace any item where a second option could
   be defended.
3. Run the validator and fix everything it reports:
   `python3 /home/claude/work/gram/validate.py <output file>` — it must print `OK`.
4. Do not spawn other agents. Scratch files only under the folder named in your task.

Final reply: the count per `cat`, and any question you are still not fully sure has a single answer.
