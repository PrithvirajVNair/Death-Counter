@echo off
title Souls Death Counter
cd /d "%~dp0"

echo Unblocking files to prevent Windows SmartScreen warnings...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0*' | Unblock-File -ErrorAction SilentlyContinue"

echo Starting Souls Death Counter Companion App...
start "" "%~dp0DeathCounterHotkeys.exe"
