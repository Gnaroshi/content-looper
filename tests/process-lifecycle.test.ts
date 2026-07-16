import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ManagedProcessRunner } from "../server/process-lifecycle";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPid(path: string): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      return Number((await readFile(path, "utf8")).trim());
    } catch {
      await wait(10);
    }
  }
  throw new Error("descendant PID was not recorded");
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function descendantFixture(): Promise<{ fixture: string; pidFile: string }> {
  const root = await mkdtemp(join(tmpdir(), "contentdeck-process-"));
  const pidFile = join(root, "descendant.pid");
  const fixture = join(root, "spawn-descendant.mjs");
  await writeFile(
    fixture,
    [
      'import { spawn } from "node:child_process";',
      'import { writeFileSync } from "node:fs";',
      'const child = spawn("/bin/sleep", ["60"], { stdio: "ignore" });',
      `writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      'await new Promise((resolve) => child.once("exit", resolve));',
    ].join("\n"),
  );
  return { fixture, pidFile };
}

async function expectProcessGone(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (processExists(pid) && Date.now() < deadline) await wait(10);
  assert.equal(processExists(pid), false);
}

describe("ContentDeck managed process lifecycle", () => {
  it("terminates a resolver process and its descendants during shutdown", { skip: process.platform === "win32" }, async () => {
    const { fixture, pidFile } = await descendantFixture();

    const runner = new ManagedProcessRunner();
    const running = runner.execFile(process.execPath, [fixture]);
    const descendant = await waitForPid(pidFile);
    assert.equal(processExists(descendant), true);
    assert.equal(runner.activeProcessCount, 1);

    const rejected = assert.rejects(running);
    await runner.shutdown();
    await rejected;
    await expectProcessGone(descendant);
    assert.equal(runner.activeProcessCount, 0);
  });

  it("propagates request cancellation to the complete process group", { skip: process.platform === "win32" }, async () => {
    const { fixture, pidFile } = await descendantFixture();
    const runner = new ManagedProcessRunner();
    const controller = new AbortController();
    const running = runner.execFile(process.execPath, [fixture], { signal: controller.signal });
    const rejected = assert.rejects(running, { name: "AbortError" });
    const descendant = await waitForPid(pidFile);

    controller.abort();
    await rejected;
    await expectProcessGone(descendant);
    assert.equal(runner.activeProcessCount, 0);
    await runner.shutdown();
  });
});
