# Windows Installer Build Notes

This deck is now configured as an Electron desktop app with two Windows outputs:

1. **NSIS installer**: installs into a normal Windows application folder and creates shortcuts.
2. **Portable EXE**: runs as a single portable executable without a full install.

The simulator itself remains the same browser-native program. The desktop version wraps the same `index.html`, `src/`, `data/`, service worker, IndexedDB save system, autonomy governor, nested phenomena memory, and WebGL visualizer inside Electron.

## What gets built

After a successful Windows build, check `dist/` for files like:

```text
Spectreverse Simulator Deck-1.5.8-win-installer-win-x64.exe
Spectreverse Simulator Deck-1.5.8-win-installer-portable-x64.exe
```

The exact filenames may vary slightly by electron-builder.

## Build on Windows

Install Node.js LTS, then run PowerShell from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1
```

Or run the commands manually:

```powershell
npm ci
npm run check
npm run desktop:build:win
```

## Build from Linux Mint Cinnamon 22

Install Node.js/npm and Wine, then run:

```bash
sudo apt update
sudo apt install -y nodejs npm wine64
./scripts/build-windows-installer-on-linux-mint.sh
```

A Windows runner is still cleaner for release builds. The included GitHub Actions workflow builds on `windows-latest`, uploads the installer artifacts, and avoids local Wine weirdness.

## Build on GitHub Actions

Push the repository to GitHub, then open:

```text
Actions → Build Windows Installer → Run workflow
```

When it finishes, download the uploaded artifact named:

```text
spectreverse-windows-installer
```

That artifact contains the installer and portable EXE from `dist/`.

## Runtime behavior

The desktop app starts a private local server on `127.0.0.1`. It prefers port `3210`, but falls back to a random free local port if needed. This keeps ES modules, workers, IndexedDB, `fetch()`, service worker behavior, and WebGL close to the GitHub Pages/browser version.

The Electron shell uses:

- isolated renderer context
- no Node integration in the simulator page
- sandboxed renderer
- single-instance lock
- denied runtime permission prompts
- 8 GB V8 heap ceiling for long simulator runs

## Code signing note

These builds are unsigned. Windows SmartScreen may warn on first launch. For public distribution, get a Windows code-signing certificate and configure signing in `electron-builder` later.
