const { URL } = require("node:url");

function parseBoundedUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSafeExternalHttpsUrl(value) {
  const url = parseBoundedUrl(value);
  return Boolean(
    url &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443"),
  );
}

function isSafeDevelopmentServerUrl(value) {
  const url = parseBoundedUrl(value);
  return Boolean(
    url &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      (url.port === "5173" || url.port === "4173") &&
      !url.username &&
      !url.password,
  );
}

function isSameRendererDocument(target, current) {
  const targetUrl = parseBoundedUrl(target);
  const currentUrl = parseBoundedUrl(current);
  if (!targetUrl || !currentUrl) return false;
  targetUrl.hash = "";
  currentUrl.hash = "";
  return targetUrl.href === currentUrl.href;
}

module.exports = {
  isSafeDevelopmentServerUrl,
  isSafeExternalHttpsUrl,
  isSameRendererDocument,
};
