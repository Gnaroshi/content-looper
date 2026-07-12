const { app, BrowserWindow, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { randomBytes } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { parseContentDeckDeepLink } = require("./deep-link.cjs");
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
let pendingOpenRequest = process.argv.map(parseContentDeckDeepLink).find(Boolean) || null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  receiveDeepLink(url);
});

app.on("second-instance", (_event, argv) => {
  const url = argv.find((argument) => argument.startsWith("contentdeck://"));
  if (url) receiveDeepLink(url);
  mainWindow?.show();
  mainWindow?.focus();
});

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
    minWidth: 760,
    minHeight: 600,
    backgroundColor: "#101314",
    title: "ContentDeck",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
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

  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingOpenRequest) {
      mainWindow.webContents.send("contentdeck:open-request", pendingOpenRequest);
      pendingOpenRequest = null;
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient("contentdeck", process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient("contentdeck");
  }
  let apiBase = `http://127.0.0.1:${apiPort}`;

  try {
    apiBase = await startBundledApi();
  } catch (error) {
    console.error("Failed to start bundled API", error);
  }

  createWindow(apiBase);
  configureUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(apiBase);
    }
  });
});

function configureUpdates() {
  if (!app.isPackaged || isDev) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", async (info) => {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "ContentDeck update available",
      message: `ContentDeck ${info.version} is available.`,
      detail: "Download the signed GitHub release now? Playback remains available while the update downloads.",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) void autoUpdater.downloadUpdate();
  });
  autoUpdater.on("update-downloaded", async () => {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "ContentDeck update ready",
      message: "The signed update is ready to install.",
      detail: "Restart ContentDeck now or install it when the app quits.",
      buttons: ["Restart and install", "Install on quit"],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", () => {
    // Update availability is degraded independently from playback health.
  });
  setTimeout(() => void autoUpdater.checkForUpdates(), 5_000);
}

function receiveDeepLink(value) {
  const request = parseContentDeckDeepLink(value);
  if (!request) return;
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send("contentdeck:open-request", request);
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  pendingOpenRequest = request;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
