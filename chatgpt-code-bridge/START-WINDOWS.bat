@echo off
cd /d "%~dp0"
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
if not exist runtime\tunnel-client-runtime.exe call npm run setup:tunnel
if errorlevel 1 exit /b 1
if not defined BRIDGE_PORT set BRIDGE_PORT=3210
echo Mo http://127.0.0.1:%BRIDGE_PORT% sau khi ung dung bao san sang.
call npm start
pause
