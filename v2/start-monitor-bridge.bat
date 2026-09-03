@echo off
REM Convenience shortcut for anyone who has the whole repo checked out.
REM The bridge itself lives in monitor-bridge\ and is self-contained - that is
REM the folder you copy to the bridge PC.
title EGBC Monitor Bridge

if not exist "%~dp0monitor-bridge\start-bridge.bat" (
  echo Cannot find monitor-bridge\start-bridge.bat next to this file.
  pause
  exit /b 1
)

call "%~dp0monitor-bridge\start-bridge.bat"
