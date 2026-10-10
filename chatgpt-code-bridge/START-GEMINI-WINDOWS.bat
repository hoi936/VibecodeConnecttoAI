@echo off
setlocal
cd /d "%~dp0"
if not defined BRIDGE_PORT set BRIDGE_PORT=3213
if not defined BRIDGE_DATA_DIR set BRIDGE_DATA_DIR=.local\gemini-preview
where node >nul 2>nul
if errorlevel 1 (
  echo Can cai Node.js 22+ va Git truoc khi chay.
  pause
  exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 exit /b 1
if not exist upstream\mcp-servers\src\filesystem\dist\index.js call npm run setup
if errorlevel 1 exit /b 1
echo Mo http://127.0.0.1:%BRIDGE_PORT%/#gemini sau khi ung dung bao san sang.
call npm start
pause
