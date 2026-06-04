import { motion } from "motion/react";
import {
  BadgeInfo,
  BookOpen,
  BookmarkPlus,
  Brain,
  Clock3,
  Copy,
  Dices,
  Eye,
  EyeOff,
  Gauge,
  History,
  Layers3,
  Link2,
  LoaderCircle,
  Languages,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  StepBack,
  StepForward,
  Target,
  Wand2,
  Trash2,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime, parseTime } from "./time";
import type { VideoSource, YoutubeEvent, YoutubePlayer } from "./types";
import { parseVideoUrl } from "./url";

const apiTimeoutMs = 8000;
const tickerMs = 250;
const historyStorageKey = "contentdeck.history.v1";
const maxHistoryItems = 30;

type PlayerMode = "idle" | "loading" | "native" | "api" | "embed" | "external";

type NativeMedia = {
  duration: number;
  mediaUrl: string;
  sourceUrl: string;
  thumbnail: string;
  title: string;
};

type LoopSegment = {
  id: string;
  label: string;
  start: number;
  end: number;
  updatedAt: number;
  score: number;
  note: string;
};

type HistoryEntry = {
  key: string;
  url: string;
  platform: VideoSource["platform"];
  label: string;
  title: string;
  thumbnail: string;
  duration: number;
  updatedAt: number;
  segment: {
    enabled: boolean;
    start: number;
    end: number;
  };
  activeSegmentId: string;
  segments: LoopSegment[];
  note: string;
};

type HistoryFilter = "all" | VideoSource["platform"];
type FitMode = "contain" | "cover";
type DrillPreset = "shadow" | "precision" | "memory" | "review";
type SegmentIntent = "free" | "move" | "pronunciation" | "memory" | "analysis";
type SidebarView = "segment" | "playback" | "workbench" | "learning" | "history";

type LearningLine = {
  end: number;
  ko?: string;
  native?: string;
  start: number;
};

type LearningAnalysis = {
  hasKoreanTrack: boolean;
  hasNativeTrack: boolean;
  phrases: Array<{ count: number; note: string; phrase: string }>;
  quiz: Array<{ answer: string; hint: string; id: string; prompt: string; time: number }>;
  sentences: LearningLine[];
  sourceLanguage: "en" | "ja";
  subtitles: LearningLine[];
  title: string;
  vocabulary: Array<{ count: number; note: string; term: string }>;
};

type HardwareConfig = {
  machine: string;
  memoryGb: number;
  preferSpeed: boolean;
  storageGb: number;
};

type ModelRecommendation = {
  extraction: string;
  quiz: string;
  reason: string;
  transcription: string;
};

type ModelRegistryItem = {
  fit?: string;
  id: string;
  install?: string;
  role?: string;
  runtime?: string;
  size?: string;
};

export function App() {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<VideoSource | null>(null);
  const [mode, setMode] = useState<PlayerMode>("idle");
  const [message, setMessage] = useState("지원 링크를 입력하세요.");
  const [error, setError] = useState("");
  const [segmentEnabled, setSegmentEnabled] = useState(false);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [nativeMedia, setNativeMedia] = useState<NativeMedia | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => readHistory());
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [showPanel, setShowPanel] = useState(true);
  const [sidebarView, setSidebarView] = useState<SidebarView>("segment");
  const [mirrorMode, setMirrorMode] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>("contain");
  const [focusBackdrop, setFocusBackdrop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [repeatTarget, setRepeatTarget] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [markers, setMarkers] = useState<number[]>([]);
  const [preRollSeconds, setPreRollSeconds] = useState(0);
  const [segmentDraftLabel, setSegmentDraftLabel] = useState("");
  const [segmentScore, setSegmentScore] = useState(3);
  const [videoNote, setVideoNote] = useState("");
  const [drillPreset, setDrillPreset] = useState<DrillPreset | "custom">("custom");
  const [segmentIntent, setSegmentIntent] = useState<SegmentIntent>("free");
  const [blindMode, setBlindMode] = useState(false);
  const [countOverlay, setCountOverlay] = useState(false);
  const [tempoLadder, setTempoLadder] = useState(false);
  const [shrinkMode, setShrinkMode] = useState(false);
  const [contextExpandMode, setContextExpandMode] = useState(false);
  const [coachPrompt, setCoachPrompt] = useState("관찰할 포인트를 정하고 구간을 저장하세요.");
  const [sessionEvents, setSessionEvents] = useState<string[]>([]);
  const [learningSourceLanguage, setLearningSourceLanguage] = useState<"auto" | "en" | "ja">("auto");
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningError, setLearningError] = useState("");
  const [learningAnalysis, setLearningAnalysis] = useState<LearningAnalysis | null>(null);
  const [revealedQuiz, setRevealedQuiz] = useState<Record<string, boolean>>({});
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfig>({
    machine: "MacBook Pro 14 M3 Pro",
    memoryGb: 18,
    preferSpeed: true,
    storageGb: 1024,
  });
  const [modelRecommendation, setModelRecommendation] = useState<ModelRecommendation | null>(null);
  const [modelRegistry, setModelRegistry] = useState<ModelRegistryItem[]>([]);
  const [modelStatus, setModelStatus] = useState("");

  const historyRef = useRef(history);
  const playerRef = useRef<YoutubePlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const loopCountRef = useRef(0);
  const playerReadyRef = useRef(false);
  const bootIdRef = useRef(0);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const segmentRef = useRef({ enabled: false, start: 0, end: Number.MAX_SAFE_INTEGER });
  const mountId = "youtube-player";

  const platformLabel = source?.label ?? "대기";
  const sourceKey = source ? getSourceKey(source) : "";
  const currentHistory = sourceKey ? history.find((entry) => entry.key === sourceKey) : undefined;
  const nativeControlsEnabled = source?.platform === "youtube" && mode === "native" && Boolean(nativeMedia);
  const youtubeControlsEnabled = source?.platform === "youtube" && ((mode === "api" && playerReady) || nativeControlsEnabled);
  const parsedStart = parseTime(startTime);
  const parsedEnd = parseTime(endTime);
  const segmentValid =
    !segmentEnabled ||
    (parsedStart >= 0 && parsedEnd >= 0 && parsedStart < parsedEnd && (duration <= 0 || parsedEnd <= duration + 1));
  const activeStart = segmentEnabled && segmentValid ? parsedStart : 0;
  const activeEnd = segmentEnabled && segmentValid ? parsedEnd : duration || Number.MAX_SAFE_INTEGER;
  const segmentLength = segmentEnabled && segmentValid ? Math.max(0, activeEnd - activeStart) : duration;
  const remainingInSegment =
    segmentEnabled && segmentValid ? clamp(activeEnd - currentTime, 0, segmentLength || Number.MAX_SAFE_INTEGER) : clamp(duration - currentTime, 0, duration || 0);
  const playerMediaClass = `${fitMode === "cover" ? "object-cover" : "object-contain"} ${mirrorMode ? "-scale-x-100" : ""}`;
  const timelineStartPercent = duration > 0 ? clamp((activeStart / duration) * 100, 0, 100) : 0;
  const timelineEndPercent = duration > 0 ? clamp((activeEnd / duration) * 100, 0, 100) : 0;
  const timelineCurrentPercent = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  const savedSegments = currentHistory?.segments ?? [];
  const activeSavedSegment = savedSegments.find((item) => item.id === currentHistory?.activeSegmentId);
  const sessionProgress = repeatTarget > 0 ? clamp((loopCount / repeatTarget) * 100, 0, 100) : 0;
  const eightCount =
    segmentEnabled && segmentValid && segmentLength > 0
      ? Math.floor((clamp(currentTime - activeStart, 0, segmentLength) / segmentLength) * 8) + 1
      : 1;
  const hiddenForRecall = blindMode && loopCount > 0 && segmentEnabled;

  const statusText = useMemo(() => {
    if (mode === "loading") return "플레이어를 준비하고 있습니다.";
    if (mode === "native") return "자체 플레이어로 반복 재생 중";
    if (mode === "api") return "반복 재생 중";
    if (mode === "embed") return "기본 플레이어로 표시 중";
    if (mode === "external") return "플랫폼 플레이어로 표시 중";
    return "지원 링크를 입력하세요.";
  }, [mode]);

  const visibleHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();

    return history.filter((entry) => {
      const platformMatches = historyFilter === "all" || entry.platform === historyFilter;
      const queryMatches =
        !query ||
        entry.title.toLowerCase().includes(query) ||
        entry.url.toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query);
      return platformMatches && queryMatches;
    });
  }, [history, historyFilter, historyQuery]);

  useEffect(() => {
    let ignore = false;

    async function loadLearningConfig() {
      try {
        const [configResponse, registryResponse] = await Promise.all([
          fetch(getApiUrl("/api/learning/config")),
          fetch(getApiUrl("/api/models/registry")),
        ]);
        const configPayload = (await configResponse.json()) as { config?: HardwareConfig; recommendations?: ModelRecommendation };
        const registryPayload = (await registryResponse.json()) as { models?: ModelRegistryItem[] };
        if (ignore) return;
        if (configPayload.config) setHardwareConfig(configPayload.config);
        if (configPayload.recommendations) setModelRecommendation(configPayload.recommendations);
        setModelRegistry(registryPayload.models ?? []);
      } catch {
        if (!ignore) setModelStatus("로컬 AI 설정을 아직 불러오지 못했습니다.");
      }
    }

    void loadLearningConfig();
    return () => {
      ignore = true;
    };
  }, []);

  const persistHistory = useCallback((updater: (items: HistoryEntry[]) => HistoryEntry[]) => {
    setHistory((items) => {
      const nextItems = updater(items).slice(0, maxHistoryItems);
      historyRef.current = nextItems;
      writeHistory(nextItems);
      return nextItems;
    });
  }, []);

  const upsertHistory = useCallback(
    (entry: HistoryEntry) => {
      persistHistory((items) => [entry, ...items.filter((item) => item.key !== entry.key)]);
    },
    [persistHistory],
  );

  const patchHistory = useCallback(
    (key: string, patcher: (entry: HistoryEntry) => HistoryEntry) => {
      persistHistory((items) => {
        const existing = items.find((item) => item.key === key);
        if (!existing) return items;
        const patched = patcher(existing);
        return [patched, ...items.filter((item) => item.key !== key)];
      });
    },
    [persistHistory],
  );

  const removeHistory = useCallback(
    (key: string) => {
      persistHistory((items) => items.filter((item) => item.key !== key));
    },
    [persistHistory],
  );

  const clearHistory = useCallback(() => {
    persistHistory(() => []);
  }, [persistHistory]);

  const applySegment = useCallback((segment: LoopSegment | HistoryEntry["segment"]) => {
    setSegmentEnabled(true);
    setStartTime(formatTime(segment.start));
    setEndTime(segment.end > 0 ? formatTime(segment.end) : "");
  }, []);

  const saveCurrentSegment = useCallback(() => {
    if (!sourceKey || !source || source.platform !== "youtube" || !segmentEnabled || !segmentValid) return;

    const label = segmentDraftLabel.trim() || `${formatTime(activeStart)} - ${formatTime(activeEnd)}`;
    const nextSegment: LoopSegment = {
      id: createId(),
      label,
      start: Math.floor(activeStart),
      end: Math.floor(activeEnd),
      updatedAt: Date.now(),
      score: segmentScore,
      note: `${segmentIntent}: ${coachPrompt}`,
    };

    patchHistory(sourceKey, (entry) => ({
      ...entry,
      activeSegmentId: nextSegment.id,
      segment: {
        enabled: true,
        start: nextSegment.start,
        end: nextSegment.end,
      },
      segments: [nextSegment, ...entry.segments.filter((item) => item.id !== nextSegment.id)].slice(0, 12),
      updatedAt: Date.now(),
    }));
    setSegmentDraftLabel("");
    setMessage("현재 반복 구간을 저장했습니다.");
  }, [activeEnd, activeStart, patchHistory, segmentDraftLabel, segmentEnabled, segmentScore, segmentValid, source, sourceKey]);

  const removeSavedSegment = useCallback(
    (entryKey: string, segmentId: string) => {
      patchHistory(entryKey, (entry) => {
        const segments = entry.segments.filter((item) => item.id !== segmentId);
        return {
          ...entry,
          activeSegmentId: entry.activeSegmentId === segmentId ? segments[0]?.id ?? "" : entry.activeSegmentId,
          segments,
          updatedAt: Date.now(),
        };
      });
    },
    [patchHistory],
  );

  const updateVideoNote = useCallback(
    (value: string) => {
      setVideoNote(value);
      if (!sourceKey || !currentHistory) return;

      patchHistory(sourceKey, (entry) => ({
        ...entry,
        note: value,
        updatedAt: Date.now(),
      }));
    },
    [currentHistory, patchHistory, sourceKey],
  );

  const updateSegmentScore = useCallback(
    (segmentId: string, score: number) => {
      if (!sourceKey) return;

      patchHistory(sourceKey, (entry) => ({
        ...entry,
        segments: entry.segments.map((item) => (item.id === segmentId ? { ...item, score, updatedAt: Date.now() } : item)),
        updatedAt: Date.now(),
      }));
    },
    [patchHistory, sourceKey],
  );

  const clearPlayer = useCallback(() => {
    resolveAbortRef.current?.abort();
    resolveAbortRef.current = null;
    if (restTimerRef.current) {
      window.clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
    if (readyTimerRef.current) {
      window.clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }

    playerRef.current?.destroy();
    playerRef.current = null;
    videoRef.current = null;
    setNativeMedia(null);
    playerReadyRef.current = false;
    setPlayerReady(false);
    setIsResting(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const resetSession = useCallback(() => {
    loopCountRef.current = 0;
    setLoopCount(0);
    setIsResting(false);
    setSessionEvents([]);
    if (restTimerRef.current) {
      window.clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    segmentRef.current = {
      enabled: segmentEnabled && segmentValid,
      start: activeStart,
      end: activeEnd,
    };
  }, [activeEnd, activeStart, segmentEnabled, segmentValid]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
    }
    playerRef.current?.setPlaybackRate?.(playbackRate);
  }, [playbackRate, nativeMedia, playerReady]);

  const handleLoopCycle = useCallback(
    (seekToStart: () => void, play: () => void, pause: () => void) => {
      const nextCount = loopCountRef.current + 1;
      loopCountRef.current = nextCount;
      setLoopCount(nextCount);
      setSessionEvents((items) => [`${nextCount}회 · ${formatTime(segmentRef.current.start)}-${formatTime(segmentRef.current.end)}`, ...items].slice(0, 5));

      if (tempoLadder) {
        const speeds = [0.5, 0.75, 1, 1.15, 1.25];
        setPlaybackRate(speeds[Math.min(nextCount, speeds.length - 1)] ?? 1);
      }

      if (shrinkMode && segmentRef.current.enabled) {
        const nextStart = segmentRef.current.start + 1;
        const nextEnd = segmentRef.current.end - 1;
        if (nextEnd - nextStart >= 3) {
          setStartTime(formatTime(nextStart));
          setEndTime(formatTime(nextEnd));
        }
      }

      if (contextExpandMode && segmentRef.current.enabled) {
        const nextStart = Math.max(0, segmentRef.current.start - 1);
        const nextEnd = Math.min(duration || segmentRef.current.end + 1, segmentRef.current.end + 1);
        if (nextEnd > nextStart) {
          setStartTime(formatTime(nextStart));
          setEndTime(formatTime(nextEnd));
        }
      }

      if (repeatTarget > 0 && nextCount >= repeatTarget) {
        pause();
        seekToStart();
        setMessage(`${repeatTarget}회 반복을 마쳤습니다.`);
        return;
      }

      if (restSeconds > 0) {
        pause();
        seekToStart();
        setIsResting(true);
        restTimerRef.current = window.setTimeout(() => {
          setIsResting(false);
          play();
        }, restSeconds * 1000);
        return;
      }

      seekToStart();
      play();
    },
    [contextExpandMode, duration, repeatTarget, restSeconds, shrinkMode, tempoLadder],
  );

  const renderFallback = useCallback(() => {
    clearPlayer();
    setMode("embed");
    setMessage("기본 플레이어로 전환했습니다. 플레이어가 Video unavailable을 표시하면 해당 영상은 외부 플레이어 재생이 제한된 상태입니다.");
  }, [clearPlayer]);

  const loadYouTubeApi = useCallback(() => {
    if (window.YT?.Player) return Promise.resolve();

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }

    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      const previous = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };

      const check = () => {
        if (window.YT?.Player) {
          resolve();
          return;
        }

        if (Date.now() - startedAt > apiTimeoutMs) {
          reject(new Error("YouTube API timeout"));
          return;
        }

        window.setTimeout(check, 150);
      };

      check();
    });
  }, []);

  const bootYouTube = useCallback(
    async (nextSource: Extract<VideoSource, { platform: "youtube" }>) => {
      const bootId = bootIdRef.current + 1;
      bootIdRef.current = bootId;
      clearPlayer();
      playerReadyRef.current = false;
      setMode("loading");
      setMessage("");

      try {
        await loadYouTubeApi();
      } catch {
        if (bootIdRef.current !== bootId) return;
        renderFallback();
        return;
      }

      if (bootIdRef.current !== bootId) return;

      playerRef.current = new window.YT!.Player(mountId, {
        width: "100%",
        height: "100%",
        videoId: nextSource.videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          loop: 1,
          playlist: nextSource.videoId,
          start: nextSource.startSeconds || 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: YoutubeEvent) => {
            if (bootIdRef.current !== bootId) return;
            if (readyTimerRef.current) {
              window.clearTimeout(readyTimerRef.current);
              readyTimerRef.current = null;
            }
            playerReadyRef.current = true;
            const nextDuration = Math.floor(event.target.getDuration() || 0);
            playerRef.current = event.target;
            setDuration(nextDuration);
            setEndTime((value) => value || (nextDuration > 0 ? formatTime(nextDuration) : ""));
            upsertHistory(createHistoryEntry(nextSource, historyRef.current, { duration: nextDuration }));
            event.target.setPlaybackRate?.(playbackRate);
            setPlayerReady(true);
            setMode("api");
            if (nextSource.startSeconds > 0) {
              event.target.seekTo(nextSource.startSeconds, true);
            }
            event.target.playVideo();
          },
          onStateChange: (event: YoutubeEvent) => {
            if (bootIdRef.current !== bootId) return;
            if (event.data === window.YT?.PlayerState.ENDED) {
              handleLoopCycle(
                () => event.target.seekTo(segmentRef.current.enabled ? segmentRef.current.start : 0, true),
                () => event.target.playVideo(),
                () => event.target.pauseVideo(),
              );
            }
          },
          onError: (event: YoutubeEvent) => {
            if (bootIdRef.current !== bootId) return;
            const code = event.data;
            const restricted = code === 100 || code === 101 || code === 150;
            setError(
              restricted
                ? "이 영상은 외부 플레이어 재생이 제한되어 있습니다. 다른 공유 링크를 시도해 주세요."
                : "YouTube 플레이어가 영상을 불러오지 못했습니다. 링크 형식을 확인해 주세요.",
            );
            renderFallback();
          },
        },
      });

      readyTimerRef.current = window.setTimeout(() => {
        if (bootIdRef.current === bootId && !playerReadyRef.current) {
          renderFallback();
        }
      }, apiTimeoutMs);
    },
    [clearPlayer, handleLoopCycle, loadYouTubeApi, playbackRate, renderFallback],
  );

  const bootNative = useCallback(
    async (nextSource: Extract<VideoSource, { platform: "youtube" }>) => {
      const bootId = bootIdRef.current + 1;
      bootIdRef.current = bootId;
      clearPlayer();
      setMode("loading");
      setMessage("로컬 해석기로 미디어를 준비하고 있습니다.");

      try {
        const abortController = new AbortController();
        resolveAbortRef.current = abortController;
        const response = await fetch(getApiUrl("/api/resolve"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: nextSource.href }),
          signal: abortController.signal,
        });
        const payload = (await response.json()) as NativeMedia | { error?: string };

        if (bootIdRef.current !== bootId) return;
        if (resolveAbortRef.current === abortController) {
          resolveAbortRef.current = null;
        }

        if (!response.ok || !("mediaUrl" in payload)) {
          setMessage("로컬 해석에 실패해서 기본 플레이어로 전환합니다.");
          void bootYouTube(nextSource);
          return;
        }

        setNativeMedia(payload);
        setDuration(Math.floor(payload.duration || 0));
        setEndTime((value) => value || (payload.duration > 0 ? formatTime(payload.duration) : ""));
        upsertHistory(
          createHistoryEntry(nextSource, historyRef.current, {
            duration: Math.floor(payload.duration || 0),
            thumbnail: payload.thumbnail,
            title: payload.title,
            url: payload.sourceUrl || nextSource.href,
          }),
        );
        setMode("native");
        setMessage("자체 플레이어로 반복 재생 중");
      } catch (error) {
        if (bootIdRef.current !== bootId) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage("로컬 API 연결에 실패해서 기본 플레이어로 전환합니다.");
        void bootYouTube(nextSource);
      }
    },
    [bootYouTube, clearPlayer, upsertHistory],
  );

  const bootExternalEmbed = useCallback(
    (nextSource: Extract<VideoSource, { platform: "x" | "tiktok" }>) => {
      clearPlayer();
      setMode("external");
      setMessage("이 플랫폼은 내장 플레이어 범위에서 동작합니다. 정밀 구간 제어는 YouTube 링크에서 사용할 수 있습니다.");
      upsertHistory(createHistoryEntry(nextSource, historyRef.current));

      if (nextSource.platform === "x") {
        loadXEmbedScript(() => {
          window.twttr?.widgets?.load(document.querySelector("#external-player"));
        });
      } else {
        document.querySelector('script[src="https://www.tiktok.com/embed.js"]')?.remove();
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://www.tiktok.com/embed.js";
        document.body.appendChild(script);
      }
    },
    [clearPlayer, upsertHistory],
  );

  const sourceHref = source?.href ?? "";

  useEffect(() => {
    if (!source) return;
    if (source.platform === "youtube") {
      void bootNative(source);
      return;
    }

    bootExternalEmbed(source);
    // Player booting must be keyed to the loaded media URL only.
    // State changes from duration/history/session controls should not restart resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceHref]);

  useEffect(() => {
    if (!youtubeControlsEnabled || nativeControlsEnabled) return;

    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const nextCurrent = player.getCurrentTime() || 0;
      const nextDuration = player.getDuration() || duration || 0;

      if (segmentEnabled && activeEnd > activeStart && nextCurrent >= activeEnd - 0.15) {
        handleLoopCycle(
          () => player.seekTo(activeStart, true),
          () => player.playVideo(),
          () => player.pauseVideo(),
        );
        return;
      }

      if (!isSeeking) {
        setCurrentTime(nextCurrent);
        setDuration(Math.floor(nextDuration));
      }
    }, tickerMs);

    return () => window.clearInterval(interval);
  }, [activeEnd, activeStart, duration, handleLoopCycle, isSeeking, nativeControlsEnabled, segmentEnabled, youtubeControlsEnabled]);

  useEffect(() => {
    if (!youtubeControlsEnabled) return;

    if (!segmentEnabled) {
      setError("");
      return;
    }

    if (!segmentValid) {
      setError("구간은 영상 길이 안에서 시작 시간이 끝 시간보다 앞서야 합니다.");
      return;
    }

    setError("");
    const player = playerRef.current;
    const video = videoRef.current;
    const current = nativeControlsEnabled ? (video?.currentTime ?? 0) : (player?.getCurrentTime() ?? 0);
    if (current < activeStart || current > activeEnd) {
      if (nativeControlsEnabled && video) {
        video.currentTime = activeStart;
      } else {
        player?.seekTo(activeStart, true);
      }
    }
  }, [activeEnd, activeStart, nativeControlsEnabled, segmentEnabled, segmentValid, youtubeControlsEnabled]);

  useEffect(() => {
    if (!sourceKey || !source || source.platform !== "youtube") return;

    if (segmentEnabled && !segmentValid) return;

    const fallbackEnd = duration > 0 ? duration : currentHistory?.segment.end || 0;
    const nextSegment = {
      enabled: segmentEnabled,
      start: parsedStart >= 0 ? parsedStart : 0,
      end: parsedEnd >= 0 ? parsedEnd : fallbackEnd,
    };

    patchHistory(sourceKey, (entry) => ({
      ...entry,
      updatedAt: Date.now(),
      segment: nextSegment,
    }));
  }, [
    currentHistory?.segment.end,
    duration,
    parsedEnd,
    parsedStart,
    patchHistory,
    segmentEnabled,
    segmentValid,
    source,
    sourceKey,
  ]);

  const loadUrl = useCallback(
    (value: string, selectedSegment?: LoopSegment) => {
      const parsed = parseVideoUrl(value);
      if (!parsed) {
        setSource(null);
        setMode("idle");
        setError("YouTube, X, TikTok 공유 링크를 입력하세요.");
        setMessage("");
        setVideoNote("");
        clearPlayer();
        return;
      }

      setError("");
      setMessage("");
      resetSession();
      setMarkers([]);
      const saved = historyRef.current.find((entry) => entry.key === getSourceKey(parsed));
      setVideoNote(saved?.note ?? "");
      const activeSavedSegment = selectedSegment ?? saved?.segments.find((item) => item.id === saved.activeSegmentId);
      if (parsed.platform === "youtube" && activeSavedSegment) {
        applySegment(activeSavedSegment);
      } else if (parsed.platform === "youtube" && saved) {
        setSegmentEnabled(saved.segment.enabled);
        setStartTime(formatTime(saved.segment.start));
        setEndTime(saved.segment.end > 0 ? formatTime(saved.segment.end) : "");
      } else {
        setSegmentEnabled(false);
        setStartTime(parsed.platform === "youtube" && parsed.startSeconds > 0 ? formatTime(parsed.startSeconds) : "00:00");
        setEndTime("");
      }
      upsertHistory(createHistoryEntry(parsed, historyRef.current));
      if (selectedSegment) {
        patchHistory(getSourceKey(parsed), (entry) => ({
          ...entry,
          activeSegmentId: selectedSegment.id,
          segment: {
            enabled: true,
            start: selectedSegment.start,
            end: selectedSegment.end,
          },
          updatedAt: Date.now(),
        }));
      }
      setSource(parsed);
    },
    [applySegment, clearPlayer, patchHistory, resetSession, upsertHistory],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get("url");
    if (!sharedUrl) return;

    setUrl(sharedUrl);
    loadUrl(sharedUrl);
    const sharedStart = parseTime(params.get("loopStart") ?? "");
    const sharedEnd = parseTime(params.get("loopEnd") ?? "");
    if (sharedStart >= 0 && sharedEnd > sharedStart) {
      setSegmentEnabled(true);
      setStartTime(formatTime(sharedStart));
      setEndTime(formatTime(sharedEnd));
    }
  }, [loadUrl]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadUrl(url);
  };

  const togglePlayback = () => {
    if (nativeControlsEnabled) {
      const video = videoRef.current;
      if (!video) return;

      if (video.paused) {
        void video.play();
      } else {
        video.pause();
      }
      return;
    }

    const player = playerRef.current;
    if (!player || !window.YT) return;

    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  const restart = () => {
    resetSession();
    const restartAt = Math.max(0, activeStart - preRollSeconds);
    if (nativeControlsEnabled) {
      const video = videoRef.current;
      if (!video) return;

      video.currentTime = restartAt;
      void video.play();
      return;
    }

    const player = playerRef.current;
    if (!player) return;

    player.seekTo(restartAt, true);
    player.playVideo();
  };

  const seekRelative = (seconds: number) => {
    const nextTime = clamp(currentTime + seconds, 0, duration || Number.MAX_SAFE_INTEGER);

    if (nativeControlsEnabled) {
      const video = videoRef.current;
      if (!video) return;

      video.currentTime = nextTime;
      setCurrentTime(nextTime);
      return;
    }

    const player = playerRef.current;
    if (!player) return;

    player.seekTo(nextTime, true);
    setCurrentTime(nextTime);
  };

  const setSegmentBoundary = (boundary: "start" | "end") => {
    const value = formatTime(Math.floor(currentTime));
    if (boundary === "start") {
      setStartTime(value);
      if (!segmentEnabled) setSegmentEnabled(true);
      return;
    }

    setEndTime(value);
    if (!segmentEnabled) setSegmentEnabled(true);
  };

  const nudgeSegment = (boundary: "start" | "end", seconds: number) => {
    const current = boundary === "start" ? parsedStart : parsedEnd;
    const fallback = boundary === "start" ? activeStart : activeEnd;
    const nextValue = clamp((current >= 0 ? current : fallback) + seconds, 0, duration || Number.MAX_SAFE_INTEGER);

    if (boundary === "start") {
      setStartTime(formatTime(nextValue));
      return;
    }

    setEndTime(formatTime(nextValue));
  };

  const applyDrillPreset = (preset: DrillPreset) => {
    setDrillPreset(preset);

    if (preset === "shadow") {
      setPlaybackRate(0.75);
      setRepeatTarget(5);
      setRestSeconds(2);
      setPreRollSeconds(1);
      setFocusBackdrop(true);
      setMirrorMode(false);
    }

    if (preset === "precision") {
      setPlaybackRate(0.5);
      setRepeatTarget(10);
      setRestSeconds(0);
      setPreRollSeconds(2);
      setFocusBackdrop(true);
      setMirrorMode(true);
    }

    if (preset === "memory") {
      setPlaybackRate(1);
      setRepeatTarget(3);
      setRestSeconds(5);
      setPreRollSeconds(0);
      setFocusBackdrop(true);
      setShowPanel(false);
      setBlindMode(true);
    }

    if (preset === "review") {
      setPlaybackRate(1.25);
      setRepeatTarget(0);
      setRestSeconds(0);
      setPreRollSeconds(0);
      setFocusBackdrop(false);
      setShowPanel(true);
      setBlindMode(false);
    }

    resetSession();
  };

  const splitCurrentRange = (parts: number) => {
    if (!sourceKey || !source || source.platform !== "youtube") return;

    const rangeStart = segmentEnabled && segmentValid ? activeStart : 0;
    const rangeEnd = segmentEnabled && segmentValid ? activeEnd : duration;
    if (!rangeEnd || rangeEnd <= rangeStart) return;

    const size = (rangeEnd - rangeStart) / parts;
    const created = Array.from({ length: parts }, (_, index) => {
      const start = Math.floor(rangeStart + size * index);
      const end = Math.floor(index === parts - 1 ? rangeEnd : rangeStart + size * (index + 1));
      return {
        id: createId(),
        label: `분할 ${index + 1} · ${formatTime(start)}-${formatTime(end)}`,
        start,
        end,
        updatedAt: Date.now(),
        score: 3,
        note: "",
      };
    }).filter((item) => item.end > item.start);

    patchHistory(sourceKey, (entry) => ({
      ...entry,
      segments: [...created, ...entry.segments].slice(0, 12),
      updatedAt: Date.now(),
    }));
    setMessage(`${created.length}개 구간으로 나눴습니다.`);
  };

  const captureMoment = () => {
    if (!sourceKey || !source || source.platform !== "youtube") return;

    const start = Math.max(0, Math.floor(currentTime - 4));
    const end = Math.min(duration || currentTime + 6, Math.floor(currentTime + 6));
    if (end <= start) return;

    const captured: LoopSegment = {
      id: createId(),
      label: `순간 ${formatTime(start)}-${formatTime(end)}`,
      start,
      end,
      updatedAt: Date.now(),
      score: 3,
      note: "",
    };

    patchHistory(sourceKey, (entry) => ({
      ...entry,
      activeSegmentId: captured.id,
      segment: { enabled: true, start, end },
      segments: [captured, ...entry.segments].slice(0, 12),
      updatedAt: Date.now(),
    }));
    applySegment(captured);
  };

  const pickRandomSegment = () => {
    if (!currentHistory || currentHistory.segments.length === 0) return;

    const segment = currentHistory.segments[Math.floor(Math.random() * currentHistory.segments.length)];
    if (!segment) return;
    loadHistoryEntry(currentHistory, segment);
  };

  const pickWeakSegment = () => {
    if (!currentHistory || currentHistory.segments.length === 0) return;

    const [segment] = [...currentHistory.segments].sort((a, b) => a.score - b.score || a.updatedAt - b.updatedAt);
    if (!segment) return;
    loadHistoryEntry(currentHistory, segment);
  };

  const pickStaleSegment = () => {
    const candidates = history.flatMap((entry) => entry.segments.map((segment) => ({ entry, segment })));
    const [candidate] = candidates.sort((a, b) => a.segment.updatedAt - b.segment.updatedAt);
    if (!candidate) return;
    loadHistoryEntry(candidate.entry, candidate.segment);
  };

  const pickNextSegment = () => {
    if (!currentHistory || currentHistory.segments.length === 0) return;

    const currentIndex = Math.max(0, currentHistory.segments.findIndex((item) => item.id === currentHistory.activeSegmentId));
    const segment = currentHistory.segments[(currentIndex + 1) % currentHistory.segments.length];
    if (!segment) return;
    loadHistoryEntry(currentHistory, segment);
  };

  const useSegmentHalf = (half: "front" | "back") => {
    const start = activeStart;
    const end = activeEnd === Number.MAX_SAFE_INTEGER ? duration : activeEnd;
    if (!end || end <= start) return;

    const middle = Math.floor((start + end) / 2);
    setSegmentEnabled(true);
    if (half === "front") {
      setStartTime(formatTime(start));
      setEndTime(formatTime(middle));
      return;
    }

    setStartTime(formatTime(middle));
    setEndTime(formatTime(end));
  };

  const copyHistoryJson = () => {
    void navigator.clipboard?.writeText(JSON.stringify(history, null, 2));
    setMessage("히스토리 JSON을 복사했습니다.");
  };

  const generatePracticeCard = () => {
    const lines = [
      nativeMedia?.title || currentHistory?.title || "ContentDeck practice",
      `구간: ${formatTime(activeStart)} - ${formatTime(activeEnd === Number.MAX_SAFE_INTEGER ? duration : activeEnd)}`,
      `루프: ${loopCount}${repeatTarget ? `/${repeatTarget}` : ""}`,
      `속도: ${playbackRate}x`,
      `메모: ${videoNote || "-"}`,
      `포인트: ${coachPrompt}`,
    ];
    void navigator.clipboard?.writeText(lines.join("\n"));
    setMessage("연습 카드를 복사했습니다.");
  };

  const addMarker = () => {
    const nextMarker = Math.floor(currentTime);
    setMarkers((items) => [...items.filter((item) => Math.abs(item - nextMarker) > 1), nextMarker].sort((a, b) => a - b).slice(0, 8));
  };

  const jumpToMarker = (marker: number) => {
    if (nativeControlsEnabled && videoRef.current) {
      videoRef.current.currentTime = marker;
      setCurrentTime(marker);
      return;
    }

    playerRef.current?.seekTo(marker, true);
    setCurrentTime(marker);
  };

  const removeMarker = (marker: number) => {
    setMarkers((items) => items.filter((item) => item !== marker));
  };

  const copySegmentLink = () => {
    if (!source || source.platform !== "youtube") return;

    const link = new URL(window.location.href);
    link.search = "";
    link.searchParams.set("url", source.href);
    if (segmentEnabled && segmentValid) {
      link.searchParams.set("loopStart", String(Math.floor(activeStart)));
      link.searchParams.set("loopEnd", String(Math.floor(activeEnd)));
    }

    void navigator.clipboard?.writeText(link.toString());
    setMessage("구간 링크를 복사했습니다.");
  };

  const analyzeLearning = async () => {
    const targetUrl = source?.href || url.trim();
    if (!targetUrl) {
      setLearningError("먼저 영상 주소를 입력하세요.");
      setSidebarView("learning");
      return;
    }

    setSidebarView("learning");
    setLearningLoading(true);
    setLearningError("");
    setRevealedQuiz({});

    try {
      const response = await fetch(getApiUrl("/api/learning/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, sourceLanguage: learningSourceLanguage }),
      });
      const payload = (await response.json()) as LearningAnalysis | { error?: string };
      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload ? payload.error : "학습 데이터를 만들지 못했습니다.");
      }
      setLearningAnalysis(payload as LearningAnalysis);
      setMessage("자막과 학습 항목을 준비했습니다.");
    } catch (error) {
      setLearningError(error instanceof Error ? error.message : "학습 데이터를 만들지 못했습니다.");
    } finally {
      setLearningLoading(false);
    }
  };

  const saveLearningConfig = async () => {
    setModelStatus("로컬 AI 설정을 저장하는 중입니다.");

    try {
      const response = await fetch(getApiUrl("/api/learning/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hardwareConfig),
      });
      const payload = (await response.json()) as { error?: string; recommendations?: ModelRecommendation };
      if (!response.ok || payload.error) throw new Error(payload.error || "설정을 저장하지 못했습니다.");
      setModelRecommendation(payload.recommendations ?? null);
      setModelStatus("하드웨어 설정과 추천 모델을 저장했습니다.");
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    }
  };

  const refreshLiveModels = async () => {
    setModelStatus("최신 모델 목록을 확인하는 중입니다.");

    try {
      const response = await fetch(getApiUrl("/api/models/live"));
      const payload = (await response.json()) as { error?: string; models?: ModelRegistryItem[] };
      if (!response.ok || payload.error) throw new Error(payload.error || "모델 목록을 갱신하지 못했습니다.");
      setModelRegistry(payload.models ?? []);
      setModelStatus("온라인 모델 목록을 갱신했습니다.");
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : "모델 목록을 갱신하지 못했습니다.");
    }
  };

  const installLocalModel = async (model: ModelRegistryItem) => {
    if (!model.runtime) return;
    setModelStatus(`${model.id} 설치를 시작합니다.`);

    try {
      const response = await fetch(getApiUrl("/api/models/install"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime: model.runtime, model: model.id }),
      });
      const payload = (await response.json()) as { command?: string; error?: string; manual?: boolean; message?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "모델 설치에 실패했습니다.");
      if (payload.manual) {
        if (payload.command) void navigator.clipboard?.writeText(payload.command);
        setModelStatus(payload.message || "설치 명령을 복사했습니다.");
        return;
      }
      setModelStatus(`${model.id} 설치가 끝났습니다.`);
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : "모델 설치에 실패했습니다.");
    }
  };

  const loadHistoryEntry = (entry: HistoryEntry, segment?: LoopSegment) => {
    setUrl(entry.url);
    loadUrl(entry.url, segment);
  };

  const progressMax = Math.max(duration, 1);
  const progressValue = Math.min(Math.floor(currentTime), progressMax);

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_18%_0%,rgba(196,181,253,0.18),transparent_34rem),linear-gradient(145deg,#121116_0%,#191620_55%,#101015_100%)] p-3 text-stone-50 md:p-6 xl:p-8">
      <section
        className={`grid min-h-[calc(100dvh-24px)] min-w-0 gap-4 lg:h-[calc(100dvh-48px)] lg:min-h-0 xl:h-[calc(100dvh-64px)] ${
          showPanel ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]" : "lg:grid-cols-1"
        }`}
      >
        <section className="grid min-h-0 min-w-0 place-items-center">
          <div
            className={`relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl shadow-black/35 ${
              showPanel ? "max-w-[1180px]" : "max-w-[1500px]"
            } ${focusBackdrop ? "ring-8 ring-black/35" : ""}`}
          >
            <button
              className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-black/45 text-stone-200 backdrop-blur transition hover:bg-black/70"
              type="button"
              aria-label={showPanel ? "패널 접기" : "패널 열기"}
              onClick={() => setShowPanel((value) => !value)}
            >
              {showPanel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
            <>
              {!source ? (
                <motion.div
                  key="empty"
                  className="grid h-full place-items-center px-7 text-center text-stone-400"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <div>
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-violet-300/30 text-violet-300">
                      <Sparkles size={22} />
                    </div>
                    <h1 className="mt-5 text-5xl font-black tracking-normal text-stone-50 md:text-7xl">ContentDeck</h1>
                    <p className="mt-3 text-base">공유 링크를 넣으면 반복 재생 화면이 준비됩니다.</p>
                  </div>
                </motion.div>
              ) : source.platform === "youtube" ? (
	                <motion.div
	                  key={source.href}
	                  className={`h-full w-full ${mode === "native" ? "" : mirrorMode ? "-scale-x-100" : ""}`}
	                  initial={{ opacity: 0 }}
	                  animate={{ opacity: 1 }}
	                >
	                  {mode === "native" && nativeMedia ? (
	                    <video
	                      ref={videoRef}
	                      className={`h-full w-full bg-black transition duration-300 ${playerMediaClass} ${hiddenForRecall ? "opacity-10 blur-md" : ""}`}
	                      src={nativeMedia.mediaUrl}
	                      poster={nativeMedia.thumbnail || undefined}
	                      controls
	                      autoPlay
	                      playsInline
	                      onLoadedMetadata={(event) => {
	                        const nextDuration = Math.floor(event.currentTarget.duration || nativeMedia.duration || 0);
	                        event.currentTarget.playbackRate = playbackRate;
	                        setDuration(nextDuration);
	                        setEndTime((value) => value || (nextDuration > 0 ? formatTime(nextDuration) : ""));
	                      }}
	                      onTimeUpdate={(event) => {
	                        const video = event.currentTarget;
	                        if (segmentEnabled && activeEnd > activeStart && video.currentTime >= activeEnd - 0.15) {
	                          handleLoopCycle(
	                            () => {
	                              video.currentTime = activeStart;
	                            },
	                            () => void video.play(),
	                            () => video.pause(),
	                          );
	                          return;
	                        }

                        if (!isSeeking) {
                          setCurrentTime(video.currentTime);
                        }
	                      }}
	                      onEnded={(event) => {
	                        const video = event.currentTarget;
	                        handleLoopCycle(
	                          () => {
	                            video.currentTime = activeStart;
	                          },
	                          () => void video.play(),
	                          () => video.pause(),
	                        );
	                      }}
                      onError={() => {
                        setError("자체 플레이어가 미디어를 열지 못했습니다. 기본 플레이어로 전환합니다.");
                        void bootYouTube(source);
                      }}
                    />
	                  ) : mode === "embed" ? (
                    <iframe
                      title="YouTube player"
                      src={getYouTubeEmbedUrl(source)}
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  ) : (
                    <div id={mountId} className="h-full w-full" />
	                  )}
	                  {countOverlay && segmentEnabled ? (
	                    <div className="pointer-events-none absolute left-4 top-4 z-10 grid h-16 w-16 place-items-center rounded-lg border border-violet-200/30 bg-black/50 text-3xl font-black text-violet-100 backdrop-blur">
	                      {clamp(eightCount, 1, 8)}
	                    </div>
	                  ) : null}
	                  {hiddenForRecall ? (
	                    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/55 text-center">
	                      <div className="rounded-lg border border-violet-200/20 bg-black/45 px-5 py-4 backdrop-blur">
	                        <div className="text-sm font-black text-violet-100">기억 테스트</div>
	                        <div className="mt-1 text-xs text-stone-400">화면 없이 타이밍과 내용을 떠올려보세요.</div>
	                      </div>
	                    </div>
	                  ) : null}
	                </motion.div>
              ) : (
                <motion.div
                  id="external-player"
                  key={source.href}
                  className="grid h-full w-full place-items-center bg-black"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {source.platform === "x" ? (
                    <blockquote className="twitter-tweet" data-dnt="true">
                      <a href={source.href}> </a>
                    </blockquote>
                  ) : (
                    <blockquote className="tiktok-embed" cite={source.href} data-video-id={source.videoId}>
                      <section>
                        <a href={source.href}> </a>
                      </section>
                    </blockquote>
                  )}
                </motion.div>
              )}
            </>
          </div>
        </section>

        <aside className={`${showPanel ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#181922]/95 p-3 shadow-2xl shadow-black/35 backdrop-blur sm:p-4 lg:max-h-full`}>
          <form className="grid gap-3" onSubmit={handleSubmit}>
            <label className="flex items-center gap-2 text-sm font-bold text-stone-300" htmlFor="video-url">
              <Link2 size={16} />
              영상 주소
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                id="video-url"
                className="h-11 min-w-0 rounded-md border border-white/10 bg-[#101516] px-3 text-stone-50 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
                inputMode="url"
                autoComplete="off"
              />
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-violet-300 px-4 font-black text-violet-950 transition hover:bg-violet-400" type="submit">
                {mode === "loading" ? <LoaderCircle className="animate-spin" size={17} /> : <Play size={17} />}
                불러오기
              </button>
            </div>
          </form>

          <div className="mt-4 flex min-h-9 items-center gap-2 text-sm text-stone-400">
            <span className="inline-flex min-h-7 items-center rounded-full bg-violet-300/10 px-3 font-black text-violet-300">
              {platformLabel}
            </span>
            <span className="min-w-0 truncate">{nativeMedia?.title || statusText}</span>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-1 rounded-lg border border-white/10 bg-black/25 p-1">
            {[
              ["segment", "구간", SlidersHorizontal],
              ["playback", "재생", Gauge],
              ["workbench", "작업", Wand2],
              ["learning", "학습", BookOpen],
              ["history", "기록", History],
            ].map(([value, label, Icon]) => {
              const active = sidebarView === value;
              return (
                <button
                  key={String(value)}
                  className={`inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-black transition ${
                    active ? "bg-violet-300 text-violet-950" : "text-stone-400 hover:bg-white/10 hover:text-stone-100"
                  }`}
                  type="button"
                  onClick={() => setSidebarView(value as SidebarView)}
                >
                  <Icon size={14} />
                  <span className="truncate">{String(label)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {sidebarView === "segment" ? (
          <section className="mt-4 grid gap-4 rounded-lg border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-black">
                <SlidersHorizontal size={18} />
                반복 구간
              </h2>
              <label className="relative inline-flex items-center">
                <input
                  className="peer sr-only"
                  type="checkbox"
                  checked={segmentEnabled}
                  disabled={!youtubeControlsEnabled}
                  onChange={(event) => setSegmentEnabled(event.target.checked)}
                />
                <span className="h-7 w-12 rounded-full border border-white/10 bg-[#111617] transition peer-checked:border-violet-300/80 peer-checked:bg-violet-300/15 peer-disabled:opacity-45" />
                <span className="absolute left-1 h-[18px] w-[18px] rounded-full bg-stone-400 transition peer-checked:translate-x-5 peer-checked:bg-violet-300 peer-disabled:opacity-55" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-stone-300">
                시작
                <input
                  className="h-11 rounded-md border border-white/10 bg-[#101516] px-3 text-stone-50 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15 disabled:opacity-45"
                  value={startTime}
                  disabled={!youtubeControlsEnabled}
                  onChange={(event) => setStartTime(event.target.value)}
                  placeholder="00:00"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-stone-300">
                끝
                <input
                  className="h-11 rounded-md border border-white/10 bg-[#101516] px-3 text-stone-50 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15 disabled:opacity-45"
                  value={endTime}
                  disabled={!youtubeControlsEnabled}
                  onChange={(event) => setEndTime(event.target.value)}
                  placeholder="01:30"
                />
              </label>
            </div>

            <input
              className="accent-violet-300 disabled:opacity-45"
              type="range"
              min={0}
              max={progressMax}
              value={progressValue}
              disabled={!youtubeControlsEnabled}
              onChange={(event) => {
                setIsSeeking(true);
                setCurrentTime(Number(event.target.value));
              }}
              onPointerUp={(event) => {
                if (nativeControlsEnabled && videoRef.current) {
                  videoRef.current.currentTime = Number(event.currentTarget.value);
                } else {
                  playerRef.current?.seekTo(Number(event.currentTarget.value), true);
                }
                setIsSeeking(false);
              }}
            />
            <div className="relative h-4 rounded-full bg-black/35">
              <div className="absolute inset-x-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
              {duration > 0 && segmentEnabled && segmentValid ? (
                <div
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-violet-300/75 shadow-[0_0_18px_rgba(196,181,253,0.35)]"
                  style={{
                    left: `${timelineStartPercent}%`,
                    width: `${Math.max(timelineEndPercent - timelineStartPercent, 1)}%`,
                  }}
                />
              ) : null}
              {markers.map((marker) => (
                <button
                  key={marker}
                  className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-200"
                  style={{ left: `${duration > 0 ? clamp((marker / duration) * 100, 0, 100) : 0}%` }}
                  type="button"
                  aria-label={`마커 ${formatTime(marker)}`}
                  onClick={() => jumpToMarker(marker)}
                />
              ))}
              <div
                className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{ left: `${timelineCurrentPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-sm tabular-nums text-stone-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#20272a] text-sm font-black text-stone-100 transition hover:bg-[#283033] disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                disabled={!youtubeControlsEnabled}
                onClick={() => setSegmentBoundary("start")}
              >
                시작 찍기
              </button>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#20272a] text-sm font-black text-stone-100 transition hover:bg-[#283033] disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                disabled={!youtubeControlsEnabled}
                onClick={() => setSegmentBoundary("end")}
              >
                끝 찍기
              </button>
            </div>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-violet-300/30 bg-violet-300/15 text-sm font-black text-violet-100 transition hover:bg-violet-300/25 disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!youtubeControlsEnabled || !segmentEnabled || !segmentValid}
              onClick={saveCurrentSegment}
            >
              현재 구간 저장
            </button>
          </section>
          ) : null}

          {sidebarView === "playback" ? (
          <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#20272a] font-black text-stone-50 transition hover:bg-[#283033] disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!youtubeControlsEnabled}
              onClick={togglePlayback}
            >
              <Play size={17} />
              재생/일시정지
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#20272a] font-black text-stone-50 transition hover:bg-[#283033] disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!youtubeControlsEnabled}
              onClick={restart}
            >
              <RotateCcw size={17} />
              처음부터
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-black/20 text-sm font-black text-stone-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!youtubeControlsEnabled}
              onClick={() => seekRelative(-5)}
            >
              <StepBack size={16} />
              5초 뒤로
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-black/20 text-sm font-black text-stone-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!youtubeControlsEnabled}
              onClick={() => seekRelative(5)}
            >
              <StepForward size={16} />
              5초 앞으로
            </button>
          </div>

          <section className="mt-4 grid gap-4 rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-black">
                <Gauge size={18} />
                연습 모드
              </h2>
              <button
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-xs font-black text-stone-300 transition hover:bg-white/10"
                type="button"
                onClick={resetSession}
              >
                세션 초기화
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-white/10 bg-[#101516] px-2 py-2">
                <div className="text-[11px] font-bold text-stone-500">루프</div>
                <div className="mt-1 text-sm font-black tabular-nums text-stone-100">{loopCount}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-[#101516] px-2 py-2">
                <div className="text-[11px] font-bold text-stone-500">구간</div>
                <div className="mt-1 text-sm font-black tabular-nums text-stone-100">{formatTime(segmentLength)}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-[#101516] px-2 py-2">
                <div className="text-[11px] font-bold text-stone-500">남음</div>
                <div className="mt-1 text-sm font-black tabular-nums text-stone-100">{isResting ? `${restSeconds}s` : formatTime(remainingInSegment)}</div>
              </div>
            </div>

            <ControlGroup label="속도">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                <button
                  key={value}
                  className={pillClass(playbackRate === value)}
                  type="button"
                  disabled={!youtubeControlsEnabled}
                  onClick={() => setPlaybackRate(value)}
                >
                  {value}x
                </button>
              ))}
            </ControlGroup>

            <ControlGroup label="목표">
              {[
                [0, "∞"],
                [3, "3회"],
                [5, "5회"],
                [10, "10회"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={pillClass(repeatTarget === value)}
                  type="button"
                  disabled={!youtubeControlsEnabled}
                  onClick={() => {
                    resetSession();
                    setRepeatTarget(Number(value));
                  }}
                >
                  {label}
                </button>
              ))}
            </ControlGroup>

            <ControlGroup label="휴식">
              {[
                [0, "없음"],
                [2, "2초"],
                [5, "5초"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={pillClass(restSeconds === value)}
                  type="button"
                  disabled={!youtubeControlsEnabled}
                  onClick={() => setRestSeconds(Number(value))}
                >
                  {label}
                </button>
              ))}
            </ControlGroup>

            <div className="grid grid-cols-2 gap-2">
              <button className={pillClass(mirrorMode)} type="button" onClick={() => setMirrorMode((value) => !value)}>
                미러
              </button>
              <button className={pillClass(fitMode === "cover")} type="button" onClick={() => setFitMode((value) => (value === "contain" ? "cover" : "contain"))}>
                {fitMode === "contain" ? "맞춤" : "채움"}
              </button>
              <button className={pillClass(focusBackdrop)} type="button" onClick={() => setFocusBackdrop((value) => !value)}>
                {focusBackdrop ? <EyeOff size={14} /> : <Eye size={14} />}
                배경
              </button>
              <button className={pillClass(!showPanel)} type="button" onClick={() => setShowPanel((value) => !value)}>
                패널
              </button>
            </div>

            <div className="grid gap-2">
              <div className="grid grid-cols-4 gap-1">
                <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={() => nudgeSegment("start", -1)}>
                  S-1
                </button>
                <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={() => nudgeSegment("start", 1)}>
                  S+1
                </button>
                <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={() => nudgeSegment("end", -1)}>
                  E-1
                </button>
                <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={() => nudgeSegment("end", 1)}>
                  E+1
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#20272a] text-sm font-black text-stone-100 transition hover:bg-[#283033] disabled:cursor-not-allowed disabled:opacity-45"
                  type="button"
                  disabled={!youtubeControlsEnabled}
                  onClick={addMarker}
                >
                  <BookmarkPlus size={15} />
                  마커
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#20272a] text-sm font-black text-stone-100 transition hover:bg-[#283033] disabled:cursor-not-allowed disabled:opacity-45"
                  type="button"
                  disabled={!source || source.platform !== "youtube"}
                  onClick={copySegmentLink}
                >
                  <Copy size={15} />
                  링크
                </button>
              </div>
              {markers.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {markers.map((marker) => (
                    <span key={marker} className="inline-flex h-8 items-center overflow-hidden rounded-md border border-white/10 bg-[#101516]">
                      <button className="h-full px-2 text-xs font-black text-stone-200 transition hover:bg-white/10" type="button" onClick={() => jumpToMarker(marker)}>
                        {formatTime(marker)}
                      </button>
                      <button className="h-full px-2 text-xs font-black text-stone-500 transition hover:bg-red-400/10 hover:text-red-300" type="button" onClick={() => removeMarker(marker)}>
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
          </>
          ) : null}

          {sidebarView === "workbench" ? (
          <section className="mt-4 grid gap-4 rounded-lg border border-violet-300/15 bg-violet-300/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-black">
                <Wand2 size={18} />
                워크벤치
              </h2>
              <button
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-xs font-black text-stone-300 transition hover:bg-white/10"
                type="button"
                onClick={copyHistoryJson}
                disabled={history.length === 0}
              >
                JSON
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ["shadow", "쉐도잉"],
                ["precision", "정밀 분석"],
                ["memory", "암기"],
                ["review", "검토"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={pillClass(drillPreset === value)}
                  type="button"
                  onClick={() => applyDrillPreset(value as DrillPreset)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={() => splitCurrentRange(3)}>
                <Layers3 size={14} />
                3분할
              </button>
              <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={captureMoment}>
                순간 캡처
              </button>
              <button className={pillClass(false)} type="button" disabled={savedSegments.length === 0} onClick={pickRandomSegment}>
                <Dices size={14} />
                랜덤
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button className={pillClass(false)} type="button" disabled={savedSegments.length === 0} onClick={pickWeakSegment}>
                <Target size={14} />
                약점
              </button>
              <button className={pillClass(false)} type="button" disabled={!history.some((entry) => entry.segments.length > 0)} onClick={pickStaleSegment}>
                오래된 구간
              </button>
              <button className={pillClass(false)} type="button" disabled={!source} onClick={generatePracticeCard}>
                카드 복사
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button className={pillClass(false)} type="button" disabled={savedSegments.length === 0} onClick={pickNextSegment}>
                다음 구간
              </button>
              <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={() => useSegmentHalf("front")}>
                앞 절반
              </button>
              <button className={pillClass(false)} type="button" disabled={!youtubeControlsEnabled} onClick={() => useSegmentHalf("back")}>
                뒤 절반
              </button>
              <button className={pillClass(preRollSeconds > 0)} type="button" disabled={!youtubeControlsEnabled} onClick={() => setPreRollSeconds((value) => (value === 0 ? 2 : 0))}>
                프리롤 {preRollSeconds}s
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className={pillClass(blindMode)} type="button" disabled={!youtubeControlsEnabled} onClick={() => setBlindMode((value) => !value)}>
                <Moon size={14} />
                기억 테스트
              </button>
              <button className={pillClass(countOverlay)} type="button" disabled={!youtubeControlsEnabled} onClick={() => setCountOverlay((value) => !value)}>
                8카운트
              </button>
              <button className={pillClass(tempoLadder)} type="button" disabled={!youtubeControlsEnabled} onClick={() => setTempoLadder((value) => !value)}>
                속도 사다리
              </button>
              <button className={pillClass(shrinkMode)} type="button" disabled={!youtubeControlsEnabled} onClick={() => setShrinkMode((value) => !value)}>
                압축 루프
              </button>
              <button className={pillClass(contextExpandMode)} type="button" disabled={!youtubeControlsEnabled} onClick={() => setContextExpandMode((value) => !value)}>
                맥락 확장
              </button>
            </div>

            <div className="grid gap-2">
              <label className="grid gap-1 text-xs font-black text-stone-500">
                구간 이름
                <input
                  className="h-9 rounded-md border border-white/10 bg-[#101516] px-3 text-sm text-stone-100 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15"
                  value={segmentDraftLabel}
                  onChange={(event) => setSegmentDraftLabel(event.target.value)}
                  placeholder="예: 후렴 손동작"
                  disabled={!youtubeControlsEnabled}
                />
              </label>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-xs font-black text-stone-500">
                <span>숙련도</span>
                <input
                  className="accent-violet-300"
                  type="range"
                  min={1}
                  max={5}
                  value={segmentScore}
                  onChange={(event) => setSegmentScore(Number(event.target.value))}
                />
                <span className="text-violet-200">{segmentScore}/5</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[
                  ["free", "자유"],
                  ["move", "동작"],
                  ["pronunciation", "발음"],
                  ["memory", "암기"],
                  ["analysis", "분석"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={pillClass(segmentIntent === value)}
                    type="button"
                    onClick={() => setSegmentIntent(value as SegmentIntent)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                className="h-9 rounded-md border border-white/10 bg-[#101516] px-3 text-sm text-stone-100 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15"
                value={coachPrompt}
                onChange={(event) => setCoachPrompt(event.target.value)}
                placeholder="이번 구간에서 확인할 질문"
              />
              {activeSavedSegment ? (
                <div className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-2 text-xs font-black text-stone-400">
                    <span className="truncate">{activeSavedSegment.label}</span>
                    <span className="text-violet-200">{activeSavedSegment.score}/5</span>
                  </div>
                  <input
                    className="accent-violet-300"
                    type="range"
                    min={1}
                    max={5}
                    value={activeSavedSegment.score}
                    onChange={(event) => updateSegmentScore(activeSavedSegment.id, Number(event.target.value))}
                  />
                </div>
              ) : null}
            </div>

            <label className="grid gap-1 text-xs font-black text-stone-500">
              영상 메모
              <textarea
                className="min-h-20 resize-y rounded-md border border-white/10 bg-[#101516] px-3 py-2 text-sm font-medium text-stone-100 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15"
                value={videoNote}
                onChange={(event) => updateVideoNote(event.target.value)}
                placeholder="관찰 포인트, 연습 목표, 다음에 볼 지점"
                disabled={!source}
              />
            </label>

            <div className="h-2 overflow-hidden rounded-full bg-black/30">
              <div className="h-full rounded-full bg-violet-300 transition-all" style={{ width: `${sessionProgress}%` }} />
            </div>
            {sessionEvents.length > 0 ? (
              <div className="grid gap-1 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-stone-500">
                {sessionEvents.map((event) => (
                  <div key={event} className="truncate">
                    {event}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          ) : null}

          {sidebarView === "learning" ? (
          <section className="mt-4 grid gap-4 rounded-lg border border-violet-300/15 bg-violet-300/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-black">
                <Languages size={18} />
                학습
              </h2>
              <button
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-violet-300/30 bg-violet-300/15 px-3 text-xs font-black text-violet-100 transition hover:bg-violet-300/25 disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={analyzeLearning}
                disabled={learningLoading}
              >
                {learningLoading ? <LoaderCircle className="animate-spin" size={14} /> : <BookOpen size={14} />}
                분석
              </button>
            </div>

            <ControlGroup label="원어">
              {[
                ["auto", "자동"],
                ["en", "English"],
                ["ja", "日本語"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={pillClass(learningSourceLanguage === value)}
                  type="button"
                  onClick={() => setLearningSourceLanguage(value as "auto" | "en" | "ja")}
                >
                  {label}
                </button>
              ))}
            </ControlGroup>

            {learningError ? <p className="rounded-md border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{learningError}</p> : null}

            {learningAnalysis ? (
              <>
                <div className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="text-sm font-black text-stone-100">{learningAnalysis.title}</div>
                  <div className="flex flex-wrap gap-1 text-[11px] font-black text-stone-400">
                    <span className="rounded bg-white/10 px-2 py-1">원어 {learningAnalysis.hasNativeTrack ? "확인" : "없음"}</span>
                    <span className="rounded bg-white/10 px-2 py-1">한국어 {learningAnalysis.hasKoreanTrack ? "확인" : "없음"}</span>
                    <span className="rounded bg-white/10 px-2 py-1">{learningAnalysis.subtitles.length} lines</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="text-xs font-black text-stone-500">자막</div>
                  <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                    {learningAnalysis.subtitles.slice(0, 80).map((line) => (
                      <button
                        key={`${line.start}-${line.end}-${line.native}`}
                        className="grid gap-1 rounded-md border border-white/10 bg-[#101516] px-3 py-2 text-left transition hover:border-violet-300/40"
                        type="button"
                        onClick={() => jumpToMarker(line.start)}
                      >
                        <span className="text-[11px] font-black tabular-nums text-violet-200">{formatTime(line.start)}</span>
                        {line.ko ? <span className="text-sm font-bold text-stone-100">{line.ko}</span> : null}
                        <span className="text-sm text-stone-400">{line.native}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="text-xs font-black text-stone-500">주요 단어/표현</div>
                  <div className="flex flex-wrap gap-1">
                    {learningAnalysis.vocabulary.slice(0, 18).map((item) => (
                      <span key={item.term} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-black text-stone-200">
                        {item.term} · {item.count}
                      </span>
                    ))}
                    {learningAnalysis.phrases.slice(0, 8).map((item) => (
                      <span key={item.phrase} className="rounded-md border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-xs font-black text-violet-100">
                        {item.phrase}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="text-xs font-black text-stone-500">테스트</div>
                  {learningAnalysis.quiz.length > 0 ? (
                    learningAnalysis.quiz.map((quiz) => (
                      <div key={quiz.id} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-black text-violet-200">{formatTime(quiz.time)}</div>
                        <div className="text-sm font-bold text-stone-100">{quiz.prompt}</div>
                        <div className="text-sm text-stone-400">{quiz.hint}</div>
                        {revealedQuiz[quiz.id] ? <div className="rounded bg-[#101516] px-2 py-2 text-sm text-stone-100">{quiz.answer}</div> : null}
                        <button className={pillClass(Boolean(revealedQuiz[quiz.id]))} type="button" onClick={() => setRevealedQuiz((items) => ({ ...items, [quiz.id]: !items[quiz.id] }))}>
                          정답 {revealedQuiz[quiz.id] ? "숨기기" : "보기"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-stone-500">테스트를 만들 자막 문장이 부족합니다.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-stone-500">
                영상 주소를 넣고 분석을 누르면 한국어/원어 자막, 주요 표현, 테스트가 이곳에 준비됩니다.
              </p>
            )}

            <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-stone-200">
                <Brain size={16} />
                로컬 AI 모델
              </h3>
              <label className="grid gap-1 text-xs font-black text-stone-500">
                장비
                <input
                  className="h-9 rounded-md border border-white/10 bg-[#101516] px-3 text-sm text-stone-100 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15"
                  value={hardwareConfig.machine}
                  onChange={(event) => setHardwareConfig((config) => ({ ...config, machine: event.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-black text-stone-500">
                  메모리 GB
                  <input
                    className="h-9 rounded-md border border-white/10 bg-[#101516] px-3 text-sm text-stone-100 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15"
                    type="number"
                    value={hardwareConfig.memoryGb}
                    onChange={(event) => setHardwareConfig((config) => ({ ...config, memoryGb: Number(event.target.value) }))}
                  />
                </label>
                <label className="grid gap-1 text-xs font-black text-stone-500">
                  저장공간 GB
                  <input
                    className="h-9 rounded-md border border-white/10 bg-[#101516] px-3 text-sm text-stone-100 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-300/15"
                    type="number"
                    value={hardwareConfig.storageGb}
                    onChange={(event) => setHardwareConfig((config) => ({ ...config, storageGb: Number(event.target.value) }))}
                  />
                </label>
              </div>
              <button className={pillClass(hardwareConfig.preferSpeed)} type="button" onClick={() => setHardwareConfig((config) => ({ ...config, preferSpeed: !config.preferSpeed }))}>
                {hardwareConfig.preferSpeed ? "속도 우선" : "품질 우선"}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className={pillClass(false)} type="button" onClick={saveLearningConfig}>추천 저장</button>
                <button className={pillClass(false)} type="button" onClick={refreshLiveModels}>모델 갱신</button>
              </div>
              {modelRecommendation ? (
                <div className="grid gap-1 rounded-md border border-white/10 bg-[#101516] p-2 text-xs text-stone-400">
                  <div>자막: <span className="font-black text-stone-100">{modelRecommendation.transcription}</span></div>
                  <div>표현: <span className="font-black text-stone-100">{modelRecommendation.extraction}</span></div>
                  <div>퀴즈: <span className="font-black text-stone-100">{modelRecommendation.quiz}</span></div>
                  <div className="text-stone-500">{modelRecommendation.reason}</div>
                </div>
              ) : null}
              {modelStatus ? <p className="text-xs text-stone-400">{modelStatus}</p> : null}
              <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
                {modelRegistry.slice(0, 10).map((model) => (
                  <div key={model.id} className="grid gap-2 rounded-md border border-white/10 bg-[#101516] p-2">
                    <div className="min-w-0 truncate text-xs font-black text-stone-100">{model.id}</div>
                    <div className="text-[11px] text-stone-500">{model.role || model.runtime || "online"} {model.size ? `· ${model.size}` : ""}</div>
                    {model.runtime ? (
                      <button className={pillClass(false)} type="button" onClick={() => installLocalModel(model)}>
                        설치/명령
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
          ) : null}

          <p className={`mt-4 min-h-6 text-sm leading-6 ${error ? "text-red-300" : "text-stone-400"}`}>
            {error || message || (
              <span className="inline-flex items-center gap-2">
                <BadgeInfo size={15} />
                <span>시간은 초, mm:ss, hh:mm:ss 형식으로 입력할 수 있습니다.</span>
              </span>
            )}
          </p>

          {sidebarView === "history" ? (
          <>
          <section className="mt-4 border-t border-white/10 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-black text-stone-200">
                <History size={16} />
                히스토리
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500">
                  {visibleHistory.length}/{history.length || maxHistoryItems}
                </span>
                {history.length > 0 ? (
                  <button
                    className="grid h-7 w-7 place-items-center rounded-md text-stone-500 transition hover:bg-red-400/10 hover:text-red-300"
                    type="button"
                    aria-label="히스토리 전체 삭제"
                    onClick={clearHistory}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </div>
            {history.length > 0 ? (
              <>
                <label className="mb-2 grid h-10 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-white/10 bg-[#101516] px-3 text-stone-400">
                  <Search size={15} />
                  <input
                    className="min-w-0 bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-600"
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="제목이나 URL 검색"
                  />
                </label>
                <div className="mb-3 grid grid-cols-4 gap-1 rounded-md bg-black/20 p-1">
                  {[
                    ["all", "전체"],
                    ["youtube", "YT"],
                    ["x", "X"],
                    ["tiktok", "TT"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`h-8 rounded text-xs font-black transition ${
                        historyFilter === value ? "bg-violet-300 text-violet-950" : "text-stone-400 hover:bg-white/10"
                      }`}
                      type="button"
                      onClick={() => setHistoryFilter(value as HistoryFilter)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {visibleHistory.length > 0 ? (
                  <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                    {visibleHistory.map((entry) => (
                  <div
                    key={entry.key}
                    className={`group grid gap-2 rounded-md border px-3 py-2 text-left transition ${
                      entry.key === sourceKey
                        ? "border-violet-300/45 bg-violet-300/10"
                        : "border-white/10 bg-black/20 hover:bg-white/10"
                    }`}
                  >
                    <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                      <div className="h-10 w-16 overflow-hidden rounded bg-black/40">
                        {entry.thumbnail ? (
                          <img className="h-full w-full object-cover" src={entry.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-[10px] font-black text-stone-600">
                            {entry.label}
                          </div>
                        )}
                      </div>
                      <button className="min-w-0 text-left" type="button" onClick={() => loadHistoryEntry(entry)}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-black text-stone-300">
                            {entry.label}
                          </span>
                          <span className="truncate text-sm font-bold text-stone-100">{entry.title || entry.url}</span>
                        </span>
                        <span className="mt-1 block truncate text-xs text-stone-500">
                          {formatHistorySegment(entry)}
                        </span>
                      </button>
                      <button
                        className="grid h-8 w-8 place-items-center rounded-md text-stone-500 transition hover:bg-red-400/10 hover:text-red-300"
                        type="button"
                        aria-label="히스토리 삭제"
                        onClick={() => {
                          removeHistory(entry.key);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {entry.segments.length > 0 ? (
                      <div className="flex flex-wrap gap-1 pl-[76px]">
                        {entry.segments.map((segment) => (
                          <span
                            key={segment.id}
                            className={`inline-flex h-7 max-w-full items-center overflow-hidden rounded-md border text-[11px] font-black ${
                              entry.activeSegmentId === segment.id
                                ? "border-violet-300/60 bg-violet-300/20 text-violet-100"
                                : "border-white/10 bg-black/25 text-stone-400"
                            }`}
                          >
                            <button className="h-full max-w-[150px] truncate px-2" type="button" onClick={() => loadHistoryEntry(entry, segment)}>
                              {segment.label} · {segment.score}/5
                            </button>
                            <button
                              className="h-full px-2 text-stone-500 transition hover:bg-red-400/10 hover:text-red-300"
                              type="button"
                              aria-label="저장 구간 삭제"
                              onClick={() => removeSavedSegment(entry.key, segment.id)}
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-stone-500">
                    조건에 맞는 히스토리가 없습니다.
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-stone-500">
                불러온 영상이 여기에 저장됩니다.
              </p>
            )}
          </section>

          {source ? (
            <a
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-white/10 bg-black/20 text-sm font-black text-stone-200 transition hover:bg-white/10"
              href={source.href}
              target="_blank"
              rel="noreferrer"
            >
              원본 열기
            </a>
          ) : null}

          <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4 text-xs font-bold text-stone-500">
            <Clock3 size={14} />
            <span>React 19 · Vite 8 · Tailwind CSS 4 · TypeScript</span>
          </div>
          </>
          ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

function ControlGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-2">
      <div className="text-xs font-black text-stone-500">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function pillClass(active: boolean): string {
  return `inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${
    active
      ? "border-violet-300/70 bg-violet-300 text-violet-950"
      : "border-white/10 bg-[#20272a] text-stone-300 hover:bg-[#283033]"
  }`;
}

function getYouTubeEmbedUrl(source: Extract<VideoSource, { platform: "youtube" }>): string {
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "1",
    playsinline: "1",
    rel: "0",
    loop: "1",
    playlist: source.videoId,
    start: String(source.startSeconds || 0),
    origin: window.location.origin,
  });

  return `https://www.youtube.com/embed/${encodeURIComponent(source.videoId)}?${params.toString()}`;
}

function getApiUrl(path: string): string {
  const apiBase = new URLSearchParams(window.location.search).get("apiBase");
  if (apiBase) {
    return `${apiBase.replace(/\/$/, "")}${path}`;
  }

  if (window.location.protocol === "file:") {
    return `http://127.0.0.1:18787${path}`;
  }

  return path;
}

function readHistory(): HistoryEntry[] {
  if (!("localStorage" in window)) return [];

  try {
    const raw = window.localStorage.getItem(historyStorageKey);
    if (!raw) return [];

    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];

    return value.map(normalizeHistoryEntry).filter((entry): entry is HistoryEntry => Boolean(entry)).slice(0, maxHistoryItems);
  } catch {
    return [];
  }
}

function writeHistory(items: HistoryEntry[]) {
  if (!("localStorage" in window)) return;

  try {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(items));
  } catch {
    // Storage can be unavailable in locked-down browser contexts.
  }
}

function normalizeHistoryEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<HistoryEntry>;
  if (typeof item.key !== "string" || typeof item.url !== "string") return null;
  if (item.platform !== "youtube" && item.platform !== "x" && item.platform !== "tiktok") return null;
  const segment = {
    enabled: Boolean(item.segment?.enabled),
    start:
      typeof item.segment?.start === "number" && Number.isFinite(item.segment.start)
        ? Math.max(0, Math.floor(item.segment.start))
        : 0,
    end:
      typeof item.segment?.end === "number" && Number.isFinite(item.segment.end)
        ? Math.max(0, Math.floor(item.segment.end))
        : 0,
  };
  const normalizedSegments = Array.isArray(item.segments)
    ? item.segments.map(normalizeLoopSegment).filter((entry): entry is LoopSegment => Boolean(entry)).slice(0, 12)
    : [];
  const migratedSegments =
    normalizedSegments.length === 0 && segment.enabled && segment.end > segment.start
      ? [
          {
            id: createId(),
            label: `${formatTime(segment.start)} - ${formatTime(segment.end)}`,
            start: segment.start,
            end: segment.end,
            updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
            score: 3,
            note: "",
          },
        ]
      : normalizedSegments;

  return {
    key: item.key,
    url: item.url,
    platform: item.platform,
    label: typeof item.label === "string" ? item.label : platformToLabel(item.platform),
    title: typeof item.title === "string" ? item.title : item.url,
    thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : "",
    duration: typeof item.duration === "number" && Number.isFinite(item.duration) ? Math.max(0, Math.floor(item.duration)) : 0,
    updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
    segment,
    activeSegmentId: typeof item.activeSegmentId === "string" ? item.activeSegmentId : migratedSegments[0]?.id ?? "",
    segments: migratedSegments,
    note: typeof item.note === "string" ? item.note : "",
  };
}

function normalizeLoopSegment(value: unknown): LoopSegment | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<LoopSegment>;
  if (typeof item.start !== "number" || typeof item.end !== "number") return null;
  if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end <= item.start) return null;

  const start = Math.max(0, Math.floor(item.start));
  const end = Math.max(start + 1, Math.floor(item.end));
  return {
    id: typeof item.id === "string" ? item.id : createId(),
    label: typeof item.label === "string" ? item.label : `${formatTime(start)} - ${formatTime(end)}`,
    start,
    end,
    updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
    score: typeof item.score === "number" && Number.isFinite(item.score) ? clamp(Math.floor(item.score), 1, 5) : 3,
    note: typeof item.note === "string" ? item.note : "",
  };
}

function getSourceKey(source: VideoSource): string {
  if (source.platform === "youtube") return `youtube:${source.videoId}`;
  if (source.platform === "x") return `x:${source.statusId}`;
  return source.videoId ? `tiktok:${source.videoId}` : `tiktok:${source.href}`;
}

function createHistoryEntry(
  source: VideoSource,
  items: HistoryEntry[],
  metadata: Partial<Pick<HistoryEntry, "duration" | "thumbnail" | "title" | "url">> = {},
): HistoryEntry {
  const key = getSourceKey(source);
  const existing = items.find((item) => item.key === key);
  const duration = Math.max(0, Math.floor(metadata.duration ?? existing?.duration ?? 0));
  const existingSegment = existing?.segment;
  const segment = existingSegment
    ? {
        enabled: existingSegment.enabled,
        start: existingSegment.start,
        end: existingSegment.end || duration,
      }
    : {
        enabled: false,
        start: source.platform === "youtube" ? source.startSeconds : 0,
        end: duration,
      };

  return {
    key,
    url: metadata.url || existing?.url || source.href,
    platform: source.platform,
    label: source.label,
    title: metadata.title || existing?.title || getFallbackTitle(source),
    thumbnail: metadata.thumbnail || existing?.thumbnail || "",
    duration,
    updatedAt: Date.now(),
    segment,
    activeSegmentId: existing?.activeSegmentId ?? "",
    segments: existing?.segments ?? [],
    note: existing?.note ?? "",
  };
}

function getFallbackTitle(source: VideoSource): string {
  if (source.platform === "youtube") return `YouTube ${source.videoId}`;
  if (source.platform === "x") return `X ${source.statusId}`;
  return source.videoId ? `TikTok ${source.videoId}` : "TikTok";
}

function platformToLabel(platform: HistoryEntry["platform"]): HistoryEntry["label"] {
  if (platform === "youtube") return "YouTube";
  if (platform === "x") return "X";
  return "TikTok";
}

function formatHistorySegment(entry: HistoryEntry): string {
  if (entry.platform !== "youtube") return "내장 플레이어";
  if (entry.segment.enabled && entry.segment.end > entry.segment.start) {
    return `${formatTime(entry.segment.start)} - ${formatTime(entry.segment.end)} 저장됨`;
  }
  if (entry.duration > 0) return `전체 반복 · ${formatTime(entry.duration)}`;
  return "전체 반복";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadXEmbedScript(onReady: () => void) {
  if (window.twttr?.widgets) {
    onReady();
    return;
  }

  const existing = document.querySelector<HTMLScriptElement>('script[src="https://platform.twitter.com/widgets.js"]');
  if (existing) {
    existing.addEventListener("load", onReady, { once: true });
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://platform.twitter.com/widgets.js";
  script.charset = "utf-8";
  script.addEventListener("load", onReady, { once: true });
  document.body.appendChild(script);
}
