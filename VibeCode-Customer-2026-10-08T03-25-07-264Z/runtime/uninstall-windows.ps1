$ErrorActionPreference = "SilentlyContinue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$UserHome = [Environment]::GetFolderPath("UserProfile")
$StateDir = Join-Path $UserHome ".videcode-customer"
Write-Host ""
Write-Host "GO VIBECODE" -ForegroundColor Yellow
Write-Host "1. Chi xoa ung dung (giu log/backup VibeCode trong thu muc nguoi dung)"
Write-Host "2. Xoa ung dung + TOAN BO du lieu VibeCode (log/backup/trang thai)"
$choice = Read-Host "Lua chon [1]"
$PurgeData = $choice -eq "2"
$PidFile = Join-Path $Root ".videcode.pid"
if (Test-Path -LiteralPath $PidFile) {
  $savedPid = (Get-Content -LiteralPath $PidFile -Raw).Trim()
  if ($savedPid -match "^\d+$") {
    $p = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -like "VideCode*") {
      Stop-Process -Id ([int]$savedPid) -Force -ErrorAction SilentlyContinue
    }
  }
}
$marker = Join-Path $StateDir "install-path.txt"
if (Test-Path -LiteralPath $marker) {
  $current = (Get-Content -LiteralPath $marker -Raw).Trim()
  if ($current -eq $Root) { Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue }
}
$escaped = $Root.Replace("'", "''")
$stateEscaped = $StateDir.Replace("'", "''")
$logEscaped = (Join-Path $UserHome ".videcode-customer.log").Replace("'", "''")
$helper = Join-Path $env:TEMP ("videcode-uninstall-" + [guid]::NewGuid().ToString("N") + ".ps1")
$commands = @(
  "Start-Sleep -Seconds 2",
  "Remove-Item -LiteralPath '" + $escaped + "' -Recurse -Force -ErrorAction SilentlyContinue"
)
if ($PurgeData) {
  $commands += "Remove-Item -LiteralPath '" + $stateEscaped + "' -Recurse -Force -ErrorAction SilentlyContinue"
  $commands += "Remove-Item -LiteralPath '" + $logEscaped + "' -Force -ErrorAction SilentlyContinue"
}
$commands += "Remove-Item -LiteralPath '" + $helper.Replace("'", "''") + "' -Force -ErrorAction SilentlyContinue"
$body = $commands -join "; "
[System.IO.File]::WriteAllText($helper, $body, (New-Object System.Text.UTF8Encoding($false)))
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$helper | Out-Null
Write-Host "Dang go VibeCode. Thu muc project/code cua ban se KHONG bi xoa."
if ($PurgeData) { Write-Host "Da chon xoa toan bo du lieu VibeCode trong profile nguoi dung." }
