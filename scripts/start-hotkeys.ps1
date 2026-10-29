# Souls Game Death Counter — Desktop Hotkey App Launcher
# Listens for F8 (+1 Death) and F7 (Undo) globally across Windows (in-game & outside browser)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $PSScriptRoot "DeathCounterHotkeys.exe"
$cs = Join-Path $PSScriptRoot "HotkeyListenerApp.cs"
$ico = Join-Path $PSScriptRoot "app.ico"

if (-not (Test-Path $exe)) {
    Write-Host "Compiling Death Counter Hotkeys desktop app..." -ForegroundColor Cyan
    & "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /target:winexe /win32icon:$ico /out:$exe $cs
}

# Check if already running
$existing = Get-Process -Name "DeathCounterHotkeys" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[OK] Hotkey app is already running (PID: $($existing.Id))" -ForegroundColor Green
} else {
    Start-Process -FilePath $exe
    Write-Host "[OK] Hotkey app launched!" -ForegroundColor Green
}

Write-Host "Keys configured:" -ForegroundColor Yellow
Write-Host "  [F8] -> +1 Death (updates OBS overlay instantly)" -ForegroundColor Gray
Write-Host "  [F7] -> Undo Death" -ForegroundColor Gray
Write-Host "Click the big green button inside the app to toggle hotkeys." -ForegroundColor Cyan
