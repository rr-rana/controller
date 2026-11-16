@echo off
title ETS2 RR Controller - Companion
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install the LTS version from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)
if not exist dist\companion\src\index.js (
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)
node dist\companion\src\index.js %*
pause
