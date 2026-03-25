import { describe, expect, it } from "vitest";

import {
  browserPreviewPartitionForWorkspaceRoot,
  createClosedBrowserPreviewState,
  createIdleBrowserSelectionState,
  normalizeBrowserPreviewUrl,
} from "./previewBrowserController";

describe("previewBrowserController", () => {
  it("creates a closed default preview state", () => {
    expect(createClosedBrowserPreviewState()).toEqual({
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
    });
  });

  it("normalizes localhost-like browser preview URLs", () => {
    expect(normalizeBrowserPreviewUrl("localhost:3000")).toBe("http://localhost:3000/");
    expect(normalizeBrowserPreviewUrl("http://0.0.0.0:5173/app")).toBe("http://localhost:5173/app");
  });

  it("rejects unsupported URLs for the preview browser", () => {
    expect(normalizeBrowserPreviewUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeBrowserPreviewUrl("file:///tmp/test.html")).toBeNull();
  });

  it("builds stable workspace partitions for preview persistence", () => {
    expect(browserPreviewPartitionForWorkspaceRoot("/tmp/project")).toBe(
      browserPreviewPartitionForWorkspaceRoot("/tmp/project"),
    );
    expect(browserPreviewPartitionForWorkspaceRoot("/tmp/project")).not.toBe(
      browserPreviewPartitionForWorkspaceRoot("/tmp/other-project"),
    );
  });

  it("creates an idle default browser selection state", () => {
    expect(createIdleBrowserSelectionState()).toEqual({
      mode: "idle",
      currentSelection: null,
      pendingSelectionCount: 0,
      lastError: null,
      sharedWithAgent: false,
      sharedPageSessionMode: "user-session",
    });
  });
});
