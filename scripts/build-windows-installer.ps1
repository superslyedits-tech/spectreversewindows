# Build the Spectreverse Windows installer and portable EXE.
# Run from the repository root in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1

$ErrorActionPreference = "Stop"

if (-not (Test-Path "package.json")) {
  throw "Run this script from the Spectreverse Simulator Deck repository root."
}

Write-Host "Installing locked Electron build dependencies..."
npm ci

Write-Host "Checking simulator JavaScript syntax..."
npm run check

Write-Host "Building Windows NSIS installer and portable executable..."
npm run desktop:build:win

Write-Host "Done. Built artifacts are in .\dist"
Get-ChildItem .\dist -File | Select-Object Name, Length, LastWriteTime
