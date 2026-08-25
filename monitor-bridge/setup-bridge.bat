@echo off
title EGBC Monitor Bridge - setup

REM Installing a certificate and opening the firewall both need admin rights,
REM so ask for them up front rather than failing halfway through.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Asking for administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-bridge.ps1"
