# 多益單字卡

刷刷庫《多益一千單字表》的間隔複習卡片網站。純靜態、不需要後端，進度存在瀏覽器的 localStorage。

## 功能

- **四個級別 + 全部**：衝 400 / 600 / 800 / 990 分，側標數字是今天到期要複習的張數
- **仿 Anki 排程**：新卡走 1 分 → 10 分 → 1 天的學習步驟，之後依「重來 / 困難 / 良好 / 簡單」用 SM-2 拉長間隔；忘記的卡會回到 10 分鐘重學
- **點一下就發音**：單字、例句都可以點，用瀏覽器內建語音（Web Speech API）；可設定翻面自動播放、語速、語音
- **新卡自動唸單字**：每換一張卡自動唸一次單字（設定可關；剛打開網頁的第一張因瀏覽器限制不會自動唸）
- **音標**：每個字都有 KK 與 IPA（美式），設定可切換或關閉；重音會移位的字（如 contract 名詞／動詞）依詞性分開標
- **先挑掉已經會的字**：快速篩選模式，一秒內想得起來就按「認得」，直接標成已會，不浪費複習時間
- **卡片方向**：看英文想中文、或看中文想英文；正面例句可選顯示 / 挖空 / 隱藏
- **練習（原創題庫）**：三種題型、四個級別都有 —— 單字填空（Part 5 風格，每個單字一題）、短文閱讀（Part 6、7 風格）、聽力應答（Part 2 風格，用語音唸題目和三個回答）。作答後立刻看到中譯和解析；預設只出「學過的字」，答錯的字會自動排回單字卡複習
- **單字庫**：搜尋、依狀態篩選、看下次到期、標記已會 / 停用 / 重置
- **統計**：今日張數與記得比例、連續天數、各級進度、未來 7 天到期、12 週熱力圖、最常忘記的字、各題型練習的答對率；點「複習中／學習中／已會／還沒學」會列出是哪些字（下次到期、間隔、忘記次數）
- **錯題分析**：練習頁裡，統計哪一類題型最常錯（單字題／詞性題、閱讀的主旨／細節／推論／NOT／字義題、聽力的各種問句），列出每一題錯題、你選的和正確答案，並可以只重做錯題
- **點字查意思、存單字**：練習題的題目、短文、聽力原文裡，每個英文字都可以點。點了會顯示音標和中文意思；想背的話再按小卡上的「存起來」：字表裡還沒學的字會排到該級別新字的最前面；字表以外的字進「自選」分頁，例句就是點它的那一句，之後和其他單字卡一樣排程複習
- **雲端同步**：用 Google 帳號登入後，iPad、手機、電腦的進度互相同步（Firebase Firestore，免費方案夠用）；沒登入也能用，只存本機
- **備份**：匯出 / 匯入 JSON；也能匯出成 Anki 可匯入的 TSV
- **鍵盤**：空白鍵翻面（翻面後再按一次 = 良好）、1–4 評分、P 唸單字、S 唸例句、Z 復原；練習頁用 1–4 或 A–D 作答、Enter 下一題、R 重聽

## 檔案

```
index.html        頁面
css/style.css     樣式
js/srs.js         排程演算法（純函式，可單獨測試）
js/app.js         介面與狀態
js/practice.js    練習頁（單字填空 / 短文閱讀 / 聽力應答）
js/sync.js        雲端同步（Firebase Auth + Firestore）
js/firebase-config.js  Firebase 專案設定；改成 null 就關閉同步
data/words.js     1000 個單字（從 PDF 抽出，已修正原表的 3 個錯字），含 KK / IPA 音標
data/quiz_*.js    練習題庫（p5 / read / listen，進到練習頁才載入）與各級題數（meta）
data/gloss.js     題庫小字典：題目裡出現的字（約 2,400 個原形）的音標與中文，點字查意思時才載入
sw.js             離線快取；每次更新網站記得把裡面的 VERSION 改掉
manifest.webmanifest, icons/   加到手機主畫面用
```

`tools/` 不是網站的一部分：裡面是題庫與小字典的原始檔、建置和測試腳本，以及開發交接文件 [`tools/HANDOFF.md`](tools/HANDOFF.md)。

## Firebase 設定（只需做一次）

1. Firebase Console → 專案 → **Authentication → Sign-in method** → 啟用 Google
2. **Authentication → Settings → Authorized domains** → 新增 `你的帳號.github.io`（本機測試用 `localhost` 已預設在裡面）
3. **Firestore Database** → 若還沒建，建立資料庫（asia-east1、production mode）
4. **Firestore → 規則** 貼上下面這段並發布（只動 `toeicCards` 這個 collection，不影響同專案其他資料）：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /toeicCards/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /log/{month} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

如果原本的規則裡已經有別的 `match`，把 `match /toeicCards/{uid} { ... }` 整段加進 `documents` 裡面就好。

資料放在 `toeicCards/{使用者uid}`（卡片進度、設定、練習成績、自選單字）和 `toeicCards/{uid}/log/{年-月}`（複習紀錄）。兩台裝置同時改到同一張卡時，以最後操作時間較新的為準。

## 放到 GitHub Pages

1. 在 GitHub 建一個新 repo（例如 `toeic-cards`）
2. 把這個資料夾的所有檔案推上去：

```
cd toeic-cards
git init
git add .
git commit -m "多益單字卡"
git branch -M main
git remote add origin https://github.com/你的帳號/toeic-cards.git
git push -u origin main
```

3. 到 repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main` / `(root)`，存檔
4. 一兩分鐘後網址會是 `https://你的帳號.github.io/toeic-cards/`

直接雙擊 `index.html` 在本機打開也能用，不需要伺服器。

## 注意

- 沒登入時進度只存在這台裝置的瀏覽器；登入 Google 後才會跨裝置同步
- iPhone／iPad 加到主畫面的版本，登入視窗有時跳不回 app；遇到就先在 Safari 開網址登入並使用，或直接用 Safari 不加主畫面
- 發音品質看裝置：Chrome 選「Google US English」、iPhone / Mac 選「Samantha」會比較自然。iOS Safari 要先點過頁面一次，語音才會出聲
- 字型用 Google Fonts 的 Noto Sans TC，沒網路時會退回系統字型，功能不受影響

## 資料來源

音標以 CMU Pronouncing Dictionary 的美式發音為底，依學習型字典慣例整理成 IPA，再轉成 KK（eɪ→e、oʊ→o、非重音 i→ɪ、重音符號 ˋ ˏ），並逐筆檢查過一輪；細節（如非重音的 ə / ɪ、[nu] 而非舊式 [nju]）可能和紙本字典略有出入。

練習題全部是依這份單字表另外寫的原創題目，不是多益官方或任何出版社的試題。每一題都另外「不看答案」重做一次核對過，但難免還有漏網的，遇到怪題請直接跳過。

題庫小字典（data/gloss.js）的中文解釋是另外整理的，只收每個字在日常與商務情境最常用的 1–3 個意思，音標同樣由 CMU Pronouncing Dictionary 轉換；複合字（如 check-in）沒有音標。

單字、例句與翻譯來自刷刷庫《多益一千單字表》，僅供個人學習使用。
