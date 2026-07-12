import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTime, parseTime } from "../src/time";

describe("ContentDeck loop timing baseline", () => {
  it("parses seconds, minute segments, and hour segments", () => {
    assert.equal(parseTime("42"), 42);
    assert.equal(parseTime("01:30"), 90);
    assert.equal(parseTime("1:02:03"), 3723);
  });

  it("preserves the current invalid and empty timing behavior", () => {
    assert.equal(parseTime(""), 0);
    assert.equal(parseTime("-1"), -1);
    assert.equal(parseTime("1:two"), -1);
    assert.equal(parseTime("1:2:3:4"), -1);
  });

  it("formats full-loop and segment-loop positions consistently", () => {
    assert.equal(formatTime(0), "00:00");
    assert.equal(formatTime(90.9), "01:30");
    assert.equal(formatTime(3723), "1:02:03");
    assert.equal(formatTime(-5), "00:00");
  });
});
