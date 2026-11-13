# 多益單字卡 — 開發交接文件

給接手開發的人（或 AI）看的技術說明。`tools/` 這個資料夾不屬於網站本身，網站不會載入它。

## 1. 這是什麼

- 刷刷庫《多益一千單字表》的間隔複習單字卡網站，外加原創的多益題型練習。
- 純靜態（vanilla JS，沒有 build、沒有模組），直接雙擊 `index.html` 也能跑。
- 線上：<https://mitsuiwei.github.io/toeic-cards/>（GitHub Pages，`main` 分支根目錄）。
- 進度存 `localStorage`（key `toeic-cards-v1`），登入 Google 後用 Firebase Firestore 跨裝置同步。

## 2. 工作慣例

- **先給使用者看畫面，他說「上線」才 commit / push。** 使用者自己沒有本機 repo，commit 和 push 都由這邊做。
- 每次上線把 `sw.js` 的 `VERSION` 加一（目前 `toeic-cards-v13`），舊快取才會被換掉。
- 所有中文一律繁體、台灣用語；不可以出現簡體字。
- 題目必須原創，不可抄多益官方或任何出版社的試題。
- 主要使用裝置是 iPad 和手機：每次改版面都要檢查 320 / 390 / 820 / 1280 寬，不能有橫向溢出。
- 「說明」分頁依使用者要求只留三段（四個按鈕／兩個已經會了／電腦快捷鍵），不要自行加段落。

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

## 4. 網站檔案

| 檔案 | 內容 |
|---|---|
| `index.html` | 頁面骨架：級別分頁（400／600／800／990／自選／全部）＋六個檢視（學習、練習、單字庫、統計、設定、說明） |
| `css/style.css` | 樣式。刷刷庫配色；桌機是左側直排分頁＋棕框，≤720px 改成上方 6 格分頁列 |
| `js/srs.js` | 排程（SM-2／Anki 式）：學習步驟 1 分 → 10 分 → 1 天；`buildQueue`、`apply`、`previews`、`fmtDue` |
| `js/app.js` | 主程式：狀態、單字卡、單字庫、統計、設定、匯入匯出、同步合併、自選單字 |
| `js/practice.js` | 練習頁：三種題型、錯題分析、點字查意思並存單字 |
| `js/sync.js` | Firebase Auth（Google）＋ Firestore 同步 |
| `js/firebase-config.js` | Firebase 專案設定（瀏覽器端金鑰，本來就是公開的；已限制 HTTP referrer） |
| `data/words.js` | `window.WORDS`：1000 個字 `{id, w, lv, kk, ip, d:[[詞性, 中文]], ex, zh, hl:[起, 迄]}` |
| `data/quiz_p5.js` | 單字填空 1000 題（每個字一題） |
| `data/quiz_read.js` | 短文閱讀 120 篇（每級 30 篇：20 篇 Part 7 ＋ 10 篇 Part 6，每篇 3 題） |
| `data/quiz_listen.js` | 聽力應答 400 題（每級 100 題） |
| `data/quiz_meta.js` | 各題型各級題數 |
| `data/gloss.js` | 題庫小字典：題目裡出現的字的原形、音標、中文（點字時才載入） |
| `sw.js` | 離線快取（stale-while-revalidate），新版啟用後頁面自動重新整理 |

題庫和小字典都是「進到練習頁／第一次點字」才用 `<script>` 動態載入。

### 資料格式

```
QUIZ_P5     {id:'p'+wid, wid, lv, t:'v'|'f', q:'… ------- …', o:[4], a, zh, ex}
QUIZ_READ   {id:'r400-01', lv, p:6|7, k, ti, tx, zh, w:[wid], qs:[{q, o:[4], a, ex}×3]}   Part 6 空格寫成 "[1] -------"
QUIZ_LISTEN {id:'l400-001', lv, t, q, o:[3], a, zq, zo:[3], ex}
GLOSS       {f:{變化形: 原形}, w:{原形: [KK, IPA, '詞性|中文', …]}, n:{專有名詞: 1}, c:{原形: 顯示用大小寫}}
```

### 狀態（localStorage 與 Firestore `toeicCards/{uid}`）

```
recs[id]            = {st:'new'|'learning'|'relearning'|'review'|'known'|'suspended', step, iv, ef, due, reps, lapses, last, pri?}
                      pri = 在練習題點過「要背」的時間，新字佇列裡 pri 的排最前面（取消時設成 0）
practice[題型][題號] = [作答次數, 累計答對題數, 最後作答時間, 最後一次答對題數, 最後一次選的選項字串]
                      題型 p5 / read / listen；閱讀的最後一欄是三題的選項，例如 "203"
pday[YYYY-MM-DD]    = {p5:[題數, 答對], read:[…], listen:[…], t}
custom[id]          = {w, kk, ip, d:['詞性|中文'], ex, zh, hl:[起, 迄], t, del}     自選單字，id = 'c_' + 原形
                      d 用字串陣列是因為 Firestore 不能存巢狀陣列；del = 1 是刪除記號
settings, settingsUpdated, daily, level, view, log
```

- 字表的字 id 是數字（1–1000），自選的是字串 `c_xxx`；從 DOM 讀 id 一律用 `idOf()`，級別用 `lvOf()`（值可能是數字、`'my'`、`'all'`）。
- 自選單字接在 `WORDS` 陣列後面（`lv:'my'`、`custom:true`），由 `rebuildCustom()` 依 `state.custom` 重建。
- 同步是「每筆資料看時間戳，新的贏」：recs 看 `last`，practice 看第 3 欄，pday 和 custom 看 `t`，settings 看 `settingsUpdated`。`mergeRemote()` 要先合併 custom 再合併 recs。
- Firestore 用 `set(..., {merge:true})` 深層合併，所以要「清掉」的欄位必須明確寫成 0（例如 `pri: 0`、`del: 0`），不能靠刪 key。
- 複習紀錄另外放 `toeicCards/{uid}/log/{YYYY-MM}`。

## 5. 功能現況

- 單字卡：四鍵評分、學習步驟、復原、先挑掉已會的字、看英想中／看中想英、例句挖空、新卡自動發音、KK／IPA 音標。
- 單字庫：搜尋、依狀態篩選、標已會／停用／重置；自選的字可以移除。
- 統計：今日、連續天數、各級進度、未來 7 天、12 週熱力圖、最常忘的字；點「複習中／學習中／已會／還沒學」或各級那一列會列出單字。
- 練習：單字填空（預設只出學過的字，不夠用沒學的補）、短文閱讀、聽力應答（Web Speech 唸題目與選項）。答錯的單字填空會把那個字排回單字卡。
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

- 改單一題目：寫進 `work/quiz/fixes.json`（`{"題號": "drop"}` 或 `{"題號": {"欄位路徑": 新值}}`），再跑 `quiz_build.py`。選項順序用題號當亂數種子，重建不會變。
- 改小字典：寫進 `work/gloss/fixes.json`（`{"forms": {變化形: 原形或 null}, "defs": {原形: [[詞性, 中文]]}}`），再跑 `gloss_build.py`。
- 新增題目時，題庫裡出現的新字也要補進小字典，否則點了會顯示「沒有收錄」。
- 出題與盲測的說明書：`work/quiz/BRIEF_*.md`、`work/qa_blind/BRIEF.md`、`work/gloss/BRIEF.md`。
- 題庫 1,760 題都做過一次「不看答案重做再比對」；小字典只抽查過約 300 筆。
- `phon_build.py` 是 1000 字表音標的產生器（需要 WikiPron 資料，沒有放進來）；`parse.py`／`build.py`／`final.py` 是當初從 PDF 抽字表用的，一般用不到。

## 7. 測試

都是 Playwright 腳本，跑的是 `file:///home/claude/work/site/index.html`，用假的 `speechSynthesis`，截圖存到 `/home/claude/work/shots/`。

```
node /home/claude/scripts/test_prac3.js 400     練習三種題型（可換級別），手機／iPad／桌機
node /home/claude/scripts/test_wrong.js         統計點進去看單字、錯題分析、重做錯題
node /home/claude/scripts/test_tap.js           點字查意思、按「存起來」才存、自選分頁、同步合併（含 320 寬）
node /home/claude/scripts/test_legacy.js        舊格式練習紀錄的相容性
node /home/claude/scripts/test2.js              排程與單字卡流程
node /home/claude/scripts/test_phon.js          音標顯示
node /home/claude/scripts/test_ahead.js         休息畫面快捷鍵（test_ahead2.js 同）
```

每支最後一行印 `errs []`（或 `ERRS: []`／`ERRORS: []`）就是通過。`test_prac.js`、`test_prac2.js` 是早期用樣本資料寫的，已不適用；`test_site.js` 要帶參數；`test_sync.js` 需要連得到 Firebase CDN，在沙盒裡跑不了。

## 8. 已知限制與還沒做的事

- 小字典的中文沒有逐筆核對；約 90 個複合字（check-in 之類）沒有音標。
- 題庫盲測主要能抓到「答案標錯」，「另一個選項也說得通」不保證抓乾淨；使用者回報怪題時用 `fixes.json` 修。
- 只有練習頁的英文字可以點；單字卡例句裡的字不能點（小字典只涵蓋題庫用字）。
- 同步的實際上傳路徑（`sync.js` 的 `flushNow`／`pushFull`）在沙盒裡沒辦法連 Firebase 實測，只測過合併邏輯；自選單字的跨裝置同步上線後值得請使用者實際驗一次。
- 沙盒連不到 `mitsuiwei.github.io`，沒辦法自己確認線上版，要請使用者看。
- 使用者問過「圖像記憶法」怎麼結合，當時回覆了研究依據並問他指的是哪一種，還沒有後續（想過的方向：單字卡加「我的聯想」欄位）。

## 9. 產生大量內容時的教訓

- 第一次同時開 16 個出題工作，把使用者 5 小時的用量額度用完，全部被中斷。之後改成：分批、先做使用者正在用的級別、每批寫完就存檔。
- 讓出題的工作「每 25 題寫一個檔」，中斷後可以從檔案接續。
- 核對答案和建小字典這類較簡單的工作用較輕量的模型就夠，省很多用量。
