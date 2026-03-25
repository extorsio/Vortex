import type { BrowserPreviewState, BrowserSelectionState } from "@t3tools/contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CrosshairIcon,
  ExternalLinkIcon,
  GlobeIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { readNativeApi } from "~/nativeApi";
import { cn } from "~/lib/utils";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

const MIN_BROWSER_PREVIEW_WIDTH = 320;
const MAX_BROWSER_PREVIEW_WIDTH = 920;
const BROWSER_PREVIEW_PLACEHOLDER_URL = "http://localhost:3000";

function clampBrowserPreviewWidth(width: number): number {
  const windowMax =
    typeof window === "undefined" ? MAX_BROWSER_PREVIEW_WIDTH : window.innerWidth * 0.72;
  return Math.max(
    MIN_BROWSER_PREVIEW_WIDTH,
    Math.min(Math.round(width), Math.min(MAX_BROWSER_PREVIEW_WIDTH, windowMax)),
  );
}

function normalizeBounds(bounds: { x: number; y: number; width: number; height: number } | null) {
  if (!bounds) return null;
  return {
    x: Math.max(0, Math.floor(bounds.x)),
    y: Math.max(0, Math.floor(bounds.y)),
    width: Math.max(0, Math.floor(bounds.width)),
    height: Math.max(0, Math.floor(bounds.height)),
  };
}

interface BrowserPreviewPanelProps {
  state: BrowserPreviewState;
  selectionState: BrowserSelectionState;
  width: number;
  preferredUrl: string | null;
  workspaceRoot: string | null;
  onClose: () => void;
  onWidthChange: (width: number) => void;
}

export function BrowserPreviewPanel({
  state,
  selectionState,
  width,
  preferredUrl,
  workspaceRoot,
  onClose,
  onWidthChange,
}: BrowserPreviewPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const boundsKeyRef = useRef<string>("");
  const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  );
  const [addressValue, setAddressValue] = useState(state.url ?? "");

  useEffect(() => {
    setAddressValue(state.url ?? "");
  }, [state.url]);

  useEffect(() => {
    if (state.url || !state.open) {
      return;
    }
    const input = addressInputRef.current;
    if (!input) return;
    const frameId = window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [state.open, state.url]);

  const setPreviewBounds = useCallback(
    (bounds: { x: number; y: number; width: number; height: number } | null) => {
      const api = readNativeApi();
      if (!api) return;
      const normalizedBounds = normalizeBounds(bounds);
      const nextKey = normalizedBounds
        ? `${normalizedBounds.x}:${normalizedBounds.y}:${normalizedBounds.width}:${normalizedBounds.height}`
        : "closed";
      if (boundsKeyRef.current === nextKey) return;
      boundsKeyRef.current = nextKey;
      void api.browserPreview.setBounds(normalizedBounds);
    },
    [],
  );

  const syncPreviewBounds = useCallback(() => {
    if (!state.open) {
      setPreviewBounds(null);
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setPreviewBounds(null);
      return;
    }

    setPreviewBounds({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }, [setPreviewBounds, state.open]);

  useLayoutEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      syncPreviewBounds();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [syncPreviewBounds, width, state.open, state.url]);

  useEffect(() => {
    if (!state.open) {
      boundsKeyRef.current = "";
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) return;

    let frameId = 0;
    const queueSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        syncPreviewBounds();
      });
    };

    const resizeObserver = new ResizeObserver(queueSync);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", queueSync);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", queueSync);
      window.cancelAnimationFrame(frameId);
    };
  }, [state.open, syncPreviewBounds]);

  useEffect(() => {
    return () => {
      const api = readNativeApi();
      if (!api) return;
      void api.browserPreview.setBounds(null);
    };
  }, []);

  const submitNavigation = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const nextUrl = addressValue.trim();
      if (nextUrl.length === 0) {
        return;
      }
      const api = readNativeApi();
      if (!api) return;
      void api.browserPreview.navigate({
        url: nextUrl,
        workspaceRoot,
      });
    },
    [addressValue, workspaceRoot],
  );

  const openPreferredUrl = useCallback(() => {
    if (!preferredUrl) return;
    const api = readNativeApi();
    if (!api) return;
    void api.browserPreview.navigate({
      url: preferredUrl,
      workspaceRoot,
    });
  }, [preferredUrl, workspaceRoot]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      const nextWidth = clampBrowserPreviewWidth(
        resizeState.startWidth + (resizeState.startX - event.clientX),
      );
      onWidthChange(nextWidth);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      resizeStateRef.current = null;
      onWidthChange(clampBrowserPreviewWidth(width));
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [onWidthChange, width]);

  const onResizeHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      resizeStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: width,
      };
    },
    [width],
  );

  return (
    <aside
      className="relative flex min-h-0 shrink-0 border-l border-border bg-background"
      style={{ width: `${clampBrowserPreviewWidth(width)}px` }}
    >
      <div
        className="absolute inset-y-0 left-0 z-30 w-1.5 cursor-col-resize"
        onPointerDown={onResizeHandlePointerDown}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-1.5">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => {
              const api = readNativeApi();
              if (!api) return;
              void api.browserPreview.goBack();
            }}
            disabled={!state.canGoBack}
            aria-label="Go back"
          >
            <ArrowLeftIcon className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => {
              const api = readNativeApi();
              if (!api) return;
              void api.browserPreview.goForward();
            }}
            disabled={!state.canGoForward}
            aria-label="Go forward"
          >
            <ArrowRightIcon className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => {
              const api = readNativeApi();
              if (!api) return;
              void api.browserPreview.reload();
            }}
            disabled={!state.open || (!state.url && state.status !== "error")}
            aria-label="Reload preview"
          >
            <RefreshCwIcon className={cn("size-3.5", state.loading && "animate-spin")} />
          </Button>

          <form className="min-w-0 flex-1" onSubmit={submitNavigation}>
            <Input
              ref={addressInputRef}
              value={addressValue}
              onChange={(event) => setAddressValue(event.target.value)}
              className="h-8"
              placeholder={BROWSER_PREVIEW_PLACEHOLDER_URL}
              aria-label="Browser preview URL"
            />
          </form>

          <div className="min-w-0 shrink truncate text-xs text-muted-foreground/70">
            {state.title ?? "Preview"}
          </div>

          <Button
            size="sm"
            variant={selectionState.mode === "selecting" ? "default" : "outline"}
            onClick={() => {
              const api = readNativeApi();
              if (!api) return;
              if (selectionState.mode === "selecting") {
                void api.browserSelection.stop();
                return;
              }
              void api.browserSelection.start();
            }}
            disabled={!state.url || state.loading || state.status === "error"}
            className="h-8 gap-1.5 px-2"
          >
            <CrosshairIcon className="size-3.5" />
            <span className="hidden sm:inline">
              {selectionState.mode === "selecting" ? "Selecting" : "Add to chat"}
            </span>
          </Button>

          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => {
              if (!state.url) return;
              const api = readNativeApi();
              if (!api) return;
              void api.shell.openExternal(state.url);
            }}
            disabled={!state.url}
            aria-label="Open in external browser"
          >
            <ExternalLinkIcon className="size-3.5" />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close browser panel">
            <XIcon className="size-3.5" />
          </Button>
        </div>

        {state.lastError ? (
          <div className="border-b border-border/70 bg-destructive/8 px-3 py-2 text-xs text-destructive-foreground">
            {state.lastError}
          </div>
        ) : null}

        {selectionState.mode !== "idle" || selectionState.lastError ? (
          <div
            className={cn(
              "border-b px-3 py-2 text-xs",
              selectionState.lastError
                ? "border-destructive/40 bg-destructive/8 text-destructive-foreground"
                : "border-sky-500/20 bg-sky-500/8 text-foreground/85",
            )}
          >
            {selectionState.lastError
              ? selectionState.lastError
              : selectionState.mode === "selecting"
                ? "Hover and click an element to add it to the chat. Press Esc to cancel."
                : selectionState.pendingSelectionCount > 0
                  ? `${selectionState.pendingSelectionCount} element ${
                      selectionState.pendingSelectionCount === 1 ? "queued" : "queued"
                    } for the chat.`
                  : "Element captured and ready for the chat."}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 bg-muted/10">
          <div ref={viewportRef} className="absolute inset-0" />

          {!state.url && !state.loading ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full border border-border/70 bg-background/80">
                <GlobeIcon className="size-5 text-muted-foreground/80" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Open your local preview here</p>
                <p className="text-xs text-muted-foreground">
                  Paste a URL or use the latest localhost URL detected from this thread.
                </p>
              </div>
              {preferredUrl ? (
                <Button size="sm" variant="outline" onClick={openPreferredUrl}>
                  Open {preferredUrl}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
