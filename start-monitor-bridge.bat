@echo off
title EGBC Monitor Bridge
cd /d "%~dp0monitor-bridge"

if not exist "node_modules\ws" (
  echo First run - installing dependencies...
  call npm install
  echo.
)

:run
echo Starting EGBC Monitor Bridge...
echo.
node bridge.js

echo.
echo The bridge has stopped.
choice /c RQ /n /m "Press R to restart it, or Q to quit: "
if errorlevel 2 goto :eof
goto run
