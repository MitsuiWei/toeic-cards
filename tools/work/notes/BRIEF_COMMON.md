# Per-option explanations for TOEIC-style practice questions — common rules

A Taiwanese learner preparing for TOEIC uses a practice website. After he answers a question, the
site shows, under **each option**, a short explanation. His words: "詳細一點，但不要太多廢話，要直接擊中
多益重點". He is studying to raise his score, so every line must teach something he can reuse on the
real test. You are writing these explanations for existing questions (the answer key is given).

## Non-negotiable quality rules

1. **Accuracy first.** Every collocation, pattern and grammar rule you state must be real, standard
   English that a careful teacher would sign off on. Do not invent rules. If you are not sure a
   pattern is standard, describe the meaning mismatch instead of a made-up grammar reason.
2. **Be honest about why an option is wrong.** If a distractor fits the grammar and fails only on
   meaning, say exactly that (「文法可以，但語意不通：…」). Do not claim a grammar error that does
   not exist. If an option fails on grammar, name the precise reason.
3. **No filler.** No「這個字的意思是」「我們可以看到」「因此答案是」. No restating the question. Write
   phrases, not essays. Each field has a length limit — treat it as a hard ceiling, not a target.
4. **Hit the test point.** Say what a test-taker should look at: the word before or after the blank,
   a preposition, countable vs uncountable, active vs passive, a fixed collocation, the question word.
5. **Traditional Chinese, Taiwan usage.** The learner cannot read Simplified characters. Use Taiwan
   wording (資訊, 軟體, 網路, 列印, 品質, 影片, 簡訊, 計程車, 資料, 程式).
6. English words, patterns and quotes stay in English. Use full-width Chinese punctuation in Chinese
   text. Use 「」 for Chinese quotes. Never refer to options by letter or position (the site
   shuffles and labels them itself) — always by the word or phrase itself.
7. The `old_explanation` field is the explanation the site shows today. Use it as a reference for
   the intended reasoning, but check it yourself — if you think it is wrong, follow the truth and
   mention the id in your final report.

## How to work

Write the output in batches (25 questions, or 5 passages, per batch) to the tmp folder you are
given, as each batch is finished, so nothing is lost if you are interrupted. Then merge the batches
into the final output file and run the validator until it prints `OK`. Do not spawn other agents.
Final reply: three or four lines — count, validator result, and the ids of anything you were unsure
about or where you think the answer key or old explanation is wrong.
