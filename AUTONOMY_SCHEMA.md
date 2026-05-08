# Spectreverse Autonomy / Nested-Phenomena Handoff Schema

Patch target: `v1.5.8-autonomy-nesting`

## Current capability

The simulator is now a browser-native evolving memory ecology with:

- live candidate generation from witness hotspots, bridge search, fountain bundles, motion relief, spectral gaps, metatile grammar, frontier sampling, atlas seeds, dream search, and population mutation;
- shadow testing before commit, with leech/cascade safety metrics and objective-profile scoring;
- live / archive / fossil structure memory so pressure retires weak structures instead of deleting them outright;
- genome indexing for recurring motifs and portable structures;
- survival management for queue, memory, witness-risk, and structure pressure;
- deterministic replay proof, benchmark ledger, save garden, corpus comparison, Living Word packet import/export, and persistent child-world records.

In plain terms: it can already observe itself, propose candidate structures, test them, commit useful structures, reject unsafe ones, preserve memory, import/export learned packets, and create forkable child-world seeds.

## New hard-cap policy

Runtime structure capacity is now raised for Linux Mint / 12GB-class machines:

```json
{
  "engine.structureSoftCap": 1200,
  "structurePolicy.liveSoftCap": 1200,
  "structurePolicy.liveHardCap": 1500,
  "structurePolicy.retireBatchSize": 72,
  "compactExport.liveStructureLimit": 1500
}
```

Important distinction:

- **Soft cap 1200**: background compaction gradually retires the weakest live structures into archive.
- **Hard cap 1500**: the live set should not run beyond this ceiling.
- **Compact export cap 1500**: compact saves no longer silently trim live structures down to 512.

## New safe-autonomy layer

File: `src/autonomy_governor.js`

The new `AutonomyGovernor` adds a safe `auto` brain mode. It does not use the unsafe `override` path. Instead, it chooses a bounded active mode from:

```text
learn, dream, population, frontier, morphogenesis, anti_clone, spectral, sleep, distill
```

Decision inputs:

- survival pressure;
- structure pressure;
- byte/storage pressure;
- candidate-queue level;
- stagnation detector output;
- clone ratio / genome delta;
- spectral gap count;
- performance tier.

Decision outputs:

```json
{
  "requestedMode": "auto",
  "activeMode": "frontier | spectral | dream | population | morphogenesis | anti_clone | sleep | distill | learn",
  "objectiveProfile": "balanced | open_world | spectral_morphogenesis | anti_stagnation | compression | novelty | portability | stability",
  "reason": "why this mode was selected",
  "throttle": false
}
```

Operational rule:

- Red memory pressure → `distill` + `compression`.
- Amber structure pressure → `sleep` + `compression`.
- Stagnation + clone dominance → `anti_clone` + `anti_stagnation`.
- Stagnation without clone dominance → `morphogenesis` + `spectral_morphogenesis`.
- Low queue → `frontier` + `open_world`.
- Many spectral gaps → `spectral` + `spectral_morphogenesis`.
- Scheduled refresh → `dream` or `population`.
- Default → `learn`.

The UI now exposes `Brain: auto` and displays `auto→<active mode>` in the status line.

## New nested-phenomena memory layer

File: `src/nested_phenomena.js`

The `NestedPhenomenaIndex` is a non-destructive memory layer that periodically detects structures-within-structures. It builds virtual nested records without directly forcing them into the live structure set.

Inputs:

- live structures;
- node overlap;
- center proximity;
- role/type affinity;
- genome/spectral-genome affinity;
- per-structure quality;
- tile closure/coherence/word/memory vectors.

Outputs are stored in:

```text
world.runtime.memoryEcology.nestedPhenomena
engine.nestedPhenomena
```

Each nested phenomenon contains:

```json
{
  "id": "nest:<tick>:<component ids>",
  "status": "virtual_nested_memory",
  "depth": 1,
  "motif": "nested_bridge_lattice | nested_fountain_bloom | nested_core_bundle | nested_songline_field | nested_structure_cluster",
  "components": ["structure ids"],
  "nodes": ["tile ids"],
  "nestedScore": 0.0,
  "relationScore": 0.0,
  "compression": 0.0,
  "vector": {
    "confidence": 0.0,
    "insideOut": 0.0,
    "word": 0.0,
    "closure": 0.0,
    "coherence": 0.0,
    "memory": 0.0,
    "novelty": 0.0
  }
}
```

This is the missing bridge between raw structure accumulation and true generative autonomy: the system can now memorize not only candidate structures but also higher-order relations among committed structures.

## What is still missing for deeper autonomous evolution

### 1. True replay rebuild, not just replay proof

Current replay verifies the retained hash chain. The next step is a replay runner that rebuilds the world from seed + event log and compares the reconstructed final digest. That turns exports into falsifiable state-transition proofs.

### 2. Child worlds need to become executable fork saves

The deck records persistent child-world candidates. Next, each child should become an actual forkable save slot or exported `.spectreverse.child.json` seed with its own replay proof and objective profile.

### 3. Nested phenomena should promote into controlled superstructures

The new nested layer is intentionally virtual. Next, add a shadow-tested promotion path:

```text
nested virtual memory → candidate superstructure → shadow test → commit as superstructure → archive/fossil if weak
```

This is where “structures within structures” becomes materially generative rather than just descriptive.

### 4. Vector memory needs stable embedding snapshots

The nested vector currently summarizes closure/coherence/word/memory/novelty. Next, emit a persistent embedding ledger:

```text
structure vector → nest vector → world vector → epoch vector
```

Then track deltas across epochs and use those deltas as selection pressure.

### 5. Safe self-modification must remain packet-based

Do not let the deck rewrite its own source code in-browser. Keep self-modification in Living Word packets:

```text
observe failure → propose packet → quarantine → shadow test → user export/import → replay verify
```

That keeps autonomy inspectable and reversible.

### 6. Autonomous benchmarks need promotion gates

Before the system can truly run itself, every autonomous mode should be judged against a promotion gate:

- useful structure per compute;
- nestedScore improvement;
- replay validity;
- memory pressure stability;
- clone ratio reduction;
- portability across save garden imports;
- child-world fitness.

### 7. Multi-worker child populations

Current population mode is lightweight and internal. True autonomy wants multiple worker-isolated child worlds, each with budget limits, replay proof, and quarantine before absorption.

## Recommended next implementation order

1. Run long tests in `auto` mode and confirm memory stays below pressure thresholds.
2. Add nested-phenomena promotion into shadow-tested candidate superstructures.
3. Add executable child-world export/fork action.
4. Build replay-from-seed verifier.
5. Add vector epoch ledger and use vector delta as an objective term.
6. Move heavy search/scoring kernels to Worker fanout or WebGPU only after the gates above are stable.
