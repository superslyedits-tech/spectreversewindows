const { app, BrowserWindow, session } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PREFERRED_PORT = 3210;
const PROJECT_ROOT = path.resolve(__dirname, "..");
const EIGHT_GB_MB = 8192;

// Raise V8 heap ceiling for long simulator runs. The deck still self-throttles
// through its performance tier and survival manager; this only prevents avoidable
// desktop memory ceiling failures during large structure ecologies.
app.commandLine.appendSwitch("js-flags", `--max-old-space-size=${EIGHT_GB_MB}`);
app.setAppUserModelId("com.spectreverse.simulatordeck");

let mainWindow = null;
let localServer = null;
let localPort = PREFERRED_PORT;

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".webmanifest") return "application/manifest+json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".wasm") return "application/wasm";
  return "application/octet-stream";
}

function resolveRequestPath(reqUrl) {
  const safeUrlPath = decodeURIComponent((reqUrl || "/").split("?")[0]).replace(/^\/+/, "");
  const requestedPath = safeUrlPath || "index.html";
  let filePath = path.resolve(PROJECT_ROOT, requestedPath);

  if (!filePath.startsWith(PROJECT_ROOT)) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  return filePath;
}

function createStaticServer() {
  return http.createServer((req, res) => {
    const filePath = resolveRequestPath(req.url);
    if (!filePath) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentTypeFor(filePath),
        "Cache-Control": "no-store"
      });
      res.end(data);
    });
  });
}

function listenOn(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once("error", onError);
    server.listen(port, HOST, () => {
      server.off("error", onError);
      resolve(server.address().port);
    });
  });
}

async function startStaticServer() {
  localServer = createStaticServer();
  try {
    localPort = await listenOn(localServer, PREFERRED_PORT);
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      localServer = createStaticServer();
      localPort = await listenOn(localServer, 0);
    } else {
      throw err;
    }
  }
  return localPort;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#0b0f16",
    icon: path.join(PROJECT_ROOT, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.loadURL(`http://${HOST}:${localPort}/`);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    await startStaticServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});
