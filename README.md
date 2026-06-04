# ContentDeck

여러 플랫폼의 공유 링크를 넣어 반복 재생, 구간 반복, 자막 기반 학습 화면을 준비하는 Vite 기반 웹 앱입니다. 지원 플랫폼별 링크는 전체 반복과 구간 반복 또는 공식 임베드 플레이어로 표시합니다.

## Stack

- Vite 8
- React 19
- TypeScript
- Tailwind CSS 4
- Motion
- Lucide React
- Zod

## Local

```sh
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173/`을 엽니다.

## Commands

```sh
npm run dev
npm run build
npm run preview
```

## macOS Local App

웹 버전은 그대로 유지하고, 로컬용 Electron 앱은 별도 명령으로 실행합니다.

```sh
npm run app:dev
```

패키지된 `.app`을 만들려면 아래 명령을 사용합니다.

```sh
npm run app:pack
```

생성 위치:

```text
dist-mac/mac-arm64/ContentDeck.app
```

로컬용 앱은 `bin/yt-dlp_macos`, `.venv/bin/yt-dlp`, 또는 시스템 `yt-dlp`를 순서대로 찾아 미디어 정보를 해석합니다. 대용량 실행 파일은 저장소에 포함하지 않으므로, 앱 번들에 직접 포함하려면 로컬에서 `bin/yt-dlp_macos`를 별도로 배치하세요.

## 지원 링크

- YouTube: `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, `youtube.com/embed/...`, `youtube.com/live/...`
- X: `x.com/{user}/status/{id}`, `twitter.com/{user}/status/{id}`
- TikTok: `tiktok.com/@{user}/video/{id}`, `vm.tiktok.com/...`, `vt.tiktok.com/...`
