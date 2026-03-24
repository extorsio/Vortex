# AGENTS.md

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

T3 Code is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.

## Codex App Server (Important)

T3 Code is currently Codex-first. The server starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Desktop Browser Preview

The desktop app now includes an integrated browser preview panel docked on the right side of the chat UI. This feature is desktop-only in v1.

Implementation decisions:

- Use Electron `WebContentsView` for the embedded browser surface.
- Do NOT use WebView2 as the base implementation. This repo already runs on Electron and needs a cross-platform solution.
- Do NOT use `iframe`/embedded remote web content inside the React tree for this feature. The real browser surface is created by Electron and positioned over the reserved UI area.
- The current preview feature is user-facing only. It is intentionally not wired into agent tools yet.
- If browser control for agents is added later, prefer a Playwright-compatible tool layer instead of baking automation logic into the preview UI.

Architecture overview:

- `apps/desktop/src/previewBrowserController.ts`: owns the lifecycle of the Electron `WebContentsView`, preview state, bounds syncing, URL validation, and security restrictions.
- `apps/desktop/src/main.ts`: creates the controller, wires IPC handlers, and forwards browser preview state events to the renderer.
- `apps/desktop/src/preload.ts`: exposes the desktop bridge methods under `desktopBridge.browserPreview`.
- `packages/contracts/src/ipc.ts`: shared contract for `BrowserPreviewBounds`, `BrowserPreviewState`, `BrowserPreviewStatus`, and the browser preview desktop/native APIs.
- `apps/web/src/wsNativeApi.ts`: exposes the browser preview API to the web app and manages renderer-side state subscriptions.
- `apps/web/src/components/chat/BrowserPreviewPanel.tsx`: right-hand UI panel with toolbar, address bar, resize handle, and bounds syncing back to Electron.
- `apps/web/src/components/chat/ChatHeader.tsx`: entry point for toggling the browser panel from the chat header.
- `apps/web/src/components/ChatView.tsx`: coordinates preview open/close state, selected thread context, and initial URL selection.
- `apps/web/src/browserPreview.ts`: shared URL extraction and prioritization logic for preview candidates.
- `apps/web/src/browserPreviewStore.ts`: stores preview URL observations collected from thread terminal output/history.
- `apps/web/src/routes/__root.tsx`: feeds terminal events into the preview URL observation store.

Current UX behavior:

- The browser panel is shown from a `Browser` button in the chat header.
- The preview prefers the latest localhost/dev URL seen in the active thread.
- URL priority is: `localhost`, then `127.0.0.1`, then other `http(s)` URLs.
- If no URL is detected, the panel opens empty and the user can type one manually.
- Preview state includes `open`, `url`, `title`, `loading`, `canGoBack`, `canGoForward`, and `lastError`.
- The preview uses a dedicated persistent Electron session partition per workspace so cookies/login state survive restarts.

Security and platform notes:

- Only `http:` and `https:` URLs are allowed in v1.
- New windows and downloads are restricted; external navigation uses Electron shell opening rules.
- Keep `nodeIntegration` disabled and `contextIsolation` enabled for desktop surfaces.
- DevTools should not auto-open during normal development. The current behavior is gated behind `T3CODE_DESKTOP_OPEN_DEVTOOLS=1`.

Testing notes:

- Browser preview logic has coverage in `apps/desktop/src/previewBrowserController.test.ts`, `apps/web/src/browserPreview.test.ts`, and `apps/web/src/wsNativeApi.test.ts`.
- When validating desktop changes, use `bun run smoke-test` in `apps/desktop` in addition to the repo-wide `bun fmt`, `bun lint`, and `bun typecheck`.

Known implementation gotcha:

- Be careful with Zustand selectors in preview-related React code. Returning a fresh array/object from a selector can trigger React `Maximum update depth exceeded` loops. Prefer stable empty constants or shallow-safe selectors where appropriate.
