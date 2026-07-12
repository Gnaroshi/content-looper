import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";

export const recentSessionInputSchema = z.object({
  sessions: z.array(z.object({
    sessionId: z.string().regex(/^session_[a-f0-9]{24}$/),
    provider: z.enum(["youtube", "x", "tiktok"]),
    updatedAt: z.number().int().nonnegative(),
    loopMode: z.enum(["full", "segment"]),
  }).strict()).max(30),
}).strict();

export function integrationStatePath(): string {
  const override = process.env.CONTENTDECK_STATE_DIR;
  const directory = override && isAbsolute(override) ? override : join(homedir(), ".contentdeck");
  return join(directory, "integration-sessions-v1.json");
}

export async function writeRecentSessionMirror(input: z.infer<typeof recentSessionInputSchema>): Promise<void> {
  const path = integrationStatePath();
  const temporaryPath = `${path}.${process.pid}.tmp`;
  const document = {
    schemaVersion: 1,
    providerId: "content-looper",
    generatedAt: new Date().toISOString(),
    sessions: input.sessions
      .map((session) => ({
        ...session,
        updatedAt: new Date(session.updatedAt).toISOString(),
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}
