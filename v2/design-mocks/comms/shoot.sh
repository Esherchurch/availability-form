#!/bin/sh
# Pictures of the comms mock-ups at 375px. From this folder: sh shoot.sh [name ...]
# Chrome gets a throwaway profile ($SHOT_PROFILE, else a temp folder), never the real one.
D="$(cygpath -m "$PWD" 2>/dev/null || pwd)"
P="${SHOT_PROFILE:-$(mktemp -d)}"
C="${CHROME_PATH:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ $# -eq 0 ] && set -- $(ls *-375.html | sed 's/\.html$//')
for f in "$@"; do
  H=$(grep -o 'data-h="[0-9]*"' "$f.html" | head -1 | tr -dc 0-9); H=${H:-812}
  timeout 60 "$C" --headless=new --user-data-dir="$P" --no-first-run --disable-gpu --hide-scrollbars \
    --window-size=375,$H --screenshot="$D/$f.png" "file:///$D/$f.html" >/dev/null 2>&1 && echo "$f.png"
done
