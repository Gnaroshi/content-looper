const { app, BrowserWindow, shell } = require("electron");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const isDev = Boolean(process.env.CONTENTDECK_ELECTRON_DEV_SERVER_URL);
const apiPort = process.env.CONTENTDECK_API_PORT || (isDev ? "8787" : "18787");
let mainWindow = null;

async function startBundledApi() {
  if (isDev) return `http://127.0.0.1:${apiPort}`;

  process.env.CONTENTDECK_API_PORT = apiPort;
  process.env.CONTENTDECK_API_PORT_FALLBACK = "1";
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

  if (isDev) {
    void mainWindow.loadURL(process.env.CONTENTDECK_ELECTRON_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: {
        apiBase,
      },
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
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
