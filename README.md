# Spectreverse Simulator Deck v1.5.8 Autonomy/Nesting

A static, GitHub Pages-compatible browser simulator deck. It loads a seed world and atlas, runs a mutable local engine in a Web Worker, renders through WebGL2, persists saves in IndexedDB, exports/imports `.spectreverse.json`, studies foreign saves as memory objects, exports/imports Living Word learning bundles, and now includes a bounded auto-governor plus nested-phenomena memory indexing.

## Run locally

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/
```

Do not rely on double-clicking `index.html`; the deck uses ES modules, `fetch()`, a module Worker, IndexedDB, and a service worker, all of which expect HTTP/HTTPS serving. GitHub Pages is the intended hosting target.


## Windows desktop installer

This package includes an Electron desktop shell and Windows installer configuration. The desktop build runs the same simulator files through a private local server so ES modules, workers, `fetch()`, IndexedDB, service worker behavior, and WebGL stay aligned with the GitHub Pages/browser version.

Build on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1
```

Build from Linux Mint Cinnamon 22:

```bash
./scripts/build-windows-installer-on-linux-mint.sh
```

Or push to GitHub and run the included workflow:

```text
Actions → Build Windows Installer → Run workflow
```

Outputs appear in `dist/` as an NSIS installer plus a portable EXE. See `WINDOWS_INSTALLER_BUILD.md` for details.

## v1.5.8 systems

- Browser QA diagnostics for WebGL2, IndexedDB, module Workers, service workers, Cache API, File API, and storage quota.
- Visual debug overlay for witness hotspots, candidate routes, committed paths, survival pressure, objective profile, population status, and performance tier.
- Replay verifier for full hash-chain verification and partial retained-tail validation.
- Deeper Save Garden / Corpus Compare readouts: best worlds, motif transfer, operator overlap, compatibility, closure/risk summaries.
- Formal Living Word packet schema and normalization for upgrade packets and memory bundles.
- Persistent child-world records from population archetypes so high-performing forks can be saved/exported as future seeds.
- Adaptive performance tiering using frame-rate samples, tab visibility, and browser headroom hints.
- Offline/PWA shell via `manifest.webmanifest` and `service_worker.js`.


- Raised live structure policy: 1200 soft cap / 1500 hard cap, with compact exports preserving up to 1500 live structures.
- Safe `auto` brain mode via `AutonomyGovernor`, choosing bounded active modes without using unsafe override.
- Nested phenomena index for virtual structures-within-structures, stored in `world.runtime.memoryEcology.nestedPhenomena`.
- UI readout for active auto mode and nested phenomena.

## Existing core systems

- Browser-native worker engine
- Witness attribution and cause buffers
- Candidate brain and shadow testing
- Dream/search mode
- Lineage, event journal, and operator fitness
- Sleep/distill memory ecology
- Save garden and import-as-memory quarantine
- Corpus comparison and Living Word bundle export
- Deterministic replay proof hash chain
- Survival manager for queue/structure/memory pressure
- Benchmark ledger for useful structure per compute
- Genome index for recurring and portable motifs
- Objective profiles: balanced, stability, novelty, closure, living word, portability, compression
- Population mode with child search archetypes
- Living Word packet import through quarantine

## Runtime model

```text
observe → attribute → propose → shadow-test → score → commit/reject → distill → save
```

v1.5.8 adds:

```text
QA → debug overlay → adaptive tier → replay verify → persistent forks → Living Word round-trip schema → auto-governor → nested phenomena memory
```

The deck remains lightweight: no backend, no build step, no dependencies, and well under GitHub Pages repository limits.

## Notes

- WebGL2 is required for the visualizer.
- IndexedDB saves live in the browser, not GitHub.
- Service worker caching works after the app has been served over `localhost` or HTTPS.
- The browser deck is the embodied local organism; Living Word bundles and packets are corpus-level learning artifacts.
