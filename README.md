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
npm test
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

외부 미디어 입력은 HTTPS만 허용합니다.

## Studio integration

ContentDeck는 독립 실행 앱이며 재생, 자막, 루프, 기록의 소유권을 유지합니다. Studio는 `gnaroshi.app.json`과 아래의 읽기 전용 명령을 통해 설치 상태와 비민감 요약만 확인합니다.

```sh
contentdeck status --json
contentdeck sessions recent --json --limit 10
contentdeck --version
```

패키지된 앱은 manifest와 CLI contract module을 `Contents/Resources/`에도 함께 배포합니다. 시스템 Node.js가 있는 로컬 환경에서는 `Contents/Resources/bin/contentdeck.mjs`를 고정 CLI entrypoint로 사용할 수 있습니다.

미디어 전달은 `contentdeck://open?url=<encoded-https-url>`, 최근 세션 재개는 `contentdeck://session/<opaque-id>`를 사용합니다. Studio는 ContentDeck의 localStorage, 설정 파일, Fastify API에 직접 접근하지 않습니다.

저장소 및 integration ID는 `content-looper`, 제품 표시 이름은 `ContentDeck`입니다. 저장소 이름 변경은 링크와 릴리스 호환성을 검토한 뒤 소유자가 별도로 결정합니다.
