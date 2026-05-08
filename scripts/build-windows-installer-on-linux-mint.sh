#!/usr/bin/env bash
set -euo pipefail

# Build Windows artifacts from Linux Mint using electron-builder's Windows targets.
# This generally requires Node.js/npm, Wine, and internet access for the first dependency download.
# Recommended local setup:
#   sudo apt update
#   sudo apt install -y nodejs npm wine64
# Then from the repository root:
#   ./scripts/build-windows-installer-on-linux-mint.sh

if [[ ! -f package.json ]]; then
  echo "Run this script from the Spectreverse Simulator Deck repository root." >&2
  exit 1
fi

npm ci
npm run check
npm run desktop:build:win

echo "Done. Built artifacts are in ./dist"
ls -lh dist || true
