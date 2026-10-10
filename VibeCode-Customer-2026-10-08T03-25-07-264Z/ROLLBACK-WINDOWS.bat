@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\rollback-windows.ps1"
if errorlevel 1 (
  echo.
  echo Rollback chua hoan tat. VibeCode da co gang giu ban dang hoat dong.
  pause
)
