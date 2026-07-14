const { contextBridge, ipcRenderer } = require("electron");

const callbacks = new Set();
const pending = [];

ipcRenderer.on("contentdeck:open-request", (_event, value) => {
  const request = normalizeRequest(value);
  if (!request) return;
  if (callbacks.size === 0) {
    pending.splice(0, pending.length, request);
    return;
  }
  for (const callback of callbacks) callback(request);
});

contextBridge.exposeInMainWorld("contentDeckIntegration", {
  onOpenRequest(callback) {
    if (typeof callback !== "function") return () => {};
    callbacks.add(callback);
    for (const request of pending.splice(0)) callback(request);
    return () => callbacks.delete(callback);
  },
});

function normalizeRequest(value) {
  if (value?.kind === "open" && typeof value.url === "string") {
    return { kind: "open", url: value.url };
  }
  if (value?.kind === "session" && typeof value.sessionId === "string") {
    return { kind: "session", sessionId: value.sessionId };
  }
  return null;
}
