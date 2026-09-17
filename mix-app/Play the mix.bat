@echo off
REM ============================================================
REM  Mix Player — for the night
REM
REM  Runs the player straight from the repo, so it does not need
REM  the installer (which SmartScreen blocks every time) and does
REM  not need Mix Builder to be closed.
REM
REM  Copy this file to the Desktop if you want it to hand.
REM ============================================================
setlocal
set ELECTRON_RUN_AS_NODE=
start "" "C:\GitHub\availability-form\mix-app\node_modules\electron\dist\electron.exe" "C:\GitHub\availability-form\mix-app" --player
