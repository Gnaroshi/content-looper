import cors from "@fastify/cors";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Fastify from "fastify";
import { z } from "zod";
import { isSupportedMediaUrl } from "../src/url.js";
import { isAllowedBrowserOrigin, isAuthorizedRequest, safeHttpsUrl } from "./security.js";

const execFileAsync = promisify(execFile);
const port = Number(process.env.CONTENTDECK_API_PORT ?? 8787);
const allowPortFallback = process.env.CONTENTDECK_API_PORT_FALLBACK === "1";
const apiToken = process.env.CONTENTDECK_API_TOKEN ?? "";
const requestSchema = z.object({
  url: z.string().trim().max(2_048).refine(isSupportedMediaUrl),
});
const analyzeSchema = requestSchema.extend({
  sourceLanguage: z.enum(["auto", "en", "ja"]).default("auto"),
});
const hardwareSchema = z.object({
  machine: z.string().default("MacBook Pro 14 M3 Pro"),
  memoryGb: z.number().min(8).max(256).default(18),
  storageGb: z.number().min(64).max(8192).default(1024),
  preferSpeed: z.boolean().default(true),
});
const modelInstallSchema = z.object({
  runtime: z.enum(["ollama", "mlx-whisper"]),
  model: z.string().min(1).max(128).regex(/^[A-Za-z0-9._/-]+(?::[A-Za-z0-9._-]+)?$/),
});
const resolveCache = new Map<string, { expiresAt: number; response: ResolveResponse }>();
const cacheMs = 30_000;
const learningConfigPath = resolve(homedir(), ".contentdeck", "learning-config.json");

type MediaFormat = {
  acodec?: string;
  ext?: string;
  format_id?: string;
  height?: number;
  protocol?: string;
  tbr?: number;
  url?: string;
  vcodec?: string;
};

type MediaInfo = {
  acodec?: string;
  automatic_captions?: Record<string, CaptionTrack[]>;
  duration?: number;
  ext?: string;
  formats?: MediaFormat[];
  id?: string;
  subtitles?: Record<string, CaptionTrack[]>;
  thumbnail?: string;
  title?: string;
  url?: string;
  vcodec?: string;
  webpage_url?: string;
};

type CaptionTrack = {
  ext?: string;
  name?: string;
  url?: string;
};

type ResolveResponse = {
  duration: number;
  mediaUrl: string;
  sourceUrl: string;
  thumbnail: string;
  title: string;
};

type SubtitleLine = {
  end: number;
  ko?: string;
  native?: string;
  start: number;
};

const modelRegistry = [
  {
    id: "mlx-community/whisper-large-v3-turbo",
    runtime: "mlx-whisper",
    role: "자막 생성",
    size: "large",
    fit: "M3 Pro 이상에서 품질 우선",
    install: "python -m pip install -U mlx-whisper && mlx_whisper audio.mp3 --model mlx-community/whisper-large-v3-turbo",
  },
  {
    id: "mlx-community/whisper-medium",
    runtime: "mlx-whisper",
    role: "자막 생성",
    size: "medium",
    fit: "노트북 발열과 속도 균형",
    install: "python -m pip install -U mlx-whisper && mlx_whisper audio.mp3 --model mlx-community/whisper-medium",
  },
  {
    id: "qwen3:8b",
    runtime: "ollama",
    role: "단어/관용구/문장 선택",
    size: "8B",
    fit: "M3 Pro 기본 추천",
    install: "ollama pull qwen3:8b",
  },
  {
    id: "gemma3:12b",
    runtime: "ollama",
    role: "퀴즈 생성",
    size: "12B",
    fit: "저장공간 여유가 있고 품질 우선",
    install: "ollama pull gemma3:12b",
  },
  {
    id: "llama3.2:3b",
    runtime: "ollama",
    role: "빠른 퀴즈 초안",
    size: "3B",
    fit: "저전력/빠른 응답",
    install: "ollama pull llama3.2:3b",
  },
];

const app = Fastify({
  logger: true,
});
const here = fileURLToPath(new URL(".", import.meta.url));

await app.register(cors, {
  origin(origin, callback) {
    callback(null, isAllowedBrowserOrigin(origin, Boolean(apiToken)));
  },
});

app.addHook("onRequest", async (request, reply) => {
  if (!isAuthorizedRequest(request.headers.authorization, apiToken)) {
    return reply.code(401).send({ error: "ContentDeck local API authorization failed." });
  }
});

app.get("/api/health", async () => ({
  ok: true,
  resolverAvailable: Boolean(await findYtDlp().catch(() => null)),
}));

app.post("/api/resolve", async (request, reply) => {
  const body = requestSchema.safeParse(request.body);
  if (!body.success) {
    return reply.code(400).send({ error: "지원 링크 형식이 아닙니다." });
  }

  try {
    const abortController = new AbortController();
    reply.raw.once("close", () => {
      if (!reply.sent) {
        abortController.abort();
      }
    });
    return await resolveMedia(body.data.url, abortController.signal);
  } catch (error) {
    request.log.warn("media resolution failed");
    return reply.code(502).send({ error: formatToolError(error) });
  }
});

app.post("/api/learning/analyze", async (request, reply) => {
  const body = analyzeSchema.safeParse(request.body);
  if (!body.success) {
    return reply.code(400).send({ error: "지원 링크 형식이 아닙니다." });
  }

  try {
    const abortController = new AbortController();
    reply.raw.once("close", () => {
      if (!reply.sent) {
        abortController.abort();
      }
    });
    return await analyzeLearningVideo(body.data.url, body.data.sourceLanguage, abortController.signal);
  } catch (error) {
    request.log.warn("learning analysis failed");
    return reply.code(502).send({ error: formatToolError(error) });
  }
});

app.post("/api/learning/config", async (request, reply) => {
  const body = hardwareSchema.safeParse(request.body);
  if (!body.success) {
    return reply.code(400).send({ error: "하드웨어 설정을 확인하세요." });
  }

  await mkdir(resolve(homedir(), ".contentdeck"), { recursive: true });
  await writeFile(learningConfigPath, JSON.stringify(body.data, null, 2));
  return { ok: true, config: body.data, recommendations: recommendModels(body.data) };
});

app.get("/api/learning/config", async () => {
  const fallback = hardwareSchema.parse({});

  try {
    const stored = JSON.parse(await readFile(learningConfigPath, "utf8")) as unknown;
    const config = hardwareSchema.parse(stored);
    return { config, recommendations: recommendModels(config) };
  } catch {
    return { config: fallback, recommendations: recommendModels(fallback) };
  }
});

app.get("/api/models/registry", async () => ({
  updatedAt: new Date().toISOString(),
  models: modelRegistry,
}));

app.get("/api/models/live", async () => {
  const results = await Promise.all([
    searchHuggingFace("whisper large v3 turbo mlx", "automatic-speech-recognition"),
    searchHuggingFace("qwen3 8b instruct", "text-generation"),
    searchHuggingFace("gemma3 12b", "text-generation"),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    models: results.flat(),
  };
});

app.post("/api/models/install", async (request, reply) => {
  const body = modelInstallSchema.safeParse(request.body);
  if (!body.success) {
    return reply.code(400).send({ error: "모델 설치 설정을 확인하세요." });
  }

  if (body.data.runtime !== "ollama") {
    return {
      ok: false,
      manual: true,
      command: modelRegistry.find((item) => item.id === body.data.model)?.install ?? "",
      message: "이 런타임은 앱에서 직접 설치하기보다 터미널 명령으로 설치하는 쪽이 안정적입니다.",
    };
  }

  if (!modelRegistry.some((item) => item.runtime === "ollama" && item.id === body.data.model)) {
    return reply.code(400).send({ error: "등록된 Ollama 모델만 설치할 수 있습니다." });
  }

  const ollama = await findOptionalBinary(["/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", "ollama"]);
  if (!ollama) {
    return reply.code(404).send({ error: "Ollama를 찾지 못했습니다. 먼저 Ollama를 설치하세요." });
  }

  await execFileAsync(ollama, ["pull", body.data.model], { timeout: 1000 * 60 * 20 });
  return { ok: true, model: body.data.model };
});

async function resolveMedia(url: string, signal: AbortSignal): Promise<ResolveResponse> {
  const now = Date.now();
  const cached = resolveCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.response;
  }

  const info = await extractInfo(url, signal);
  const format = selectPlayableFormat(info);

  if (!format?.url) {
    throw new Error("브라우저 플레이어가 사용할 수 있는 미디어를 찾지 못했습니다.");
  }

  const response = {
    duration: Math.floor(info.duration ?? 0),
    mediaUrl: safeHttpsUrl(format.url),
    sourceUrl: safeHttpsUrl(info.webpage_url) ?? url,
    thumbnail: safeHttpsUrl(info.thumbnail) ?? "",
    title: info.title ?? "Untitled",
  };

  if (!response.mediaUrl) {
    throw new Error("Provider returned an unsafe media URL.");
  }

  resolveCache.set(url, { expiresAt: now + cacheMs, response: response as ResolveResponse });
  return response as ResolveResponse;
}

async function analyzeLearningVideo(url: string, sourceLanguage: "auto" | "en" | "ja", signal: AbortSignal) {
  const info = await extractInfo(url, signal);
  const nativeLang = sourceLanguage === "auto" ? detectBestNativeLanguage(info) : sourceLanguage;
  const nativeTrack = selectCaptionTrack(info, nativeLang);
  const koreanTrack = selectCaptionTrack(info, "ko");
  const nativeCaptions = nativeTrack ? await fetchCaptions(nativeTrack, signal) : [];
  const koreanCaptions = koreanTrack ? await fetchCaptions(koreanTrack, signal) : [];
  const subtitles = mergeCaptions(nativeCaptions, koreanCaptions);
  const nativeText = subtitles.map((item) => item.native).filter(Boolean).join(" ");
  const fallbackVocabulary = extractVocabulary(nativeText, nativeLang);
  const fallbackPhrases = extractPhrases(nativeText, nativeLang);
  const fallbackQuiz = buildQuiz(subtitles, nativeLang);
  const aiItems = await buildLocalAiLearningItems(nativeText, subtitles, nativeLang).catch(() => null);

  return {
    title: info.title ?? "Untitled",
    thumbnail: safeHttpsUrl(info.thumbnail) ?? "",
    sourceLanguage: nativeLang,
    hasKoreanTrack: Boolean(koreanTrack),
    hasNativeTrack: Boolean(nativeTrack),
    subtitles,
    vocabulary: aiItems?.vocabulary?.length ? aiItems.vocabulary : fallbackVocabulary,
    phrases: aiItems?.phrases?.length ? aiItems.phrases : fallbackPhrases,
    sentences: subtitles.filter((item) => item.native && item.native.length > 20).slice(0, 12),
    quiz: aiItems?.quiz?.length ? aiItems.quiz : fallbackQuiz,
    ai: aiItems ? { provider: "ollama", model: aiItems.model } : null,
  };
}

async function extractInfo(url: string, signal: AbortSignal): Promise<MediaInfo> {
  const tool = await findYtDlp();
  const { stdout } = await execFileAsync(
    tool,
    [
      "--dump-single-json",
      "--no-playlist",
      "--no-warnings",
      "--format",
      "best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]/best",
      url,
    ],
    {
      maxBuffer: 1024 * 1024 * 32,
      timeout: 45_000,
      signal,
    },
  );

  return JSON.parse(stdout) as MediaInfo;
}

function detectBestNativeLanguage(info: MediaInfo): "en" | "ja" {
  const captionKeys = new Set([
    ...Object.keys(info.subtitles ?? {}),
    ...Object.keys(info.automatic_captions ?? {}),
  ]);

  if ([...captionKeys].some((key) => key.toLowerCase().startsWith("ja"))) return "ja";
  return "en";
}

function selectCaptionTrack(info: MediaInfo, language: "en" | "ja" | "ko"): CaptionTrack | null {
  const direct = findTrack(info.subtitles, language);
  if (direct) return direct;
  return findTrack(info.automatic_captions, language);
}

function findTrack(collection: MediaInfo["subtitles"], language: "en" | "ja" | "ko"): CaptionTrack | null {
  const entries = Object.entries(collection ?? {});
  const match = entries.find(([key]) => key.toLowerCase() === language || key.toLowerCase().startsWith(`${language}-`));
  const tracks = match?.[1] ?? [];
  return tracks.find((track) => track.ext === "vtt" && track.url) ?? tracks.find((track) => track.url) ?? null;
}

async function fetchCaptions(track: CaptionTrack, signal: AbortSignal): Promise<Array<Omit<SubtitleLine, "ko">>> {
  const captionUrl = safeHttpsUrl(track.url);
  if (!captionUrl) return [];
  const response = await fetch(captionUrl, { signal });
  if (!response.ok) return [];
  return parseVtt(await response.text());
}

function parseVtt(vtt: string): Array<Omit<SubtitleLine, "ko">> {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const captions: Array<Omit<SubtitleLine, "ko">> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes("-->")) continue;

    const [startRaw, endRaw] = line.split("-->").map((part) => part.trim().split(" ")[0]);
    const text: string[] = [];
    index += 1;

    while (index < lines.length && lines[index].trim()) {
      text.push(lines[index]);
      index += 1;
    }

    const native = cleanCaptionText(text.join(" "));
    if (native) {
      captions.push({ start: parseCaptionTime(startRaw), end: parseCaptionTime(endRaw), native });
    }
  }

  return captions.filter((caption, index, items) => caption.native !== items[index - 1]?.native).slice(0, 400);
}

function mergeCaptions(nativeCaptions: Array<Omit<SubtitleLine, "ko">>, koreanCaptions: Array<Omit<SubtitleLine, "ko">>): SubtitleLine[] {
  return nativeCaptions.map((caption) => {
    const ko = koreanCaptions.find((item) => Math.abs(item.start - caption.start) < 1.2);
    return {
      start: caption.start,
      end: caption.end,
      native: caption.native,
      ko: ko?.native,
    };
  });
}

function cleanCaptionText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCaptionTime(value: string): number {
  const parts = value.split(":");
  const seconds = Number(parts.pop()?.replace(",", ".") ?? 0);
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function extractVocabulary(text: string, language: "en" | "ja") {
  if (!text) return [];

  if (language === "ja") {
    const matches = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}/gu) ?? [];
    return topCounts(matches, 18).map(([term, count]) => ({ term, count, note: "반복 출현한 원어 표현" }));
  }

  const stopwords = new Set(["the", "and", "that", "this", "with", "you", "your", "for", "are", "was", "were", "have", "from", "they", "but", "not"]);
  const words = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g)?.filter((word) => !stopwords.has(word)) ?? [];
  return topCounts(words, 18).map(([term, count]) => ({ term, count, note: "반복 출현한 핵심 단어" }));
}

function extractPhrases(text: string, language: "en" | "ja") {
  if (!text) return [];
  if (language === "ja") return [];

  const phrases = text.toLowerCase().match(/\b[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){1,3}\b/g) ?? [];
  return topCounts(phrases, 12)
    .filter(([phrase]) => phrase.split(" ").length > 1)
    .map(([phrase, count]) => ({ phrase, count, note: "반복 패턴 후보" }));
}

function buildQuiz(subtitles: SubtitleLine[], language: "en" | "ja") {
  return subtitles
    .filter((line) => line.native && line.native.length > (language === "ja" ? 8 : 24))
    .slice(0, 8)
    .map((line, index) => ({
      id: `quiz-${index + 1}`,
      time: line.start,
      prompt: "다음 한국어/맥락을 보고 원문을 떠올려보세요.",
      answer: line.native,
      hint: line.ko || `${formatSeconds(line.start)} 부근 문장`,
    }));
}

async function buildLocalAiLearningItems(text: string, subtitles: SubtitleLine[], language: "en" | "ja") {
  if (!text.trim()) return null;

  const config = await readStoredHardwareConfig();
  const model = recommendModels(config).quiz;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const sample = subtitles
    .slice(0, 80)
    .map((line) => `[${formatSeconds(line.start)}] ${line.ko ? `${line.ko} / ` : ""}${line.native}`)
    .join("\n");

  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        prompt: [
          "You are building a Korean study sheet for an English or Japanese source video.",
          "Return strict JSON only with keys vocabulary, phrases, quiz.",
          "vocabulary: up to 14 objects {term,count,note}; note must be Korean.",
          "phrases: up to 10 objects {phrase,count,note}; note must be Korean.",
          "quiz: up to 6 objects {id,time,prompt,hint,answer}; prompt and hint must be Korean, answer is source language.",
          `sourceLanguage=${language}`,
          sample,
        ].join("\n\n"),
      }),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { response?: string };
    if (!payload.response) return null;
    const parsed = JSON.parse(payload.response) as {
      phrases?: Array<{ count?: number; note?: string; phrase?: string }>;
      quiz?: Array<{ answer?: string; hint?: string; id?: string; prompt?: string; time?: number }>;
      vocabulary?: Array<{ count?: number; note?: string; term?: string }>;
    };

    return {
      model,
      vocabulary:
        parsed.vocabulary
          ?.filter((item) => item.term)
          .map((item) => ({ term: item.term || "", count: item.count ?? 1, note: item.note || "로컬 AI 선택 단어" })) ?? [],
      phrases:
        parsed.phrases
          ?.filter((item) => item.phrase)
          .map((item) => ({ phrase: item.phrase || "", count: item.count ?? 1, note: item.note || "로컬 AI 선택 표현" })) ?? [],
      quiz:
        parsed.quiz
          ?.filter((item) => item.answer)
          .map((item, index) => ({
            id: item.id || `ai-quiz-${index + 1}`,
            time: item.time ?? 0,
            prompt: item.prompt || "문장을 떠올려보세요.",
            hint: item.hint || "자막 맥락을 참고하세요.",
            answer: item.answer || "",
          })) ?? [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readStoredHardwareConfig(): Promise<z.infer<typeof hardwareSchema>> {
  try {
    return hardwareSchema.parse(JSON.parse(await readFile(learningConfigPath, "utf8")) as unknown);
  } catch {
    return hardwareSchema.parse({});
  }
}

function topCounts(items: string[], limit: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, limit);
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function recommendModels(profile: z.infer<typeof hardwareSchema>) {
  const fast = profile.preferSpeed || profile.memoryGb < 24;
  return {
    transcription: fast ? "mlx-community/whisper-medium" : "mlx-community/whisper-large-v3-turbo",
    extraction: fast ? "qwen3:8b" : "gemma3:12b",
    quiz: fast ? "qwen3:8b" : "gemma3:12b",
    reason: `${profile.machine} 기준으로 저장공간 ${profile.storageGb}GB, 메모리 ${profile.memoryGb}GB 설정을 반영했습니다.`,
  };
}

async function searchHuggingFace(search: string, pipeline: string) {
  const url = new URL("https://huggingface.co/api/models");
  url.searchParams.set("search", search);
  url.searchParams.set("pipeline_tag", pipeline);
  url.searchParams.set("sort", "downloads");
  url.searchParams.set("direction", "-1");
  url.searchParams.set("limit", "6");

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const models = (await response.json()) as Array<{ downloads?: number; id?: string; likes?: number; pipeline_tag?: string; tags?: string[] }>;
    return models.map((model) => ({
      id: model.id,
      downloads: model.downloads ?? 0,
      likes: model.likes ?? 0,
      pipeline: model.pipeline_tag ?? pipeline,
      tags: model.tags?.slice(0, 8) ?? [],
    }));
  } catch {
    return [];
  }
}

async function findOptionalBinary(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      try {
        await assertExecutableFile(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    try {
      await execFileAsync(candidate, ["--version"], { timeout: 5_000 });
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function findYtDlp(): Promise<string> {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    normalizeBinaryOverride(process.env.YTDLP_PATH),
    resourcesPath ? resolve(resourcesPath, "bin/yt-dlp_macos") : undefined,
    resourcesPath ? resolve(resourcesPath, ".venv/bin/yt-dlp") : undefined,
    resolve(here, "../bin/yt-dlp_macos"),
    resolve(here, "../../bin/yt-dlp_macos"),
    resolve(here, "../.venv/bin/yt-dlp"),
    resolve(here, "../../.venv/bin/yt-dlp"),
    resolve(process.cwd(), ".venv/bin/yt-dlp"),
    "yt-dlp",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      try {
        await assertExecutableFile(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    try {
      await execFileAsync(candidate, ["--version"], { timeout: 5_000 });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("yt-dlp를 찾지 못했습니다. `.venv/bin/python -m pip install -U yt-dlp`를 실행하세요.");
}

function selectPlayableFormat(info: MediaInfo): MediaFormat | null {
  if (info.url && hasVideoAndAudio(info)) {
    return info;
  }

  const formats = info.formats ?? [];
  const combined = formats
    .filter((format) => format.url && hasVideoAndAudio(format))
    .filter((format) => isBrowserFriendly(format))
    .sort(compareFormatQuality);

  return combined.at(0) ?? null;
}

function hasVideoAndAudio(format: MediaFormat | MediaInfo): boolean {
  return Boolean(format.vcodec && format.vcodec !== "none" && format.acodec && format.acodec !== "none");
}

function isBrowserFriendly(format: MediaFormat): boolean {
  const protocol = format.protocol ?? "";
  const ext = format.ext ?? "";
  return (protocol.startsWith("http") || protocol === "https") && ["mp4", "webm", "m4v"].includes(ext);
}

function compareFormatQuality(a: MediaFormat, b: MediaFormat): number {
  const aHeight = a.height ?? 0;
  const bHeight = b.height ?? 0;
  if (aHeight !== bHeight) return bHeight - aHeight;

  return (b.tbr ?? 0) - (a.tbr ?? 0);
}

function formatToolError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "미디어 요청이 취소되었습니다.";
  return "미디어 정보를 가져오지 못했습니다. 링크와 yt-dlp 상태를 확인하세요.";
}

function normalizeBinaryOverride(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith("/") ? value : undefined;
}

async function assertExecutableFile(candidate: string): Promise<void> {
  const details = await stat(candidate);
  if (!details.isFile()) throw new Error("Binary candidate is not a regular file.");
  await access(candidate, constants.X_OK);
}

export const apiBase = await listenWithFallback(port);

async function listenWithFallback(initialPort: number): Promise<string> {
  try {
    return await app.listen({ host: "127.0.0.1", port: initialPort });
  } catch (error) {
    if (!allowPortFallback || !isAddressInUseError(error)) {
      throw error;
    }

    app.log.warn({ port: initialPort }, "api port is busy; falling back to a random local port");
    return app.listen({ host: "127.0.0.1", port: 0 });
  }
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EADDRINUSE"
  );
}
