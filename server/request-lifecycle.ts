import type { EventEmitter } from "node:events";

type CloseEmitter = Pick<EventEmitter, "once" | "removeListener">;

type ActiveRequest = {
  controller: AbortController;
  emitter: CloseEmitter;
  onClose: () => void;
};

export class RequestCancellationRegistry {
  private readonly requests = new Map<string, ActiveRequest>();

  get size(): number {
    return this.requests.size;
  }

  begin(requestId: string, emitter: CloseEmitter, isResponseSent: () => boolean): AbortSignal {
    this.finish(requestId);
    const controller = new AbortController();
    const onClose = () => this.release(requestId, !isResponseSent());
    this.requests.set(requestId, { controller, emitter, onClose });
    emitter.once("close", onClose);
    return controller.signal;
  }

  signal(requestId: string): AbortSignal {
    return this.requests.get(requestId)?.controller.signal ?? AbortSignal.abort();
  }

  finish(requestId: string): void {
    this.release(requestId, false);
  }

  abortAll(): void {
    for (const requestId of [...this.requests.keys()]) this.release(requestId, true);
  }

  private release(requestId: string, abort: boolean): void {
    const request = this.requests.get(requestId);
    if (!request) return;
    if (abort) request.controller.abort();
    request.emitter.removeListener("close", request.onClose);
    this.requests.delete(requestId);
  }
}
