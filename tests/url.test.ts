import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVideoUrl } from "../src/url";

describe("ContentDeck provider detection baseline", () => {
  it("recognizes the documented YouTube URL shapes", () => {
    const fixtures = [
      ["https://www.youtube.com/watch?v=abc_DEF-123&t=1m2s", "abc_DEF-123", 62],
      ["https://youtu.be/abc_DEF-123?t=75", "abc_DEF-123", 75],
      ["https://www.youtube.com/shorts/abc_DEF-123", "abc_DEF-123", 0],
      ["https://www.youtube.com/embed/abc_DEF-123?start=12", "abc_DEF-123", 12],
      ["https://www.youtube.com/live/abc_DEF-123", "abc_DEF-123", 0],
    ] as const;

    for (const [url, videoId, startSeconds] of fixtures) {
      assert.deepEqual(parseVideoUrl(url), {
        platform: "youtube",
        label: "YouTube",
        href: url,
        videoId,
        startSeconds,
      });
    }
  });

  it("normalizes X and Twitter status URLs to one provider identity", () => {
    for (const url of [
      "https://x.com/example/status/1234567890",
      "https://twitter.com/example/status/1234567890",
      "https://mobile.twitter.com/example/statuses/1234567890",
    ]) {
      assert.deepEqual(parseVideoUrl(url), {
        platform: "x",
        label: "X",
        statusId: "1234567890",
        href: "https://twitter.com/i/status/1234567890",
      });
    }
  });

  it("recognizes TikTok video and short redirect URLs", () => {
    assert.deepEqual(parseVideoUrl("https://www.tiktok.com/@example/video/9876543210"), {
      platform: "tiktok",
      label: "TikTok",
      videoId: "9876543210",
      href: "https://www.tiktok.com/@example/video/9876543210",
    });
    for (const url of ["https://vm.tiktok.com/example/", "https://vt.tiktok.com/example/"]) {
      assert.equal(parseVideoUrl(url)?.platform, "tiktok");
    }
  });

  it("rejects malformed and unsupported provider URLs", () => {
    for (const value of ["", "not a URL", "https://example.com/video", "https://x.com/example", "https://youtube.com/watch"]) {
      assert.equal(parseVideoUrl(value), null);
    }
  });
});
