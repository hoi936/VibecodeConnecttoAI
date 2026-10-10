$ErrorActionPreference = "Stop"

function Read-EnvValue([string]$File, [string]$Name, [string]$Fallback = "") {
  if (-not (Test-Path -LiteralPath $File)) { return $Fallback }
  $line = Get-Content -LiteralPath $File | Where-Object { $_ -match ("^" + [regex]::Escape($Name) + "=") } | Select-Object -Last 1
  if (-not $line) { return $Fallback }
  return ($line -replace ("^" + [regex]::Escape($Name) + "="), "").Trim()
}

function Stop-VideCodeRoot([string]$Root) {
  $pidFile = Join-Path $Root ".videcode.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $savedPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    if ($savedPid -match "^\d+$") {
      $process = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
      if ($process -and $process.ProcessName -like "VideCode*") {
        Stop-Process -Id ([int]$savedPid) -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 700
      }
    }
  }

  $adminPort = Read-EnvValue (Join-Path $Root ".env") "ADMIN_PORT" "3001"
  try {
    $health = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $adminPort + "/health") -TimeoutSec 1
    if ($health.name -eq "videcode-customer" -and $health.pid) {
      Stop-Process -Id ([int]$health.pid) -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 700
    }
  } catch {}
}

$CurrentRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$UserHome = [Environment]::GetFolderPath("UserProfile")
$StateDir = Join-Path $UserHome ".videcode-customer"
$Marker = Join-Path $StateDir "install-path.txt"
$PreviousMarker = Join-Path $StateDir "previous-install-path.txt"

Write-Host "VibeCode Customer - Quay lai ban truoc" -ForegroundColor Yellow

if (-not (Test-Path -LiteralPath $PreviousMarker)) {
  throw "Khong tim thay thong tin ban truoc. Chi rollback duoc sau khi da cap nhat bang file UPDATE."
}
$OldRoot = (Get-Content -LiteralPath $PreviousMarker -Raw).Trim()
if (-not $OldRoot -or -not (Test-Path -LiteralPath $OldRoot)) {
  throw "Thu muc ban truoc khong con ton tai. Co the ban da xoa thu muc cu."
}
$OldRoot = (Resolve-Path -LiteralPath $OldRoot).Path
if ($OldRoot -eq $CurrentRoot) {
  throw "Ban truoc va ban hien tai dang trung nhau; khong co gi de rollback."
}
$OldStart = Join-Path $OldRoot "START-WINDOWS.bat"
if (-not (Test-Path -LiteralPath $OldStart)) {
  throw "Ban truoc thieu START-WINDOWS.bat. Khong rollback de tranh loi."
}

Stop-VideCodeRoot $CurrentRoot
[System.IO.File]::WriteAllText($Marker, $OldRoot, (New-Object System.Text.UTF8Encoding($false)))
Start-Process -FilePath $OldStart -WorkingDirectory $OldRoot | Out-Null

$adminPort = Read-EnvValue (Join-Path $OldRoot ".env") "ADMIN_PORT" "3001"
$healthy = $false
for ($i = 0; $i -lt 35; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $adminPort + "/health") -TimeoutSec 1
    if ($health.name -eq "videcode-customer") { $healthy = $true; break }
  } catch {}
}

if (-not $healthy) {
  [System.IO.File]::WriteAllText($Marker, $CurrentRoot, (New-Object System.Text.UTF8Encoding($false)))
  $currentStart = Join-Path $CurrentRoot "START-WINDOWS.bat"
  if (Test-Path -LiteralPath $currentStart) {
    Start-Process -FilePath $currentStart -WorkingDirectory $CurrentRoot | Out-Null
  }
  throw "Ban truoc khong khoi dong duoc. Da quay lai ban hien tai."
}

Write-Host ""
Write-Host "ROLLBACK THANH CONG" -ForegroundColor Green
Write-Host ("- Dang chay lai: " + $OldRoot)
Write-Host ("- Ban vua rollback van con tai: " + $CurrentRoot)
Write-Host "- Project/code khong bi thay doi."
Read-Host "Nhan Enter de dong"
