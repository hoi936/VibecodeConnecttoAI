@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\update-windows.ps1"
if errorlevel 1 (
  echo.
  echo Cap nhat chua hoan tat. Ban cu khong bi xoa.
  pause
)
