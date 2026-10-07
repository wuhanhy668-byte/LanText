@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-desktop.ps1
if errorlevel 1 (
  pause
  exit /b 1
)
start "" build\desktop\LanText-Desktop.exe
