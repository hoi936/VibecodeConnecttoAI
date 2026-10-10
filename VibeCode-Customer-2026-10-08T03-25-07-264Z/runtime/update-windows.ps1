$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host ("==> " + $Text) -ForegroundColor Cyan
}

function Read-EnvValue([string]$File, [string]$Name, [string]$Fallback = "") {
  if (-not (Test-Path -LiteralPath $File)) { return $Fallback }
  $line = Get-Content -LiteralPath $File | Where-Object { $_ -match ("^" + [regex]::Escape($Name) + "=") } | Select-Object -Last 1
  if (-not $line) { return $Fallback }
  return ($line -replace ("^" + [regex]::Escape($Name) + "="), "").Trim()
}

function Copy-Relative([string]$FromRoot, [string]$ToRoot, [string]$Relative) {
  $src = Join-Path $FromRoot $Relative
  if (-not (Test-Path -LiteralPath $src)) { return }
  $dst = Join-Path $ToRoot $Relative
  $parent = Split-Path -Parent $dst
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  if ((Get-Item -LiteralPath $src).PSIsContainer) {
    if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  } else {
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
}

function Choose-OldInstall() {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Chon thu muc VibeCode cu dang su dung"
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Da huy cap nhat vi chua chon ban VibeCode cu."
  }
  return $dialog.SelectedPath
}

function Stop-OldVideCode([string]$OldRoot) {
  $pidFile = Join-Path $OldRoot ".videcode.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $savedPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    if ($savedPid -match "^\d+$") {
      $process = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
      if ($process -and $process.ProcessName -like "VideCode*") {
        Write-Host ("Dang dung VibeCode cu (PID " + $savedPid + ")...")
        Stop-Process -Id ([int]$savedPid) -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
      } elseif ($process) {
        Write-Host ("Bo qua PID cu " + $savedPid + " vi khong phai tien trinh VibeCode.")
      }
    }
  }

  $oldEnv = Join-Path $OldRoot ".env"
  $adminPort = Read-EnvValue $oldEnv "ADMIN_PORT" "3001"
  try {
    $health = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $adminPort + "/health") -TimeoutSec 1
    if ($health.name -eq "videcode-customer" -and $health.pid) {
      Write-Host ("Dang dung VibeCode cu qua health endpoint (PID " + $health.pid + ")...")
      Stop-Process -Id ([int]$health.pid) -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 800
    }
  } catch {}
}

function Sanitize-And-Migrate-Env([string]$OldRoot, [string]$NewRoot) {
  $oldEnv = Join-Path $OldRoot ".env"
  $newEnv = Join-Path $NewRoot ".env"
  if (-not (Test-Path -LiteralPath $oldEnv)) { return }

  $values = [ordered]@{}

  foreach ($line in @(Get-Content -LiteralPath $newEnv -ErrorAction SilentlyContinue)) {
    if ($line -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
      $values[$Matches[1]] = $Matches[2]
    }
  }
  foreach ($line in @(Get-Content -LiteralPath $oldEnv)) {
    if ($line -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
      $key = $Matches[1]
      $unsafeInternal = ($key -match "(?i)(private|issuer)") -or ($key -eq "ADMIN_TOKEN")
      $managedFlag = $key -in @(
        "VIDECODE_SELLER_MODE",
        "VIDECODE_CUSTOMER_EDITION",
        "VIDECODE_LICENSE_REQUIRED",
        "VIDECODE_CUSTOMER_BUILD"
      )
      if (-not $unsafeInternal -and -not $managedFlag) {
        $values[$key] = $Matches[2]
      }
    }
  }

  $values["VIDECODE_LICENSE_REQUIRED"] = "true"
  $values["VIDECODE_CUSTOMER_EDITION"] = "true"
  $values["VIDECODE_SELLER_MODE"] = "false"

  $safe = @($values.GetEnumerator() | ForEach-Object { $_.Key + "=" + $_.Value })
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($newEnv, [string[]]$safe, $utf8)
}

function Read-BuildId([string]$Root) {
  $file = Join-Path $Root "VIDECODE-BUILD.json"
  if (-not (Test-Path -LiteralPath $file)) { return "" }
  try {
    return [string]((Get-Content -LiteralPath $file -Raw | ConvertFrom-Json).build_id)
  } catch {
    return ""
  }
}

function Read-BuildCreatedAt([string]$Root) {
  $file = Join-Path $Root "VIDECODE-BUILD.json"
  if (-not (Test-Path -LiteralPath $file)) { return "" }
  try {
    return [string]((Get-Content -LiteralPath $file -Raw | ConvertFrom-Json).created_at)
  } catch {
    return ""
  }
}

function Assert-Update-Compatible([string]$OldRoot, [string]$NewRoot) {
  $oldPublic = Join-Path $OldRoot "profileslicense-public.pem"
  $newPublic = Join-Path $NewRoot "profileslicense-public.pem"
  if ((Test-Path -LiteralPath $oldPublic) -and (Test-Path -LiteralPath $newPublic)) {
    $oldHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $oldPublic).Hash
    $newHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $newPublic).Hash
    if ($oldHash -ne $newHash) {
      throw "Ban moi dung bo khoa license khac ban cu. Dung cap nhat de tranh mat kich hoat; hay lien he nguoi ban."
    }
  }

  $verifier = Join-Path $NewRoot "runtimewindows-x64VideCode.exe"
  $oldManifest = Join-Path $OldRoot "RELEASE-MANIFEST.json"
  $oldVerifier = Join-Path $OldRoot "runtimewindows-x64VideCode.exe"
  if ((Test-Path -LiteralPath $oldManifest) -and (Test-Path -LiteralPath $oldVerifier)) {
    $verifier = $oldVerifier
  }
  if (-not (Test-Path -LiteralPath $verifier)) {
    throw "Ban moi thieu binary xac minh release."
  }
  & $verifier --verify-release $NewRoot | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Chu ky hoac checksum cua ban cap nhat khong hop le. Khong cap nhat."
  }

  $oldCreated = Read-BuildCreatedAt $OldRoot
  $newCreated = Read-BuildCreatedAt $NewRoot
  if ($oldCreated -and $newCreated) {
    try {
      $oldTime = [DateTimeOffset]::Parse($oldCreated)
      $newTime = [DateTimeOffset]::Parse($newCreated)
      if ($newTime -le $oldTime) {
        throw ("Ban nay khong moi hon ban dang dung. Hien tai: " + $oldCreated + " | Ban vua tai: " + $newCreated)
      }
    } catch [System.FormatException] {
      # Ban rat cu co metadata khong dung chuan: fallback xuong build_id ben duoi.
      $oldCreated = ""
      $newCreated = ""
    }
  }

  if (-not $oldCreated -or -not $newCreated) {
    $oldBuild = Read-BuildId $OldRoot
    $newBuild = Read-BuildId $NewRoot
    if ($oldBuild -and $newBuild -and ([string]::CompareOrdinal($newBuild, $oldBuild) -le 0)) {
      throw ("Ban nay khong moi hon ban dang dung. Hien tai: " + $oldBuild + " | Ban vua tai: " + $newBuild)
    }
  }
}

$NewRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$UserHome = [Environment]::GetFolderPath("UserProfile")
$StateDir = Join-Path $UserHome ".videcode-customer"
$Marker = Join-Path $StateDir "install-path.txt"
$PreviousMarker = Join-Path $StateDir "previous-install-path.txt"
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

Write-Host "VibeCode Customer - Cap nhat an toan" -ForegroundColor Green
Write-Host "Ban moi: $NewRoot"

$OldRoot = ""
if (Test-Path -LiteralPath $Marker) {
  $OldRoot = (Get-Content -LiteralPath $Marker -Raw).Trim()
}
if (-not $OldRoot -or -not (Test-Path -LiteralPath $OldRoot) -or $OldRoot -eq $NewRoot) {
  Write-Host "Chua tim thay ban cu tu dong. Hay chon thu muc VibeCode cu."
  $OldRoot = Choose-OldInstall
}
$OldRoot = (Resolve-Path -LiteralPath $OldRoot).Path

if ($OldRoot -eq $NewRoot) {
  throw "Khong cap nhat de len cung thu muc. Hay giai nen ban moi vao mot thu muc MOI roi chay lai UPDATE-WINDOWS.bat."
}
if (-not (Test-Path -LiteralPath (Join-Path $OldRoot ".env")) -and -not (Test-Path -LiteralPath (Join-Path $OldRoot "runtime"))) {
  throw "Thu muc da chon khong giong mot ban VibeCode Customer hop le."
}

$OldStopped = $false
$UpdateComplete = $false
$BackupRoot = ""
try {
  Write-Step "Kiem tra tuong thich ban cap nhat"
  Assert-Update-Compatible $OldRoot $NewRoot

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $BackupRoot = Join-Path $StateDir ("backups\" + $stamp)
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

  Write-Step "Sao luu cau hinh cu"
  Copy-Relative $OldRoot $BackupRoot ".env"
  Copy-Relative $OldRoot $BackupRoot "profiles/license.json"
Copy-Relative $OldRoot $BackupRoot "profiles/license-clock.json"
Copy-Relative $OldRoot $BackupRoot "profiles/mcp-upstream.json"
Copy-Relative $OldRoot $BackupRoot "profiles/plugins.json"
Copy-Relative $OldRoot $BackupRoot "profiles/codex-hooks.json"
Copy-Relative $OldRoot $BackupRoot "profiles/post-edit-hooks.json"
Copy-Relative $OldRoot $BackupRoot "profiles/tool-overrides.json"
Copy-Relative $OldRoot $BackupRoot ".videcode"
Copy-Relative $OldRoot $BackupRoot ".mcp-oauth"
Copy-Relative $OldRoot $BackupRoot ".mcp-state"
Copy-Relative $OldRoot $BackupRoot ".mcp-checkpoints"
Copy-Relative $OldRoot $BackupRoot ".mcp-audit.log"

  Write-Step "Dung ban VibeCode cu"
  Stop-OldVideCode $OldRoot
  $OldStopped = $true

  Write-Step "Chuyen license, Tunnel, workspace va lich su sang ban moi"
  Sanitize-And-Migrate-Env $OldRoot $NewRoot
  Copy-Relative $OldRoot $NewRoot "profiles/license.json"
Copy-Relative $OldRoot $NewRoot "profiles/license-clock.json"
Copy-Relative $OldRoot $NewRoot "profiles/mcp-upstream.json"
Copy-Relative $OldRoot $NewRoot "profiles/plugins.json"
Copy-Relative $OldRoot $NewRoot "profiles/codex-hooks.json"
Copy-Relative $OldRoot $NewRoot "profiles/post-edit-hooks.json"
Copy-Relative $OldRoot $NewRoot "profiles/tool-overrides.json"
Copy-Relative $OldRoot $NewRoot ".videcode"
Copy-Relative $OldRoot $NewRoot ".mcp-oauth"
Copy-Relative $OldRoot $NewRoot ".mcp-state"
Copy-Relative $OldRoot $NewRoot ".mcp-checkpoints"
Copy-Relative $OldRoot $NewRoot ".mcp-audit.log"

  [System.IO.File]::WriteAllText($PreviousMarker, $OldRoot, (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($Marker, $NewRoot, (New-Object System.Text.UTF8Encoding($false)))

  $history = Join-Path $StateDir "update-history.log"
  Add-Content -LiteralPath $history -Value ((Get-Date).ToString("s") + " | " + $OldRoot + " -> " + $NewRoot + " | backup=" + $BackupRoot)

  Write-Step "Khoi dong ban moi"
  $startFile = Join-Path $NewRoot "START-WINDOWS.bat"
  if (-not (Test-Path -LiteralPath $startFile)) { throw "Ban moi thieu START-WINDOWS.bat" }
  Start-Process -FilePath $startFile -WorkingDirectory $NewRoot | Out-Null

  $newEnv = Join-Path $NewRoot ".env"
  $adminPort = Read-EnvValue $newEnv "ADMIN_PORT" "3001"
  $healthy = $false
  for ($i = 0; $i -lt 35; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $adminPort + "/health") -TimeoutSec 1
      if ($health.name -eq "videcode-customer") {
        $healthy = $true
        break
      }
    } catch {}
  }

  if (-not $healthy) {
    throw "Ban moi khong khoi dong duoc sau khi cap nhat."
  }

  $UpdateComplete = $true
  Write-Host ""
  Write-Host "CAP NHAT THANH CONG" -ForegroundColor Green
  Write-Host ("- Ban cu van con tai de rollback: " + $OldRoot)
  Write-Host ("- Ban sao luu cau hinh: " + $BackupRoot)
  Write-Host "- Sau khi dung thu ban moi on dinh, ban co the xoa thu muc ban cu."
  Read-Host "Nhan Enter de dong"
} catch {
  if ($OldStopped -and -not $UpdateComplete) {
    Write-Host ""
    Write-Host "CAP NHAT THAT BAI - DANG QUAY LAI BAN CU" -ForegroundColor Yellow
    Stop-OldVideCode $NewRoot
    [System.IO.File]::WriteAllText($Marker, $OldRoot, (New-Object System.Text.UTF8Encoding($false)))
    $oldStart = Join-Path $OldRoot "START-WINDOWS.bat"
    if (Test-Path -LiteralPath $oldStart) {
      Start-Process -FilePath $oldStart -WorkingDirectory $OldRoot | Out-Null
    }
    if ($BackupRoot) { Write-Host ("Ban sao luu: " + $BackupRoot) }
  }
  throw
}
