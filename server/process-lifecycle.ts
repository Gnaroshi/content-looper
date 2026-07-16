import { spawn, type ChildProcess } from "node:child_process";

const gracefulShutdownMs = 250;
const usesProcessGroups = process.platform !== "win32";

type ManagedExecOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  signal?: AbortSignal;
  timeout?: number;
};
type ManagedExecResult = { stderr: string; stdout: string };

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function signalProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    if (usesProcessGroups) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

export class ManagedProcessRunner {
  private readonly children = new Map<ChildProcess, (error: Error) => void>();
  private shuttingDown = false;

  get activeProcessCount(): number {
    return this.children.size;
  }

  execFile = (
    executable: string,
    arguments_: readonly string[],
    options: ManagedExecOptions = {},
  ): Promise<ManagedExecResult> => {
    if (this.shuttingDown) {
      return Promise.reject(new Error("ContentDeck process shutdown is in progress."));
    }

    return new Promise((resolve, reject) => {
      const maxBuffer = options.maxBuffer ?? 1024 * 1024;
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let failure: Error | null = null;
      let forceTimer: NodeJS.Timeout | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;
      const child = spawn(executable, [...arguments_], {
        cwd: options.cwd,
        detached: usesProcessGroups,
        env: options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const terminate = (error: Error) => {
        failure ??= error;
        signalProcess(child, "SIGTERM");
        if (!forceTimer) {
          forceTimer = setTimeout(() => signalProcess(child, "SIGKILL"), gracefulShutdownMs);
          forceTimer.unref();
        }
      };
      this.children.set(child, terminate);

      const collect = (target: Buffer[], value: Buffer, stream: "stdout" | "stderr") => {
        if (stream === "stdout") stdoutBytes += value.length;
        else stderrBytes += value.length;
        if (stdoutBytes > maxBuffer || stderrBytes > maxBuffer) {
          terminate(new Error("ContentDeck process output exceeded the safety limit."));
          return;
        }
        target.push(value);
      };
      child.stdout?.on("data", (value: Buffer) => collect(stdout, value, "stdout"));
      child.stderr?.on("data", (value: Buffer) => collect(stderr, value, "stderr"));

      const onAbort = () => terminate(abortError("ContentDeck process was cancelled."));
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
      if (options.timeout && options.timeout > 0) {
        timeoutTimer = setTimeout(
          () => terminate(new Error("ContentDeck process timed out.")),
          options.timeout,
        );
        timeoutTimer.unref();
      }

      child.once("error", (error) => {
        failure ??= error;
      });

      child.once("exit", (code, signal) => {
        if (code !== 0 && !failure) {
          failure = new Error(
            `ContentDeck process exited with ${code ?? signal ?? "an unknown status"}.`,
          );
        }
        // A fixed provider invocation must not leave a descendant behind after
        // its leader exits, even if that descendant inherited an output pipe.
        signalProcess(child, "SIGKILL");
      });

      child.once("close", () => {
        if (forceTimer) clearTimeout(forceTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        options.signal?.removeEventListener("abort", onAbort);
        this.children.delete(child);
        if (failure) {
          reject(failure);
          return;
        }
        resolve({
          stderr: Buffer.concat(stderr).toString("utf8"),
          stdout: Buffer.concat(stdout).toString("utf8"),
        });
      });

      if (this.shuttingDown) terminate(abortError("ContentDeck process shutdown is in progress."));
    });
  };

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const children = [...this.children.keys()];
    for (const child of children) {
      this.children.get(child)?.(abortError("ContentDeck process stopped during application shutdown."));
    }
    if (children.length === 0) return;

    await new Promise((resolve) => setTimeout(resolve, gracefulShutdownMs));
    for (const child of children) {
      if (this.children.has(child)) signalProcess(child, "SIGKILL");
    }

    await Promise.race([
      Promise.all(children.map((child) => new Promise<void>((resolve) => {
        if (!this.children.has(child)) {
          resolve();
          return;
        }
        child.once("close", () => resolve());
      }))),
      new Promise((resolve) => setTimeout(resolve, gracefulShutdownMs)),
    ]);
  }
}
