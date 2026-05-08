const CACHE_NAME = 'spectreverse-deck-v1-5-8-autonomy-nesting';
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./runtime_config.json",
  "./manifest.webmanifest",
  "./data/seed_world.json",
  "./data/seed_atlas.json",
  "./src/app.js",
  "./src/asymptotic_float.js",
  "./src/growth_manager.js",
  "./src/spectral_roles.js",
  "./src/spectral_overlay.js",
  "./src/spectral_attention.js",
  "./src/color_spaces.js",
  "./src/spectral_genome.js",
  "./src/spectral_witness.js",
  "./src/perceptual_spectrum.js",
  "./src/spectral_candidate_brain.js",
  "./src/anti_clone_pressure.js",
  "./src/metatile_grammar.js",
  "./src/frontier_sampler.js",
  "./src/stagnation_detector.js",
  "./src/structure_archive.js",
  "./src/world_structures.js",
  "./src/nested_phenomena.js",
  "./src/autonomy_governor.js",
  "./src/benchmark_ledger.js",
  "./src/browser_qa.js",
  "./src/performance_tier.js",
  "./src/visual_debug.js",
  "./src/replay_verifier.js",
  "./src/livingword_schema.js",
  "./src/persistent_children.js",
  "./src/candidate_brain.js",
  "./src/candidate_pool.js",
  "./src/corpus_compare.js",
  "./src/cross_pollination.js",
  "./src/deck_ui.js",
  "./src/dream_search.js",
  "./src/engine.worker.js",
  "./src/engine_core.js",
  "./src/genome_index.js",
  "./src/gl.js",
  "./src/import_export.js",
  "./src/journal.js",
  "./src/lattice_brain.js",
  "./src/lattice_transformer_layer.js",
  "./src/leech_guard.js",
  "./src/lineage.js",
  "./src/livingword_bundle.js",
  "./src/livingword_packet.js",
  "./src/objective_profiles.js",
  "./src/operator_fitness.js",
  "./src/population_manager.js",
  "./src/prng.js",
  "./src/replay.js",
  "./src/runtime_config.js",
  "./src/save_garden.js",
  "./src/schema.js",
  "./src/shaders.js",
  "./src/sleep_distill.js",
  "./src/smart_governor.js",
  "./src/storage.js",
  "./src/survival_manager.js",
  "./src/witness_eye.js",
  "./src/world.js",
  "./src/world_store.js"
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
    return response;
  }).catch(() => caches.match('./index.html'))));
});
