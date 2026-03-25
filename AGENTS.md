# AGENTS.md

## Identity

- This repo is `Vortex`, a fork of `T3 Code`.
- `origin` = `extorsio/Vortex`; `upstream` = `pingdotgg/t3code`.
- If code/docs still say `T3 Code`, treat that as upstream naming.
- Use `main` as the source of truth; keep `funciones` aligned to `main` after shared changes.

## Completion Rules

- Before finishing, run `bun fmt`, `bun lint`, and `bun typecheck`.
- Never run `bun test`; always use `bun run test`.
- For merges or infra-sensitive changes, also run `bun run test` at repo root.
- For desktop changes, also run `bun run smoke-test` inside `apps/desktop`.

## Product Snapshot

- Vortex is a web/desktop GUI for coding agents like Codex and Claude.
- Priorities: performance, reliability, predictable behavior under failures/reconnects.
- Prefer maintainable changes; extract shared logic instead of duplicating local fixes.

## Package Roles

- `apps/server`: WebSocket server, Codex app-server broker, orchestration/runtime backend.
- `apps/web`: React/Vite client, conversation UX, state projection, desktop-aware UI.
- `apps/desktop`: Electron shell, preload bridge, native desktop integrations.
- `packages/contracts`: schema/types only; shared IPC, WS, orchestration contracts.
- `packages/shared`: shared runtime utilities via explicit subpath exports.

## Fork-Specific Changes

- Desktop includes an integrated browser preview docked on the right side of chat.
- The preview is desktop-only in v1 and is user-facing only; agent browser control is not wired yet.
- Use Electron `WebContentsView`, not WebView2, `iframe`, or Electron `webview`.
- Browser preview now supports manual `Add to chat` element selection with screenshot + DOM/accessibility/CSS context.
- Browser element context is still desktop-only and manual-only; there is still no MCP/Playwright agent control wired yet.
- Key preview files: `apps/desktop/src/previewBrowserController.ts`, `apps/desktop/src/browserSelectionOverlay.ts`, `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/web/src/components/chat/BrowserPreviewPanel.tsx`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, `apps/web/src/browserElementContext.ts`, `apps/web/src/composerDraftStore.ts`, `apps/web/src/wsNativeApi.ts`, `packages/contracts/src/ipc.ts`.
- Important UX detail: browser context is serialized into the sent prompt, but the user timeline should render clean chips/modals instead of dumping raw `[browser_context]` blocks.

## Codex-First Notes

- The server runs `codex app-server` per provider session over JSON-RPC over stdio.
- Key orchestration files: `apps/server/src/codexAppServerManager.ts`, `providerManager.ts`, `wsServer.ts`.
- The web app consumes orchestration events from `orchestration.domainEvent`.

## Upstream Sync Checklist

- Start from `main`, then `git fetch upstream`.
- Merge `upstream/main` into local `main`, not into `funciones` first.
- If `package.json` or `bun.lock` changed, run `bun install` before validating.
- Common conflict hotspots after upstream merges: `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatHeader.tsx`, `apps/web/src/wsNativeApi.ts`, `packages/contracts/src/ipc.ts`.
- After `main` is healthy, move `funciones` to the same commit and push both branches.

## Windows Gotchas

- `CRLF` can make `git status` noisy; trust `git diff --name-only` / `git diff --stat` to find real changes.
- Cross-platform tests should avoid hardcoding `/tmp`, POSIX-only permission failures, or `LF`-only file assertions.
- Preview-related Zustand selectors must return stable references; fresh arrays/objects can trigger `Maximum update depth exceeded`.
- Browser context screenshots are persisted like normal image drafts/attachments; if timeline rendering changes, keep prompt serialization and user-facing rendering separate.
