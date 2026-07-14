const { URL } = require("node:url");

const sessionIdPattern = /^session_[a-f0-9]{24}$/;
const mediaIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function parseContentDeckDeepLink(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "contentdeck:" || url.username || url.password || url.port) return null;

  if (url.hostname === "open" && (url.pathname === "" || url.pathname === "/")) {
    const mediaUrl = url.searchParams.get("url");
    return mediaUrl && isSupportedMediaHttpsUrl(mediaUrl) ? { kind: "open", url: mediaUrl } : null;
  }

  if (url.hostname === "session" && url.search === "") {
    const sessionId = decodeURIComponent(url.pathname.replace(/^\//, ""));
    return sessionIdPattern.test(sessionId) ? { kind: "session", sessionId } : null;
  }

  return null;
}

function isSupportedMediaHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be" || host === "www.youtu.be") {
    return mediaIdPattern.test(url.pathname.split("/").filter(Boolean)[0] || "");
  }
  if (isHost(host, "youtube.com") || isHost(host, "youtube-nocookie.com")) {
    const pathId = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    return mediaIdPattern.test(url.searchParams.get("v") || pathId || "");
  }
  if (["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) {
    return /\/status(?:es)?\/\d+/.test(url.pathname);
  }
  if (isHost(host, "tiktok.com")) {
    return /\/video\/\d+/.test(url.pathname) || (["vm.tiktok.com", "vt.tiktok.com"].includes(host) && url.pathname !== "/");
  }
  return false;
}

function isHost(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

module.exports = { parseContentDeckDeepLink };
