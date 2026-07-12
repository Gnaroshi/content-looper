# ContentDeck showcase

Run `npm run showcase:dev` for the web renderer or `npm run showcase:electron` for Electron. The fixture uses a generated local MP4 with original synthetic audio, makes no network request, and keeps history outside the normal app flow because `ShowcaseApp` is mounted only by `VITE_GNAROSHI_SHOWCASE=1`.

Use `?step=player`, `?step=segment`, and `?step=loop`; add `&theme=light` for light verification. `npm run test:showcase` proves normal execution does not load the fixture.
