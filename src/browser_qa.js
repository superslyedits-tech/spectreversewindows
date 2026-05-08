export async function runBrowserQa({ gl = null, workerUrl = './src/engine.worker.js' } = {}) {
  const startedAt = performance.now?.() || Date.now();
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail || '') });

  add('secure context', location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1', location.protocol);
  add('ES modules', true, 'booted as module');
  add('WebGL2', Boolean(gl), gl ? gl.getParameter(gl.VERSION) : 'missing');
  add('IndexedDB', 'indexedDB' in globalThis, 'browser-local saves');
  add('ServiceWorker', 'serviceWorker' in navigator, navigator.serviceWorker?.controller ? 'controlled' : 'available');
  add('Cache API', 'caches' in globalThis, 'offline runtime cache');
  add('File API', 'FileReader' in globalThis && 'Blob' in globalThis, 'import/export');
  add('Performance API', 'performance' in globalThis, 'benchmark hooks');
  add('Storage estimate', Boolean(navigator.storage?.estimate), 'quota/memory pressure');
  add('Visibility API', typeof document.visibilityState === 'string', document.visibilityState || 'unknown');

  let storage = null;
  try {
    storage = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    if (storage) add('Storage quota', true, `${formatBytes(storage.usage || 0)} / ${formatBytes(storage.quota || 0)}`);
  } catch (error) {
    add('Storage quota', false, error.message || String(error));
  }

  let workerOk = false;
  try {
    const url = new URL(workerUrl, location.href);
    const testWorker = new Worker(url, { type: 'module' });
    testWorker.terminate();
    workerOk = true;
  } catch (error) {
    add('Module Worker', false, error.message || String(error));
  }
  if (workerOk) add('Module Worker', true, 'constructible');

  const webglInfo = gl ? safeWebglInfo(gl) : {};
  const passed = checks.filter(x => x.ok).length;
  const failed = checks.length - passed;
  return {
    schema: 'spectreverse-browser-qa-v1',
    checkedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now?.() || Date.now()) - startedAt),
    passed,
    failed,
    status: failed ? 'degraded' : 'ready',
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    visibility: document.visibilityState,
    storage,
    webgl: webglInfo,
    checks
  };
}

export function summarizeBrowserQa(report = null) {
  if (!report) return [];
  const rows = [
    ['status', report.status || 'unknown'],
    ['passed', `${report.passed || 0}/${(report.checks || []).length}`],
    ['network', report.online ? 'online' : 'offline'],
    ['visibility', report.visibility || 'unknown']
  ];
  if (report.storage?.quota) rows.push(['quota', `${formatBytes(report.storage.usage || 0)} / ${formatBytes(report.storage.quota || 0)}`]);
  for (const check of (report.checks || []).filter(c => !c.ok).slice(0, 4)) rows.push([check.name, `fail: ${check.detail}`]);
  return rows.map(([k, v]) => ({ k, v }));
}

function safeWebglInfo(gl) {
  try {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS)
    };
  } catch {
    return {};
  }
}

function formatBytes(bytes = 0) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes) || 0;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
