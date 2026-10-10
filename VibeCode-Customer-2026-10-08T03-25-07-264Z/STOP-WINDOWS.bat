@echo off
setlocal
cd /d "%~dp0"
if not exist ".videcode.pid" (
  echo VibeCode khong co PID da luu. Neu van dang chay, dong tu Task Manager.
  pause
  exit /b 0
)
set /p VIDECODE_PID=<.videcode.pid
powershell -NoProfile -Command "$p=Get-Process -Id %VIDECODE_PID% -ErrorAction SilentlyContinue; if($p -and $p.ProcessName -like 'VideCode*'){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
  echo PID da luu khong con la tien trinh VibeCode. Khong tu dong kill de tranh dung nham ung dung khac.
  del /q ".videcode.pid" >nul 2>&1
  pause
  exit /b 0
)
taskkill /PID %VIDECODE_PID% /T /F >nul 2>&1
del /q ".videcode.pid" >nul 2>&1
echo Da dung VibeCode. Bay gio ban co the xoa thu muc VibeCode nay.
pause
