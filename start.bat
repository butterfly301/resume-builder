@echo off
setlocal
cd /d "%~dp0"
title Resume Editor

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 20 or later, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

if not exist "dist\index.html" (
  echo Building the application...
  call npm run build
  if errorlevel 1 goto :failed
)

if not defined AUTO_OPEN set "AUTO_OPEN=1"
echo Starting Resume Builder at http://127.0.0.1:4178 (Edge)
echo Keep this window open while using the application.
echo.
node "dist-server\server\index.js"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [ERROR] The Resume Editor server stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

:failed
echo.
echo [ERROR] Setup failed. Review the messages above.
pause
exit /b 1
