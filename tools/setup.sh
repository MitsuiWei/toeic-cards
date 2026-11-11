#!/bin/sh
# 在新的工作環境還原開發時的目錄配置（tools/scripts 裡的腳本路徑是寫死的）。
# 用法：在 repo 根目錄執行   sh tools/setup.sh
# 做完之後：
#   /home/claude/work/site      網站本體（改這裡，測試也跑這裡）
#   /home/claude/scripts        建置與測試腳本
#   /home/claude/work/quiz …    題庫原始檔、小字典原始檔等
# 上線時把 /home/claude/work/site 的內容複製回 repo 根目錄再 commit（見 tools/HANDOFF.md）。
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p /home/claude/work/site /home/claude/work/shots /home/claude/work/shots/site /home/claude/scripts
mkdir -p /home/claude/work/qa_blind/in /home/claude/work/qa_blind/out /home/claude/work/qa_keys
(cd "$REPO" && tar cf - --exclude=.git --exclude=tools .) | (cd /home/claude/work/site && tar xf -)
cp -r "$REPO/tools/scripts/." /home/claude/scripts/
cp -r "$REPO/tools/work/." /home/claude/work/
pip install --break-system-packages -q cmudict hanzidentifier 2>/dev/null || echo "（pip 安裝 cmudict / hanzidentifier 失敗：重建小字典音標和簡體字檢查會用到）"
echo "完成。網站在 /home/claude/work/site，腳本在 /home/claude/scripts"
