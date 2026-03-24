# AGENTS.md

## Identity

- This repo is `Vortex`, a fork of `T3 Code`.
- `origin` is `extorsio/Vortex`; `upstream` is `pingdotgg/t3code`.
- If code or docs still say `T3 Code`, treat that as upstream naming, not a different product.

## Completion Rules

- Before finishing, run `bun fmt`, `bun lint`, and `bun typecheck`.
- Never run `bun test`; always use `bun run test`.
- For desktop changes, also run `bun run smoke-test` inside `apps/desktop`.

## Product Snapshot

- Vortex is a web/desktop GUI for coding agents like Codex and Claude.
- Core priorities: performance, reliability, and predictable behavior under failures/reconnects.
- Prefer maintainable changes; extract shared logic instead of duplicating local fixes.

## Package Roles

- `apps/server`: WebSocket server, Codex app-server broker, session/runtime orchestration.
- `apps/web`: React/Vite client, conversation UX, state projection, desktop-aware UI.
- `apps/desktop`: Electron shell, preload bridge, native desktop integrations.
- `packages/contracts`: schema/types only; shared IPC, WS, orchestration contracts.
- `packages/shared`: shared runtime utilities via explicit subpath exports.

## Codex-First Notes

- The server runs `codex app-server` per provider session over JSON-RPC over stdio.
- Key files: `apps/server/src/codexAppServerManager.ts`, `providerManager.ts`, `wsServer.ts`.
- The web app consumes orchestration events from `orchestration.domainEvent`.

## Fork-Specific Changes Already Landed

- Desktop now has an integrated browser preview docked on the right side of chat.
- This feature is desktop-only in v1 and is user-facing only; agent browser control is not wired yet.
- Use Electron `WebContentsView`, not WebView2, `iframe`, or Electron `webview`.
- Future agent control should prefer a Playwright-compatible tool layer.

## Browser Preview Map

- `apps/desktop/src/previewBrowserController.ts`: owns `WebContentsView`, state, bounds, URL safety.
- `apps/desktop/src/main.ts` and `preload.ts`: IPC handlers and `desktopBridge.browserPreview`.
- `packages/contracts/src/ipc.ts`: `BrowserPreview*` contracts.
- `apps/web/src/wsNativeApi.ts`: renderer bridge for browser preview actions/state.
- `apps/web/src/components/chat/BrowserPreviewPanel.tsx`: toolbar, URL bar, resize handle, layout sync.
- `apps/web/src/components/chat/ChatHeader.tsx` and `apps/web/src/components/ChatView.tsx`: toggle/open logic.
- `apps/web/src/browserPreview.ts`, `browserPreviewStore.ts`, `routes/__root.tsx`: detect preview URLs from assistant messages and terminal output.

## Browser Preview Behavior

- Prefer the latest thread URL in this order: `localhost`, `127.0.0.1`, then other `http(s)`.
- Allow only `http:` and `https:` in v1.
- Use a persistent Electron session partition per workspace so cookies/login survive restarts.
- Block unsafe new windows/downloads; external navigation goes through Electron shell rules.
- DevTools should not auto-open unless `T3CODE_DESKTOP_OPEN_DEVTOOLS=1`.

## Important Gotcha

- Be careful with Zustand selectors in preview-related React code.
- Returning fresh arrays/objects from selectors can trigger `Maximum update depth exceeded`.
- Prefer stable empty constants or shallow-safe selectors.
