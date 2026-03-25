import * as Crypto from "node:crypto";

import type {
  BrowserElementContext,
  BrowserPreviewBounds,
  BrowserPreviewNavigateInput,
  BrowserPreviewOpenInput,
  BrowserPreviewState,
  BrowserSelectionState,
} from "@t3tools/contracts";
import {
  BrowserWindow,
  type DownloadItem,
  type Event as ElectronEvent,
  WebContentsView,
  session as ElectronSession,
  shell,
} from "electron";
import {
  getInstallBrowserSelectionScript,
  parseBrowserSelectionConsoleEvent,
  STOP_BROWSER_SELECTION_SCRIPT,
  type BrowserSelectionOverlayPayload,
} from "./browserSelectionOverlay";

const PREVIEW_DOWNLOAD_BLOCK_MESSAGE =
  "Downloads are not supported in the integrated browser preview yet.";
const PREVIEW_UNSUPPORTED_URL_MESSAGE =
  "Only http:// and https:// URLs are supported in the integrated browser.";
const PREVIEW_SELECTION_UNAVAILABLE_MESSAGE =
  "Open a page in the browser preview before selecting elements.";

export function createClosedBrowserPreviewState(): BrowserPreviewState {
  return {
    open: false,
    status: "closed",
    url: null,
    title: null,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    lastError: null,
    bounds: null,
    workspaceRoot: null,
  };
}

export function createIdleBrowserSelectionState(): BrowserSelectionState {
  return {
    mode: "idle",
    currentSelection: null,
    pendingSelectionCount: 0,
    lastError: null,
    sharedWithAgent: false,
    sharedPageSessionMode: "user-session",
  };
}

function cloneBounds(bounds: BrowserPreviewBounds | null): BrowserPreviewBounds | null {
  return bounds ? { ...bounds } : null;
}

function cloneSelectionContext(
  context: BrowserElementContext | null,
): BrowserElementContext | null {
  if (!context) return null;
  return {
    ...context,
    boundingBox: context.boundingBox ? { ...context.boundingBox } : null,
    attributes: { ...context.attributes },
    accessibility: context.accessibility ? { ...context.accessibility } : null,
    styles: context.styles ? { ...context.styles } : null,
  };
}

function cloneSelectionState(state: BrowserSelectionState): BrowserSelectionState {
  return {
    ...state,
    currentSelection: cloneSelectionContext(state.currentSelection),
  };
}

function normalizeBounds(bounds: BrowserPreviewBounds | null): BrowserPreviewBounds | null {
  if (!bounds) return null;
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height)
  ) {
    return null;
  }
  return {
    x: Math.max(0, Math.floor(bounds.x)),
    y: Math.max(0, Math.floor(bounds.y)),
    width: Math.max(0, Math.floor(bounds.width)),
    height: Math.max(0, Math.floor(bounds.height)),
  };
}

function boundsEqual(
  left: BrowserPreviewBounds | null,
  right: BrowserPreviewBounds | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function normalizeWorkspaceRoot(workspaceRoot: string | null | undefined): string | null {
  if (typeof workspaceRoot !== "string") return null;
  const trimmed = workspaceRoot.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeBrowserPreviewUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.hostname === "0.0.0.0") {
    parsed.hostname = "localhost";
  }

  return parsed.toString();
}

export function browserPreviewPartitionForWorkspaceRoot(workspaceRoot: string | null): string {
  const hash = Crypto.createHash("sha256")
    .update(workspaceRoot ?? "global")
    .digest("hex")
    .slice(0, 16);
  return `persist:t3-browser-preview-${hash}`;
}

interface PreviewBrowserControllerOptions {
  window: BrowserWindow;
  onStateChanged: (state: BrowserPreviewState) => void;
  onSelectionStateChanged: (state: BrowserSelectionState) => void;
}

export class PreviewBrowserController {
  private readonly window: BrowserWindow;
  private readonly onStateChanged: (state: BrowserPreviewState) => void;
  private readonly onSelectionStateChanged: (state: BrowserSelectionState) => void;
  private state: BrowserPreviewState = createClosedBrowserPreviewState();
  private selectionState: BrowserSelectionState = createIdleBrowserSelectionState();
  private bounds: BrowserPreviewBounds | null = null;
  private view: WebContentsView | null = null;
  private sessionPartition: string | null = null;
  private downloadListener: ((event: ElectronEvent, item: DownloadItem) => void) | null = null;
  private selectionSessionActive = false;
  private selectionQueue: BrowserElementContext[] = [];

  constructor(options: PreviewBrowserControllerOptions) {
    this.window = options.window;
    this.onStateChanged = options.onStateChanged;
    this.onSelectionStateChanged = options.onSelectionStateChanged;
  }

  dispose(): void {
    this.destroyView();
    this.state = createClosedBrowserPreviewState();
    this.resetSelectionState();
  }

  getState(): BrowserPreviewState {
    return { ...this.state, bounds: cloneBounds(this.state.bounds) };
  }

  getSelectionState(): BrowserSelectionState {
    return cloneSelectionState(this.selectionState);
  }

  async open(input?: BrowserPreviewOpenInput): Promise<BrowserPreviewState> {
    const workspaceRoot = normalizeWorkspaceRoot(input?.workspaceRoot);
    const targetUrl = normalizeBrowserPreviewUrl(input?.url);

    this.setState({
      open: true,
      status: targetUrl ? "loading" : "idle",
      url: targetUrl,
      title: targetUrl ? this.state.title : null,
      canGoBack: false,
      canGoForward: false,
      loading: targetUrl !== null,
      lastError: null,
      bounds: cloneBounds(this.bounds),
      workspaceRoot,
    });

    if (!targetUrl) {
      return this.getState();
    }

    const view = this.ensureView(workspaceRoot);
    this.setState({
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
    });

    try {
      await view.webContents.loadURL(targetUrl);
    } catch (error) {
      this.setState({
        status: "error",
        loading: false,
        lastError: error instanceof Error ? error.message : "Failed to open preview URL.",
      });
    }

    return this.getState();
  }

  async close(): Promise<BrowserPreviewState> {
    this.destroyView();
    this.setState(createClosedBrowserPreviewState());
    this.resetSelectionState();
    return this.getState();
  }

  async navigate(input: BrowserPreviewNavigateInput): Promise<BrowserPreviewState> {
    const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
    const targetUrl = normalizeBrowserPreviewUrl(input.url);
    if (!targetUrl) {
      this.setState({
        open: true,
        status: "error",
        lastError: PREVIEW_UNSUPPORTED_URL_MESSAGE,
        workspaceRoot,
      });
      return this.getState();
    }

    const view = this.ensureView(workspaceRoot);
    this.setState({
      open: true,
      status: "loading",
      url: targetUrl,
      title: this.state.title,
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
      loading: true,
      lastError: null,
      bounds: cloneBounds(this.bounds),
      workspaceRoot,
    });

    try {
      await view.webContents.loadURL(targetUrl);
    } catch (error) {
      this.setState({
        status: "error",
        loading: false,
        lastError: error instanceof Error ? error.message : "Failed to navigate browser preview.",
      });
    }

    return this.getState();
  }

  async goBack(): Promise<BrowserPreviewState> {
    const webContents = this.view?.webContents;
    if (!webContents || !webContents.canGoBack()) {
      return this.getState();
    }
    this.setState({ status: "loading", loading: true, lastError: null });
    webContents.goBack();
    return this.getState();
  }

  async goForward(): Promise<BrowserPreviewState> {
    const webContents = this.view?.webContents;
    if (!webContents || !webContents.canGoForward()) {
      return this.getState();
    }
    this.setState({ status: "loading", loading: true, lastError: null });
    webContents.goForward();
    return this.getState();
  }

  async reload(): Promise<BrowserPreviewState> {
    const webContents = this.view?.webContents;
    if (!webContents) {
      return this.getState();
    }
    this.cancelSelectionSession();
    this.setState({ status: "loading", loading: true, lastError: null });
    webContents.reload();
    return this.getState();
  }

  async startSelection(): Promise<BrowserSelectionState> {
    const view = this.view;
    if (!view || !this.state.open || !this.state.url || this.state.status === "error") {
      this.setSelectionState({
        mode: "error",
        currentSelection: null,
        pendingSelectionCount: 0,
        lastError: PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
      });
      return this.getSelectionState();
    }

    this.selectionSessionActive = true;
    this.selectionQueue = [];
    this.setSelectionState({
      mode: "selecting",
      currentSelection: null,
      pendingSelectionCount: 0,
      lastError: null,
    });

    try {
      await view.webContents.executeJavaScript(getInstallBrowserSelectionScript(), true);
    } catch (error) {
      this.selectionSessionActive = false;
      this.setSelectionState({
        mode: "error",
        currentSelection: null,
        pendingSelectionCount: 0,
        lastError:
          error instanceof Error ? error.message : "Failed to enter browser selection mode.",
      });
    }

    return this.getSelectionState();
  }

  async stopSelection(): Promise<BrowserSelectionState> {
    this.cancelSelectionSession();
    return this.getSelectionState();
  }

  async addCurrentSelectionToChat(): Promise<BrowserElementContext | null> {
    const nextSelection = this.selectionQueue.shift() ?? null;
    const nextCurrentSelection = this.selectionQueue[0] ?? null;
    this.setSelectionState({
      mode:
        nextCurrentSelection !== null
          ? "selected"
          : this.selectionSessionActive
            ? "selecting"
            : "idle",
      currentSelection: nextCurrentSelection,
      pendingSelectionCount: this.selectionQueue.length,
      lastError: null,
    });

    if (this.selectionSessionActive && this.selectionQueue.length === 0) {
      const view = this.view;
      if (view && !view.webContents.isDestroyed()) {
        try {
          await view.webContents.executeJavaScript(getInstallBrowserSelectionScript(), true);
        } catch (error) {
          this.selectionSessionActive = false;
          this.setSelectionState({
            mode: "error",
            currentSelection: null,
            pendingSelectionCount: 0,
            lastError:
              error instanceof Error ? error.message : "Failed to resume browser selection mode.",
          });
        }
      }
    }

    return cloneSelectionContext(nextSelection);
  }

  setBounds(bounds: BrowserPreviewBounds | null): void {
    const normalizedBounds = normalizeBounds(bounds);
    if (boundsEqual(this.bounds, normalizedBounds)) {
      return;
    }
    this.bounds = normalizedBounds;
    this.setState({ bounds: cloneBounds(this.bounds) });
    const view = this.view;
    if (!view || !this.bounds) {
      return;
    }
    view.setBounds(this.bounds);
  }

  private ensureView(workspaceRoot: string | null): WebContentsView {
    const nextPartition = browserPreviewPartitionForWorkspaceRoot(workspaceRoot);
    if (this.view && this.sessionPartition === nextPartition) {
      if (this.bounds) {
        this.view.setBounds(this.bounds);
      }
      return this.view;
    }

    this.destroyView();

    const previewSession = ElectronSession.fromPartition(nextPartition);
    const view = new WebContentsView({
      webPreferences: {
        session: previewSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.view = view;
    this.sessionPartition = nextPartition;
    this.window.contentView.addChildView(view);
    if (this.bounds) {
      view.setBounds(this.bounds);
    }

    this.downloadListener = (event, item) => {
      if (this.view !== view) return;
      event.preventDefault();
      this.setState({
        open: true,
        status: "error",
        loading: false,
        lastError: PREVIEW_DOWNLOAD_BLOCK_MESSAGE,
        url: normalizeBrowserPreviewUrl(item.getURL()) ?? this.state.url,
        canGoBack: view.webContents.canGoBack(),
        canGoForward: view.webContents.canGoForward(),
      });
    };
    previewSession.on("will-download", this.downloadListener);

    view.webContents.setWindowOpenHandler(({ url }) => {
      const externalUrl = normalizeBrowserPreviewUrl(url);
      if (externalUrl) {
        void shell.openExternal(externalUrl);
      }
      return { action: "deny" };
    });

    const rejectUnsafeNavigation = (event: ElectronEvent, rawUrl: string) => {
      if (this.view !== view) return;
      const safeUrl = normalizeBrowserPreviewUrl(rawUrl);
      if (safeUrl) {
        return;
      }
      event.preventDefault();
      this.setState({
        open: true,
        status: "error",
        loading: false,
        lastError: PREVIEW_UNSUPPORTED_URL_MESSAGE,
        canGoBack: view.webContents.canGoBack(),
        canGoForward: view.webContents.canGoForward(),
      });
    };

    view.webContents.on("will-navigate", rejectUnsafeNavigation);
    view.webContents.on("will-redirect", rejectUnsafeNavigation);
    view.webContents.on("console-message", (_event, _level, message) => {
      if (this.view !== view) return;
      const browserSelectionEvent = parseBrowserSelectionConsoleEvent(message);
      if (!browserSelectionEvent) return;
      if (browserSelectionEvent.type === "cancelled") {
        this.cancelSelectionSession();
        return;
      }
      if (browserSelectionEvent.type === "error") {
        this.selectionSessionActive = false;
        this.setSelectionState({
          mode: "error",
          currentSelection: null,
          pendingSelectionCount: 0,
          lastError: browserSelectionEvent.message,
        });
        return;
      }
      void this.handleOverlaySelection(browserSelectionEvent.payload);
    });
    view.webContents.on("did-start-loading", () => {
      if (this.view !== view) return;
      if (!this.state.open) return;
      this.cancelSelectionSession();
      this.setState({
        status: this.state.url ? "loading" : "idle",
        loading: this.state.url !== null,
        lastError: null,
      });
    });
    view.webContents.on("did-stop-loading", () => {
      if (this.view !== view) return;
      this.setState({
        status: this.state.lastError ? "error" : this.state.url ? "ready" : "idle",
        loading: false,
        canGoBack: view.webContents.canGoBack(),
        canGoForward: view.webContents.canGoForward(),
        title: view.webContents.getTitle() || this.state.title,
      });
    });
    view.webContents.on("page-title-updated", (event, title) => {
      if (this.view !== view) return;
      event.preventDefault();
      this.setState({
        title: title.length > 0 ? title : null,
      });
    });
    view.webContents.on("did-navigate", (_event, url) => {
      if (this.view !== view) return;
      this.cancelSelectionSession();
      this.syncNavigationState(url);
    });
    view.webContents.on("did-navigate-in-page", (_event, url) => {
      if (this.view !== view) return;
      this.cancelSelectionSession();
      this.syncNavigationState(url);
    });
    view.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
      if (this.view !== view) return;
      if (errorCode === -3) {
        return;
      }
      this.cancelSelectionSession();
      this.setState({
        status: "error",
        loading: false,
        url: normalizeBrowserPreviewUrl(validatedUrl) ?? this.state.url,
        lastError: errorDescription || "Failed to load preview page.",
        canGoBack: view.webContents.canGoBack(),
        canGoForward: view.webContents.canGoForward(),
      });
    });

    return view;
  }

  private syncNavigationState(url: string): void {
    const view = this.view;
    if (!view) return;
    this.setState({
      open: true,
      status: "ready",
      url: normalizeBrowserPreviewUrl(url) ?? this.state.url,
      title: view.webContents.getTitle() || this.state.title,
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
      loading: false,
      lastError: null,
    });
  }

  private async handleOverlaySelection(payload: BrowserSelectionOverlayPayload): Promise<void> {
    const selection = await this.buildSelectionContext(payload);
    this.selectionQueue.push(selection);
    this.setSelectionState({
      mode: "selected",
      currentSelection: selection,
      pendingSelectionCount: this.selectionQueue.length,
      lastError: null,
    });
  }

  private async buildSelectionContext(
    payload: BrowserSelectionOverlayPayload,
  ): Promise<BrowserElementContext> {
    const screenshotDataUrl = await this.captureSelectionScreenshot(payload.boundingBox);
    return {
      id: Crypto.randomUUID(),
      selectorLabel: payload.selectorLabel,
      tagName: payload.tagName,
      domPath: payload.domPath,
      boundingBox: payload.boundingBox ? { ...payload.boundingBox } : null,
      textPreview: payload.textPreview,
      attributes: { ...payload.attributes },
      accessibility: payload.accessibility ? { ...payload.accessibility } : null,
      styles: payload.styles ? { ...payload.styles } : null,
      pageUrl: this.view?.webContents.getURL() || this.state.url,
      pageTitle: this.view?.webContents.getTitle() || this.state.title,
      timestamp: new Date().toISOString(),
      screenshotDataUrl,
    };
  }

  private async captureSelectionScreenshot(
    boundingBox: BrowserElementContext["boundingBox"],
  ): Promise<string | null> {
    const webContents = this.view?.webContents;
    if (!webContents || webContents.isDestroyed()) {
      return null;
    }

    try {
      const nativeImage = boundingBox
        ? await webContents.capturePage({
            x: Math.max(0, Math.floor(boundingBox.x)),
            y: Math.max(0, Math.floor(boundingBox.y)),
            width: Math.max(1, Math.floor(boundingBox.width)),
            height: Math.max(1, Math.floor(boundingBox.height)),
          })
        : await webContents.capturePage();
      return nativeImage.isEmpty() ? null : nativeImage.toDataURL();
    } catch {
      try {
        const fallbackImage = await webContents.capturePage();
        return fallbackImage.isEmpty() ? null : fallbackImage.toDataURL();
      } catch {
        return null;
      }
    }
  }

  private destroyView(): void {
    const view = this.view;
    if (!view) {
      return;
    }

    this.cancelSelectionSession();

    if (this.downloadListener && this.sessionPartition) {
      ElectronSession.fromPartition(this.sessionPartition).off(
        "will-download",
        this.downloadListener,
      );
    }
    this.downloadListener = null;
    this.sessionPartition = null;

    if (!this.window.isDestroyed()) {
      try {
        this.window.contentView.removeChildView(view);
      } catch {
        // Ignore if the child view was already detached.
      }
    }

    this.view = null;
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  }

  private cancelSelectionSession(): void {
    this.selectionSessionActive = false;
    this.selectionQueue = [];
    const view = this.view;
    if (view && !view.webContents.isDestroyed()) {
      void view.webContents.executeJavaScript(STOP_BROWSER_SELECTION_SCRIPT, true).catch(() => {
        // Ignore teardown failures during navigation/disposal.
      });
    }
    this.resetSelectionState();
  }

  private resetSelectionState(): void {
    this.setSelectionState(createIdleBrowserSelectionState());
  }

  private setState(patch: Partial<BrowserPreviewState> | BrowserPreviewState): void {
    this.state = {
      ...this.state,
      ...patch,
      bounds:
        "bounds" in patch ? cloneBounds(patch.bounds ?? null) : cloneBounds(this.state.bounds),
    };
    this.onStateChanged(this.getState());
  }

  private setSelectionState(patch: Partial<BrowserSelectionState> | BrowserSelectionState): void {
    this.selectionState = {
      ...this.selectionState,
      ...patch,
      currentSelection:
        "currentSelection" in patch
          ? cloneSelectionContext(patch.currentSelection ?? null)
          : cloneSelectionContext(this.selectionState.currentSelection),
      pendingSelectionCount:
        typeof patch.pendingSelectionCount === "number"
          ? patch.pendingSelectionCount
          : this.selectionQueue.length,
      sharedWithAgent: false,
      sharedPageSessionMode: "user-session",
    };
    this.onSelectionStateChanged(this.getSelectionState());
  }
}
