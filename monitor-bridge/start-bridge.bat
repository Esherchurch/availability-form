@echo off
title EGBC Monitor Bridge
cd /d "%~dp0"

if not exist "node_modules\ws" (
  echo Dependencies are missing - run setup-bridge.bat first.
  echo.
  pause
  exit /b 1
)

if not exist "config.json" (
  echo No config.json - run setup-bridge.bat first so the bridge knows
  echo where the mixer is.
  echo.
  pause
  exit /b 1
)

:run
echo Starting EGBC Monitor Bridge...
echo Leave this window open during the service.
echo.
node bridge.js

echo.
echo The bridge has stopped.
choice /c RQ /n /m "Press R to restart it, or Q to quit: "
if errorlevel 2 goto :eof
goto run
