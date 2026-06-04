export type Platform = "youtube" | "x" | "tiktok";

export type VideoSource =
  | {
      platform: "youtube";
      label: "YouTube";
      href: string;
      videoId: string;
      startSeconds: number;
    }
  | {
      platform: "x";
      label: "X";
      href: string;
      statusId: string;
    }
  | {
      platform: "tiktok";
      label: "TikTok";
      href: string;
      videoId: string;
    };

export type YoutubePlayerState = {
  PLAYING: number;
  ENDED: number;
};

export type YoutubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate?: (rate: number) => void;
};

export type YoutubeEvent = {
  target: YoutubePlayer;
  data?: number;
};

export type YoutubePlayerCtor = new (
  elementId: string,
  options: {
    width: string;
    height: string;
    videoId: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: YoutubeEvent) => void;
      onStateChange: (event: YoutubeEvent) => void;
      onError?: (event: YoutubeEvent) => void;
    };
    host?: string;
  },
) => YoutubePlayer;

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: {
      Player: YoutubePlayerCtor;
      PlayerState: YoutubePlayerState;
    };
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement | null) => void;
      };
    };
  }
}
