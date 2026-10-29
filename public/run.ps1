# Souls Game Death Counter - One-Line Launcher
# Safe, open-source launcher that runs the hotkey companion app without browser download warnings or SmartScreen prompts.

$ErrorActionPreference = 'Stop'
Write-Host "Souls Game Death Counter - Launching companion app..." -ForegroundColor Cyan

$appDir = Join-Path $env:LOCALAPPDATA "SoulsDeathCounter"
if (-not (Test-Path $appDir)) {
    New-Item -ItemType Directory -Path $appDir -Force | Out-Null
}

$exePath = Join-Path $appDir "DeathCounterHotkeys.exe"
$cfgPath = Join-Path $appDir "hotkey-config.json"
$icoPath = Join-Path $appDir "app.ico"

# Stop existing instance if already running
Get-Process -Name DeathCounterHotkeys -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseUri = "https://soulgamedc-rosy.vercel.app"
$wc = New-Object Net.WebClient
$wc.Headers.Add("User-Agent", "SoulsDeathCounterLauncher/2.0")

try {
    Write-Host "Downloading latest hotkey listener..." -ForegroundColor DarkGray
    $wc.DownloadFile("$baseUri/DeathCounterHotkeys.exe", $exePath)
    $wc.DownloadFile("$baseUri/hotkey-config.json", $cfgPath)
    $wc.DownloadFile("$baseUri/app.ico", $icoPath)
} catch {
    Write-Host "Download failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Automatically unblock file to ensure zero Windows SmartScreen prompts
Unblock-File -Path $exePath -ErrorAction SilentlyContinue
Unblock-File -Path $cfgPath -ErrorAction SilentlyContinue

# Launch the app
Start-Process -FilePath $exePath -WorkingDirectory $appDir
Write-Host "Hotkeys Active! Press F8 in-game for +1 Death, F7 for Undo." -ForegroundColor Green
Write-Host "Companion window opened. You may minimize it to system tray." -ForegroundColor DarkGray
