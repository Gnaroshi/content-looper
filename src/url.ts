import { z } from "zod";
import type { VideoSource } from "./types";

const urlSchema = z.string().trim().url();

export function parseVideoUrl(value: string): VideoSource | null {
  const result = urlSchema.safeParse(value);
  if (!result.success) return null;

  const url = new URL(result.data);
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    return videoId ? buildYouTubeSource(videoId, url) : null;
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
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

  if (host.endsWith("tiktok.com")) {
    const videoId = url.pathname.match(/\/video\/(\d+)/)?.[1] ?? "";
    return {
      platform: "tiktok",
      label: "TikTok",
      videoId,
      href: url.href,
    };
  }

  return null;
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
  if (fromQuery) return fromQuery;

  const parts = url.pathname.split("/").filter(Boolean);
  const videoIndex = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
  if (videoIndex >= 0 && parts[videoIndex + 1]) {
    return parts[videoIndex + 1];
  }

  return null;
}

function parseYouTubeStart(url: URL): number {
  const value = url.searchParams.get("t") ?? url.searchParams.get("start") ?? "";
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (!match) return 0;

  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}
