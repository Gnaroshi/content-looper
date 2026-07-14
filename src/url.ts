import { z } from "zod";
import type { VideoSource } from "./types.js";

const urlSchema = z.string().trim().max(2_048).url();
const mediaIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function isExactHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function parseVideoUrl(value: string): VideoSource | null {
  const result = urlSchema.safeParse(value);
  if (!result.success) return null;

  const url = new URL(result.data);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (host === "youtu.be" || host === "www.youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    return isMediaId(videoId) ? buildYouTubeSource(videoId, url) : null;
  }

  if (isExactHostOrSubdomain(host, "youtube.com") || isExactHostOrSubdomain(host, "youtube-nocookie.com")) {
    const videoId = parseYouTubeId(url);
    return videoId ? buildYouTubeSource(videoId, url) : null;
  }

  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
    const statusId = url.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];
    return statusId
      ? {
          platform: "x",
          label: "X",
          statusId,
          href: `https://twitter.com/i/status/${statusId}`,
        }
      : null;
  }

  if (isExactHostOrSubdomain(host, "tiktok.com")) {
    const videoId = url.pathname.match(/\/video\/(\d+)/)?.[1] ?? "";
    const isShortRedirect = (host === "vm.tiktok.com" || host === "vt.tiktok.com") && url.pathname !== "/";
    if (!videoId && !isShortRedirect) return null;
    return {
      platform: "tiktok",
      label: "TikTok",
      videoId,
      href: url.href,
    };
  }

  return null;
}

export function isSupportedMediaUrl(value: string): boolean {
  return parseVideoUrl(value) !== null;
}

function buildYouTubeSource(videoId: string, url: URL): VideoSource {
  return {
    platform: "youtube",
    label: "YouTube",
    href: url.href,
    videoId,
    startSeconds: parseYouTubeStart(url),
  };
}

function parseYouTubeId(url: URL): string | null {
  const fromQuery = url.searchParams.get("v");
  if (isMediaId(fromQuery)) return fromQuery;

  const parts = url.pathname.split("/").filter(Boolean);
  const videoIndex = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
  if (videoIndex >= 0 && isMediaId(parts[videoIndex + 1])) {
    return parts[videoIndex + 1];
  }

  return null;
}

function isMediaId(value: string | null | undefined): value is string {
  return Boolean(value && mediaIdPattern.test(value));
}

function parseYouTubeStart(url: URL): number {
  const value = url.searchParams.get("t") ?? url.searchParams.get("start") ?? "";
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (!match) return 0;

  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}
