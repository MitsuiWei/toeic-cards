# 多益單字卡 — 開發交接文件

給接手開發的人（或 AI）看的技術說明。`tools/` 這個資料夾不屬於網站本身，網站不會載入它。

> **這是公開 repo**：這份文件、網站和 `tools/` 任何人都看得到。密碼、Token、主機或後台帳號這類東西絕對不要寫進來（`js/firebase-config.js` 的瀏覽器端金鑰本來就是公開的，不算）。

## 0. 新對話怎麼接手

使用者開新對話時會貼這段（也可以直接請他貼）：

```
我要繼續開發多益單字卡網站（GitHub repo MitsuiWei/toeic-cards，GitHub Pages：https://mitsuiwei.github.io/toeic-cards/）。
請先把這個 repo 加進對話（要能 push），clone 下來，執行 sh tools/setup.sh 還原開發環境，
然後完整讀過 tools/HANDOFF.md（工作慣例、建置與測試、版本紀錄、還沒做的事）和 tools/SPEC.md（規格書：功能、架構、資料格式、演算法）再開始。
讀完先用三五句話告訴我目前版本和你理解的狀態，等我交代下一件事。
```

接手後第一件事：`git log --oneline -3` 和 `sw.js` 的 `VERSION` 要對得上下面「版本紀錄」的最後一筆；對不上就以 repo 為準。

## 1. 這是什麼

- 刷刷庫《多益一千單字表》的間隔複習單字卡網站，外加原創的多益題型練習。
- 純靜態（vanilla JS，沒有 build、沒有模組），直接雙擊 `index.html` 也能跑。
- 線上：<https://mitsuiwei.github.io/toeic-cards/>（GitHub Pages，`main` 分支根目錄）。
- 進度存 `localStorage`（key `toeic-cards-v1`），登入 Google 後用 Firebase Firestore 跨裝置同步。

## 2. 工作慣例

- **先給使用者看畫面，他說「上線」才 commit / push。** 使用者自己沒有本機 repo，commit 和 push 都由這邊做。
- 每次上線把 `sw.js` 的 `VERSION` 加一（目前 `toeic-cards-v21`），舊快取才會被換掉。上線後告訴使用者新的版本號和 commit。
- commit 訊息最後要加兩行署名（系統會給當次該用的內容，照抄即可）。
- 所有中文一律繁體、台灣用語；不可以出現簡體字。
- 題目必須原創，不可抄多益官方或任何出版社的試題。
- 主要使用裝置是 iPad 和手機：每次改版面都要檢查 320 / 390 / 820 / 1280 寬，不能有橫向溢出。
- 「說明」分頁依使用者要求只留三段（四個按鈕／兩個已經會了／電腦快捷鍵），不要自行加段落。

### 關於使用者

- 在台灣，多益程度大約 300–400 分，正在準備多益；分數會影響他能不能去外商工作，所以內容品質（題目、解析）很重要。
- 網站幾乎都在 iPad 和手機上用；沒有本機 repo（換過電腦），commit 和 push 都由這邊做。
- 溝通：繁體中文、精簡直接、不要廢話。新功能他習慣說「有問題問我，懂了再動工」：需求有好幾種做法時，先用選項題問清楚（附建議選項），問完就動工。
- 給 shell 指令時一行寫完，不要用 `\` 換行。
- 他會傳一段角色設定（例如「美籍英文老師」）要求用那個角度工作；不確定要做什麼時先問。

### 主機與服務（全部都在這裡，沒有其他）

- **網站主機：只有 GitHub Pages**（repo `MitsuiWei/toeic-cards`，`main` 分支根目錄，公開 repo）。沒有自訂網域、沒有用 Hostinger 或其他虛擬主機、沒有後端伺服器。
- **Firebase 專案 `project-ad1d2`**：只用 Authentication（Google 登入）和 Firestore（collection `toeicCards`、`toeicAccess`）。管理員信箱只寫在 Firebase Console 的規則裡，不要寫進 repo 的任何檔案（README 的規則用佔位字）。這個專案同時給使用者另一個旅遊行程網站用（ChatGPT 幫他做的），Firestore 規則要兩邊並存，改規則時只能加 `toeicCards` 那一段，不要動別的。使用者的 Google 帳號 Cloud 專案額度已滿，不能另開專案。
- Firebase 端已經設定好的：Google 登入已啟用、Authorized domains 有 `mitsuiwei.github.io`、Firestore 規則見 `README.md` 的「Firebase 設定」、瀏覽器端 API 金鑰限制了 HTTP referrer。這些都在使用者的 Firebase Console，這邊改不到，要改就給他步驟。
- 沙盒的限制：連不到 `mitsuiwei.github.io` 和 Firebase（所以線上版和跨裝置同步要請使用者自己驗），`gh api` 查 Pages 建置狀態會被擋；`git push` 可以。

### 版本紀錄

| 版本 | commit | 日期 | 內容 |
|---|---|---|---|
| v8 | `ea30bcf` | 11/09 | 說明分頁（repo 的歷史從這裡開始，之前的版本在使用者舊電腦上） |
| v9 | `cb7ccfc` | 11/10 | 新卡自動唸單字、KK／IPA 音標、修正手機單字庫溢出 |
| v10 | `a76adfa` | 11/10 | 休息畫面「不等了，現在複習」快捷鍵 |
| v11 | `88ec3e9` | 11/11 | 練習分頁：單字填空 1000、短文 120 篇、聽力 400 題（四個級別） |
| v12 | `f64ee69`、`4e120e6` | 11/11 | 點字存單字（自選分頁）、錯題分析、統計頁點進去看單字；加入 `tools/` |
| v13 | `5b061c9` | 11/13 | 點字改成先看意思，按「存起來」才存 |
| v14 | `68bdc9d` | 11/17 | 各選項解析（設定可收起來）；400／600 分第二輪查核、11 題原文修正 |
| v15 | `d670118` | 11/18 | 多益落點測驗（40 題適性）、統計頁依平常練習估分 |
| v16 | `f8d1523` | 11/19 | 800／990 分第二輪解析查核、16 題原文改成較道地的美式說法 |
| v17 | `7a04630` | 11/19 | 單字卡提示行：KK／IPA／自然發音／字根字首一次一種、點一下臨時切換；加入規格書 `tools/SPEC.md` |
| v18 | `09facad` | 11/19 | 單字提示拿掉 IPA，只留 KK／自然發音／字根字首（＋不顯示） |
| v19 | `be0db1b` | 11/22 | 單字填空作答後：英文句子在上、中文在下，點了唸英文並逐字標示 |
| v20 | `09f0033` | 11/23 | 單字填空加入文法題 200 題（每級 50），每回固定 2 題；錯題分析多 5 個文法分類 |
| v21 | （見 git log） | 11/24 | 登入＋管理員同意才能用、管理頁（審核、每個人的學習狀況）；自動挑較自然的語音、語速預設調慢、試聽 |

### 使用者做過的選擇（改功能前先看，不要改回去）

- 單字填空預設只出「學過的字」，不夠用沒學的補。
- 點字：點一下只顯示意思，要按「存起來」才存（v12 原本點一下就存，他要求改掉）。
- 各選項解析的深度：「意思＋常考用法＋為什麼錯」，再加一行「解題關鍵」；三種題型都要；設定可選「直接顯示／先收起來」。
- 落點測驗：測驗＋平常練習都估分；自動調難度、約 40 題；結果要有總分區間、聽力閱讀分開、各題型答對率和弱點、建議級別。
- 使用權限：只能用 Google 登入，登入後要申請、管理員（他本人）同意才能用；要有獨立的管理頁，能審核、也能看每個人的學習狀況。這一批他說「交給你，我不接手，完成跟我說」，所以沒有等「上線」就直接推了。
- 語音：他覺得唸得生硬、語速太快 → 自動挑較自然的語音、預設語速 0.7。
- 文法題：他發現題庫只有單字題和詞性題，要求補真實考試會考的文法題；選了每級 50 題共 200 題。單字填空解析要「英文在上、中文在下，點了唸英文並逐字標示」。
- 單字提示：一次只顯示一種（他覺得多了畫面會亂），在設定選；只要 KK、自然發音、字根字首（IPA 他要求拿掉；「不顯示」保留）；預設 KK；字根字首翻面後才顯示；沒有拆解的字退回 KK 加小字；點那一行可以臨時換下一種。

## 3. 開發環境還原

```
git clone https://github.com/MitsuiWei/toeic-cards.git
cd toeic-cards
sh tools/setup.sh
```

`setup.sh` 會把網站複製到 `/home/claude/work/site`、腳本到 `/home/claude/scripts`、原始資料到 `/home/claude/work/…`（腳本裡的路徑是寫死的）。

上線流程：

```
cp -r /home/claude/work/site/. <repo 根目錄>/
cd <repo 根目錄>
git add -A
git commit -m "…"
git push origin main
```

如果 `tools/` 裡的腳本或原始資料有改，記得一併複製回 `tools/scripts`、`tools/work` 再 commit。

## 4. 網站檔案與資料格式

都寫在規格書 `tools/SPEC.md`：檔案與模組關係（第 3 節）、網站資料檔格式（第 9 節）、localStorage／Firestore 狀態與同步規則（第 10 節）。改了格式要同時改規格書。

開發時最容易踩到的幾點：

- 字表的字 id 是數字（0–999），自選的是字串 `c_xxx`；從 DOM 讀 id 一律用 `idOf()`，級別用 `lvOf()`（值可能是數字、`'my'`、`'all'`）。
- 自選單字接在 `WORDS` 陣列後面（`lv:'my'`、`custom:true`），由 `rebuildCustom()` 依 `state.custom` 重建。
- `mergeRemote()` 要先合併 custom 再合併 recs。Firestore 用 `set(..., {merge:true})` 深層合併，要「清掉」的欄位必須明確寫成 0（例如 `pri: 0`、`del: 0`），不能靠刪 key；Firestore 不能存巢狀陣列。
- 題庫、小字典、`aids.js` 都是用到才用 `<script>` 動態載入；新增資料檔要加進 `sw.js` 的 `SHELL`。

## 5. 程式導覽（功能在哪個函式）

- 單字卡：四鍵評分、學習步驟、復原、先挑掉已會的字、看英想中／看中想英、例句挖空、新卡自動發音（`app.js` 的 `renderCard()`、`reveal()`、`rate()`）。
- 逐字標示（`app.js` 的 `karaHtml()`、`karaStart()`；`practice.js` 的 `sentHtml()`）：`karaHtml(text, a0, a1)` 把句子切成 `<span class="kw" data-c="位置">`；`speakSeq()` 發現要唸的元素裡有 `.kw` 就自動逐字加 `is-now`。先用估的時間跑，一收到 boundary 事件就改用事件；`stopSpeech()` 會一併停掉。要在別的地方（例如單字卡例句）加逐字標示，只要用 `karaHtml()` 產生內容、照常呼叫 `speak(text, el)`。測試用的假語音要用 `dispatchEvent` 送 start／boundary／end 才測得到。
- 單字卡提示行（`app.js` 的 `aidHtml()`、`phonicsHtml()`、`rootsHtml()`、`cycleAid()`、`loadAids()`）：設定 `settings.phonetic` = kk／phonics／roots／none，一次一種（舊值 ipa 由 `normSettings()` 改成 kk）；字根字首只在 `revealed` 後顯示；沒有資料的字退回 KK 加小字；點提示行 `cycleAid()` 臨時換下一種，存在 `aidOverride`（只對這張卡，`rate()` 時清掉）。單字庫和練習頁的小卡用 `phonHtml()`，一律顯示 KK。內容在 `data/aids.js`，由 `scripts/aids_build.py` 從 `work/aids/out/*.json` ＋ `work/aids/fixes.json` 產生。
- 單字庫：搜尋、依狀態篩選、標已會／停用／重置；自選的字可以移除。
- 統計：今日、連續天數、各級進度、未來 7 天、12 週熱力圖、最常忘的字；點「複習中／學習中／已會／還沒學」或各級那一列會列出單字。
- 練習：單字填空（預設只出學過的字，不夠用沒學的補）、短文閱讀、聽力應答（Web Speech 唸題目與選項）。答錯的單字填空會把那個字排回單字卡。
- 各選項解析：作答後每個選項底下顯示解析（`practice.js` 的 `noteHtml()`、`keyHtml()`、`optsHtml()`），回饋框有「解題關鍵」。設定 `settings.explain` = `show`（直接顯示）或 `fold`（先收起來，按「看解析」才展開，展開狀態記在 `sess.xp`，換題就收回去）。錯題分析裡點開的題目一律顯示。
- 落點測驗（`practice.js` 的 `pt`、`startPlace()`／`nextPlace()`／`commitPlace()`／`finishPlace()`）：聽力 15 → 單字填空 16 → 短文 3 篇。每題用 `ToeicScore.bestLevel()` 挑「以目前估計資訊量最大」的級別，同級裡沒做過的題先出。作答時不顯示對錯，交卷後看結果頁（總分／聽力／閱讀區間、各題型答對率、弱點用錯題分析的 `CATS` 分類、建議級別按鈕 `T.switchLevel()`、答錯的題用 `wrongItemHtml()`）。每題照樣 `record()` 進練習紀錄，單字填空答錯照樣 `sendBack()`。切級別不會中斷測驗（`Practice.reset()` 不清 `pt`，`reset(true)` 才清）。聽力只播一次，聲音沒出來可以重播一次。
- 估分模型（`js/score.js`）：3PL，`b` 依級別假設 400→175、600→275、800→375、990→455（單科分數），`a` = 0.025，猜對機率四選一 1/4、聽力 1/3；在 5–495 的格點上算 EAP，區間是 ±1 標準差，總分標準差平方和開根號。這些參數沒有校正過，是粗估；用模型本身模擬 40 題的誤差大約 ±45 分（總分）。
- 平常練習估分（`practiceEst()`）：每題只看「第一次就答對」（作答次數 = 答對次數才算對），兩科各取最近 60 題，各至少 10 題才顯示。顯示在統計頁上方（`estHtml()`）和練習首頁的落點測驗卡片。
- 錯題分析：依題型統計「最近一次作答」的答對率、標出最弱的一類並給提示、列出錯題與當時選的選項、只重做錯題。
- 點字查意思、存單字：`practice.js` 的 `tw()` 把英文字包成 `<span class="tw">`；`pickWord()` 查 `GLOSS` 並跳出小卡，**點字本身不會存**，要按小卡上的「存起來」（`onPopClick` 的 `save`）才存：字表內的字 `prioritize()`，字表外的字 `addCustom()`。接在稱謂或人名後面的大寫字視為專有名詞。`ALT` 表處理拼法撞到字表的字（minutes、found）。
- 鍵盤：空白鍵翻面、1–4 評分、P／S 發音、Z 復原；練習頁 1–4／A–D 作答、Enter 下一題、R 重聽、Esc 關小卡。

## 6. 題庫與小字典怎麼重建

原始檔在 `tools/work/`，建置腳本在 `tools/scripts/`（還原後是 `/home/claude/scripts`）。

```
python3 /home/claude/scripts/quiz_validate.py p5 <out.json> <in.json>      格式檢查（另有 read / listen 模式）
python3 /home/claude/scripts/quiz_build.py                                  work/quiz/out/*.json → site/data/quiz_*.js，並產生盲測用的無答案版
python3 /home/claude/scripts/quiz_compare.py p5_400_a read_600 …            比對盲測作答和答案
python3 /home/claude/work/gloss/validate.py <in> <out>                      小字典格式檢查
python3 /home/claude/scripts/gloss_build.py                                 work/gloss/out/gloss_*.json → site/data/gloss.js（音標用 CMUdict）
```

各選項解析是另一條線，原始檔在 `tools/work/notes/`：

```
node /home/claude/scripts/notes_export.js                                   題庫 → notes/in/*.json（寫解析用的輸入，含答案）
python3 /home/claude/work/notes/validate.py p5|read|listen <in> <out>       解析的格式檢查
python3 /home/claude/work/notes/review_check.py <解析檔> <查核結果>          查核結果的格式檢查
python3 /home/claude/work/notes/show_review.py p5_400_a read_600 …          列出查核找到的問題（目前寫法／問題／建議修正）
python3 /home/claude/work/notes/show_review.py -2 p5_400_a …               第二輪查核（review2/，對照 cur/）
python3 /home/claude/work/notes/make_cur.py                                 out/ + fixes.json → cur/（目前線上的解析）
python3 /home/claude/work/notes/make_rv.py                                  in/ + cur/ → rv/（題目和解析合在一起，給查核者讀；需要先跑 notes_export.js 產生 in/）
python3 /home/claude/work/notes/apply_review.py                             查核修正 + manual_fixes.json → fixes.json
python3 /home/claude/scripts/quiz_build.py                                  會把 notes/out/*.json 和 fixes.json 併進題庫
```

- 寫解析的說明書：`notes/BRIEF_COMMON.md` 加上 `BRIEF_P5.md`／`BRIEF_READ.md`／`BRIEF_LISTEN.md`；第一輪查核的說明書：`BRIEF_REVIEW.md`；第二輪（以美籍英文老師的角度抓不自然的英文、台灣學生常見誤解）：`BRIEF_REVIEW2.md`，結果在 `review2/`，不採用的寫進 `review2/rejected.json`。`apply_review.py` 依序套 review/ → review2/ → manual_fixes.json，後面的蓋過前面的。
- 流程：寫解析 → 格式檢查 → 另一個不知情的查核者逐題抓「講錯的規則、對不上原文、沒給理由」→ 我看過每一筆再套用（不同意的寫進 `review/rejected.json`，自己改寫的放 `manual_fixes.json`）。第一輪 1,760 題共修正 40 處。
- 第二輪（`BRIEF_REVIEW2.md`，美籍英文老師的角度）四個級別都做完了：400／600 分（11/17）採用 32 處、自己補同類 11 處；800／990 分（11/19）採用 53 處、自己補 4 處（例如 thrive on 接挑戰不接環境、dismiss 不搭 meeting、deter 的受詞不一定是人、eligible 可以單獨用）。
- 第二輪也挑出題目本身不自然的英文（the city hall、guarantee→warranty、The quantity is limited、incentive scheme→program、tax statement→tax return 之類），共 27 題的原文改在 `work/quiz/fixes.json`，對應的解析改在 `manual_fixes.json`；做法見 `notes/wording_fixes.py`。改題目原文時要注意：解析是用選項文字（`o`）對應選項的，選項改了 `o` 也要改，否則建置會印「解析和選項對不上」；新出現的字要確認小字典或字表裡有。
- 要改某一條解析：在 `notes/manual_fixes.json` 加 `{"題號": {"key": "…", "notes.2.why": "…"}}`（notes 的索引是 `notes/out` 原始檔裡的順序；閱讀的題號是 `r600-07.2`），跑 `apply_review.py` 再跑 `quiz_build.py`。

- 改單一題目：寫進 `work/quiz/fixes.json`（`{"題號": "drop"}` 或 `{"題號": {"欄位路徑": 新值}}`），再跑 `quiz_build.py`。選項順序用題號當亂數種子，重建不會變。
- 改小字典：寫進 `work/gloss/fixes.json`（`{"forms": {變化形: 原形或 null}, "defs": {原形: [[詞性, 中文]]}}`），再跑 `gloss_build.py`。
- 新增題目時，題庫裡出現的新字也要補進小字典，否則點了會顯示「沒有收錄」。
- 出題與盲測的說明書：`work/quiz/BRIEF_*.md`、`work/qa_blind/BRIEF.md`、`work/gloss/BRIEF.md`。
- 題庫 1,760 題都做過一次「不看答案重做再比對」；小字典只抽查過約 300 筆。
文法題是另一條線，原始檔在 `tools/work/gram/`（題目和解析寫在同一個檔）：

```
python3 /home/claude/work/gram/validate.py out/400.json     格式檢查（各類題數、字數、選項）
python3 /home/claude/work/gram/split.py                     gram/out/<級別>.json → quiz/out/p5g_<級別>.json ＋ notes/out/p5g_<級別>.json（題號 g<級別>-NN）
```

- 之後就和其他題目走同一套：`quiz_build.py` 會讀 `p5g_*.json`，盲測檔是 `qa_blind/in/q_p5g_<級別>.json`，解析查核用 `notes/rv/p5g_<級別>.json`、結果放 `notes/review2/`，修正一樣寫 `quiz/fixes.json`（題目）和 `notes/manual_fixes.json`（解析）。改選項文字時，解析的 `o` 也要一起改（見 g600-40）。
- 寫的說明書是 `gram/BRIEF.md`。要再加文法題：新的題目接在 `gram/out/<級別>.json` 後面（題號才不會變），不要刪舊題，要拿掉用 `fixes.json` 的 `"drop"`。
- 新題目用到小字典沒有的字：照「文法題用到的字」的做法手寫加進 `gloss/out/gloss_5.json`（格式和 gloss_1–4 一樣）。

單字卡提示（自然發音、字根字首）是第三條線，原始檔在 `tools/work/aids/`：

```
python3 /home/claude/work/aids/validate.py in/400.json out/400.json        格式檢查（音節拿掉 · 要等於原字、重音索引、字數、疑似簡體字）
python3 /home/claude/work/aids/review_check.py in/400.json out/400.json review/400.json   查核結果的格式檢查
python3 /home/claude/scripts/aids_build.py                                 out/*.json + fixes.json → site/data/aids.js
```

- 寫的說明書 `aids/BRIEF.md`，查核的說明書 `aids/BRIEF_REVIEW.md`（美籍英文老師角度，最重要的是抓假字源）。`in/*.json` 是字表匯出（id、單字、KK、IPA、意思）。
- 要改某一個字：在 `aids/fixes.json` 加 `{"<id>": {"p": {...}}}` 或 `{"<id>": {"r": {...} 或 null}}`（整個欄位覆蓋，null 表示拿掉字根拆解），再跑 `aids_build.py`。

- `phon_build.py` 是 1000 字表音標的產生器（需要 WikiPron 資料，沒有放進來）；`parse.py`／`build.py`／`final.py` 是當初從 PDF 抽字表用的，一般用不到。

## 7. 測試

都是 Playwright 腳本，跑的是 `file:///home/claude/work/site/index.html`，用假的 `speechSynthesis`，截圖存到 `/home/claude/work/shots/`。

```
node /home/claude/scripts/test_prac3.js 400     練習三種題型（可換級別），手機／iPad／桌機
node /home/claude/scripts/test_wrong.js         統計點進去看單字、錯題分析、重做錯題
node /home/claude/scripts/test_tap.js           點字查意思、按「存起來」才存、自選分頁、同步合併（含 320 寬）
node /home/claude/scripts/test_notes.js 400     各選項解析、「先收起來」設定、錯題分析裡的解析（可換級別）
node /home/claude/scripts/test_gate.js          使用權限全流程（用假的 Firebase `fake_firebase.js`＋本機 http 伺服器）：登入、申請、同意後自動進入、撤銷、管理頁與學習狀況、舊規則時放行、離線
node /home/claude/scripts/test_voice.js         語音挑選（各平台的語音清單）、試聽、語速預設與舊值轉換
node /home/claude/scripts/test_gram.js 400      文法題：每回固定 2 題（兩種出題範圍）、標籤、解析、沒有單字列、錯題分析的文法分類（可換級別）
node /home/claude/scripts/test_kara.js          單字填空作答後的句子：英文在上中文在下、點了唸英文、逐字標示（有／沒有 boundary 事件）、錯題分析
node /home/claude/scripts/test_aids.js          單字卡提示行：自然發音、字根字首（翻面前不顯示）、退回 KK、點一下切換、看中文想英文
node /home/claude/scripts/test_place.js         落點測驗全流程（模擬約 500 分的考生）、結果頁、建議級別、統計頁估分、中途結束、沒有語音、合併與清除
node /home/claude/scripts/test_legacy.js        舊格式練習紀錄的相容性
node /home/claude/scripts/test2.js              排程與單字卡流程
node /home/claude/scripts/test_phon.js          音標顯示
node /home/claude/scripts/test_ahead.js         休息畫面快捷鍵（test_ahead2.js 同）
node /home/claude/scripts/sim_place.js          用估分模型本身模擬落點測驗的誤差（不開瀏覽器）
```

每支最後一行印 `errs []`（或 `ERRS: []`／`ERRORS: []`）就是通過。`test_prac.js`、`test_prac2.js` 是早期用樣本資料寫的，已不適用；`test_site.js` 要帶參數；`test_sync.js` 需要連得到 Firebase CDN，在沙盒裡跑不了。

## 8. 已知限制與還沒做的事

- 小字典的中文沒有逐筆核對；約 90 個複合字（check-in 之類）沒有音標。
- 各選項解析查核過兩輪，但不保證每一句都對；使用者回報時用 `notes/manual_fixes.json` 修。
- 題庫盲測主要能抓到「答案標錯」，「另一個選項也說得通」不保證抓乾淨；使用者回報怪題時用 `fixes.json` 修。
- 只有練習頁的英文字可以點；單字卡例句裡的字不能點（小字典只涵蓋題庫用字）。
- 同步的實際上傳路徑（`sync.js` 的 `flushNow`／`pushFull`）在沙盒裡沒辦法連 Firebase 實測，只測過合併邏輯；自選單字的跨裝置同步上線後值得請使用者實際驗一次。
- 落點分數的難度參數是假設的，沒有真實考生資料可以校正；聽力只有 Part 2。若使用者之後有真實多益成績，可以拿來比對、調整 `score.js` 的 `B`。落點測驗結果的跨裝置同步（`place`／`placeCleared`）也只測過合併邏輯。
- 沙盒連不到 `mitsuiwei.github.io`，沒辦法自己確認線上版，要請使用者看。
- 使用者問過「圖像記憶法」怎麼結合，當時回覆了研究依據並問他指的是哪一種，還沒有後續（想過的方向：單字卡加「我的聯想」欄位）。

## 9. 產生大量內容時的教訓

- 第一次同時開 16 個出題工作，把使用者 5 小時的用量額度用完，全部被中斷。之後改成：分批、先做使用者正在用的級別、每批寫完就存檔。
- 讓出題的工作「每 25 題寫一個檔」，中斷後可以從檔案接續。
- 核對答案和建小字典這類較簡單的工作用較輕量的模型就夠，省很多用量。
- 寫各選項解析那次又撞到一次上限：四組用主力模型寫的單字填空（每組約 25 萬 token）還沒跑完就接著開下一輪。之後要更保守：先估總量，同一個 5 小時視窗內不要排超過約 150 萬 token 的主力模型工作；被中斷時先看磁碟上已經寫好的批次，能自己合併就不要重跑。
