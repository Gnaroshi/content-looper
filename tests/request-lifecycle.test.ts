import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { RequestCancellationRegistry } from "../server/request-lifecycle";

describe("ContentDeck request lifecycle", () => {
  it("releases every successful keep-alive request immediately", () => {
    const registry = new RequestCancellationRegistry();
    const socket = new EventEmitter();

    for (let index = 0; index < 100; index += 1) {
      const requestId = `request-${index}`;
      registry.begin(requestId, socket, () => true);
      registry.finish(requestId);
    }

    assert.equal(registry.size, 0);
    assert.equal(socket.listenerCount("close"), 0);
  });

  it("aborts an unfinished request when its connection closes", () => {
    const registry = new RequestCancellationRegistry();
    const socket = new EventEmitter();
    const signal = registry.begin("request", socket, () => false);

    socket.emit("close");

    assert.equal(signal.aborted, true);
    assert.equal(registry.size, 0);
    assert.equal(socket.listenerCount("close"), 0);
  });
});
