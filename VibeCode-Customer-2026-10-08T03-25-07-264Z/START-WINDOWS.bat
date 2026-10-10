@echo off
setlocal
cd /d "%~dp0"
set "DOTENV_CONFIG_OVERRIDE=true"
if not exist "%USERPROFILE%\.videcode-customer" mkdir "%USERPROFILE%\.videcode-customer" >nul 2>&1
> "%USERPROFILE%\.videcode-customer\install-path.txt" echo %CD%
set "ADMIN_PORT=3001"
if exist ".env" for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"ADMIN_PORT=" ".env"') do set "ADMIN_PORT=%%B"
if not exist "runtime\windows-x64\VideCode.exe" (
  echo Khong tim thay VideCode.exe.
  pause
  exit /b 1
)
powershell -NoProfile -Command "$p = Start-Process -FilePath 'runtime\windows-x64\VideCode.exe' -WorkingDirectory (Get-Location) -PassThru -WindowStyle Hidden; Set-Content -LiteralPath '.videcode.pid' -Value $p.Id"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%ADMIN_PORT%/ui/#license"
exit /b 0
