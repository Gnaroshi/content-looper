const { app, BrowserWindow, shell } = require("electron");
const { randomBytes } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const {
  isSafeDevelopmentServerUrl,
  isSafeExternalHttpsUrl,
  isSameRendererDocument,
} = require("./security.cjs");

const developmentServerUrl = process.env.CONTENTDECK_ELECTRON_DEV_SERVER_URL || "";
const isDev = Boolean(developmentServerUrl);
if (isDev && !isSafeDevelopmentServerUrl(developmentServerUrl)) {
  throw new Error("CONTENTDECK_ELECTRON_DEV_SERVER_URL must be a supported loopback Vite URL.");
}
const apiPort = process.env.CONTENTDECK_API_PORT || (isDev ? "8787" : "18787");
const apiToken = isDev ? "" : randomBytes(32).toString("hex");
let mainWindow = null;

async function startBundledApi() {
  if (isDev) return `http://127.0.0.1:${apiPort}`;

  process.env.CONTENTDECK_API_PORT = apiPort;
  process.env.CONTENTDECK_API_PORT_FALLBACK = "1";
  process.env.CONTENTDECK_API_TOKEN = apiToken;
  const serverPath = path.join(__dirname, "..", "dist-server", "server", "index.js");
  const serverModule = await import(pathToFileURL(serverPath).href);
  return serverModule.apiBase || `http://127.0.0.1:${apiPort}`;
}

function createWindow(apiBase) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 960,
    minHeight: 720,
    backgroundColor: "#101314",
    title: "ContentDeck",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (apiToken) {
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: [`${apiBase.replace(/\/$/, "")}/*`] },
      (details, callback) => {
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            Authorization: `Bearer ${apiToken}`,
          },
        });
      },
    );
  }

  if (isDev) {
    void mainWindow.loadURL(developmentServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: {
        apiBase,
      },
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalHttpsUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isSameRendererDocument(url, mainWindow.webContents.getURL())) return;
    event.preventDefault();
    if (isSafeExternalHttpsUrl(url)) {
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  let apiBase = `http://127.0.0.1:${apiPort}`;

  try {
    apiBase = await startBundledApi();
  } catch (error) {
    console.error("Failed to start bundled API", error);
  }

  createWindow(apiBase);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(apiBase);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
