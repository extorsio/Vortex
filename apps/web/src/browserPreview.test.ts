import { describe, expect, it } from "vitest";

import {
  collectMessageBrowserPreviewObservations,
  extractBrowserPreviewUrls,
  normalizeBrowserPreviewUrlCandidate,
  observeBrowserPreviewUrlsFromText,
  resolvePreferredBrowserPreviewUrl,
} from "./browserPreview";

describe("browserPreview", () => {
  it("extracts normalized preview URLs from freeform text", () => {
    expect(
      extractBrowserPreviewUrls(
        "Dev server ready at http://0.0.0.0:5173/ and docs at https://example.com/guide.",
      ),
    ).toEqual(["http://localhost:5173/", "https://example.com/guide"]);
  });

  it("normalizes only supported http(s) URLs", () => {
    expect(normalizeBrowserPreviewUrlCandidate("http://localhost:3000")).toBe(
      "http://localhost:3000/",
    );
    expect(normalizeBrowserPreviewUrlCandidate("file:///tmp/index.html")).toBeNull();
  });

  it("collects preview observations from assistant messages only", () => {
    const observations = collectMessageBrowserPreviewObservations([
      {
        role: "assistant",
        text: "Local URL: http://localhost:3000/",
        createdAt: "2026-03-23T10:00:00.000Z",
      },
      {
        role: "user",
        text: "Ignore https://user.example.com/",
        createdAt: "2026-03-23T10:01:00.000Z",
      },
    ]);

    expect(observations).toEqual([
      {
        url: "http://localhost:3000/",
        observedAt: "2026-03-23T10:00:00.000Z",
        source: "message",
      },
    ]);
  });

  it("prefers localhost URLs over newer non-localhost links", () => {
    const terminalObservations = observeBrowserPreviewUrlsFromText(
      "Proxy URL: https://preview.example.com/",
      "2026-03-23T10:05:00.000Z",
      "terminal",
    );
    const messageObservations = observeBrowserPreviewUrlsFromText(
      "Local URL: http://localhost:3000/",
      "2026-03-23T10:00:00.000Z",
      "message",
    );

    expect(
      resolvePreferredBrowserPreviewUrl({
        messageObservations,
        terminalObservations,
      }),
    ).toBe("http://localhost:3000/");
  });

  it("prefers the newest URL when priorities match", () => {
    const terminalObservations = [
      ...observeBrowserPreviewUrlsFromText(
        "Local URL: http://localhost:3000/",
        "2026-03-23T10:00:00.000Z",
        "terminal",
      ),
      ...observeBrowserPreviewUrlsFromText(
        "Local URL: http://localhost:4173/",
        "2026-03-23T10:02:00.000Z",
        "terminal",
      ),
    ];

    expect(
      resolvePreferredBrowserPreviewUrl({
        messageObservations: [],
        terminalObservations,
      }),
    ).toBe("http://localhost:4173/");
  });
});
