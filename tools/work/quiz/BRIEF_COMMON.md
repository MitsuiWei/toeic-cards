# Context (read first)

You are writing practice questions for a self-study TOEIC website used by one Taiwanese learner.
He is around TOEIC 300–400 now, is memorizing a 1000-word list split into four levels
(400 / 600 / 800 / 990, 250 words each), and asked for **a lot of practice to build confidence**.
The questions are shown in the site with a Chinese translation and a Chinese explanation after he answers.

Hard requirements for everything you write:

- **Original.** Write every sentence, passage and question yourself, in the style of the TOEIC
  Listening & Reading test. Never copy or adapt items from real TOEIC tests or commercial prep books.
- **Exactly one defensible answer.** A wrong answer key destroys the learner's confidence. If a careful
  native speaker could accept a distractor, rewrite the item. When in doubt, make the context more specific.
- **Chinese = Traditional Chinese as used in Taiwan** (繁體中文、台灣用語). Never Simplified characters,
  never mainland-only wording (use 資訊 not 信息, 軟體 not 軟件, 網路 not 網絡, 品質 not 質量 for quality, 印表機 not 打印機).
- **Never refer to options by letter or position** ("(A)", "選項 B", "第一個") in explanations — the site
  shuffles the options. Name the word or quote the response instead.
- American English spelling. No real company, brand or celebrity names; invent neutral ones
  (e.g. "Ms. Chen", "Mr. Lopez", "Harbor Hotel", "the marketing team").
- Workplace-neutral topics only: office, meetings, travel, shopping, restaurants, shipping, HR, IT,
  facilities, events, banking, customer service. Nothing political, medical-diagnostic, or sensitive.

Files:

- Word pools (the learner's word list, per level): `/home/claude/work/quiz/in/pool_400.json`,
  `pool_600.json`, `pool_800.json`, `pool_990.json` — each entry `{wid, w, pos, zh}`.
- Write your output only where your task says, under `/home/claude/work/quiz/out/`. You may create a
  scratch folder `/home/claude/work/quiz/out/tmp_<your output name>/` for batches. Do not touch any other file.
- You do not need the web. Do not delegate to other agents.

Process that works:

1. Read your input and the relevant pool file(s).
2. Write in batches (about 25 items per file for single questions, 5–6 passages per file for reading)
   into your scratch folder, then merge them into the single output JSON array with a short Python snippet.
   Do not try to emit everything in one giant write.
3. Run the validator command given in your task. Fix every reported problem and re-run until it prints `OK`.
4. Do one more full read-through of your merged output with this single question in mind for each item:
   "Is there any other option that could also be right?" Fix those, re-validate.
5. Reply with a short report: how many items, the breakdown by type, and the ids (wid / index) of any
   items you are still not fully sure about, with one line on why. Do not paste the items back.
