import { describe, expect, it } from "vitest";

import {
  appendBrowserElementContextsToPrompt,
  browserElementContextDedupKey,
  extractTrailingBrowserElementContexts,
  formatBrowserElementChipLabel,
  toBrowserElementContextDraft,
} from "./browserElementContext";

const browserElementContext = {
  id: "browser-element-1",
  selectorLabel: "canvas#game",
  tagName: "canvas",
  domPath: "body > main > canvas#game",
  boundingBox: { x: 10, y: 20, width: 300, height: 240 },
  textPreview: "Scoreboard",
  attributes: { id: "game", role: "img" },
  accessibility: {
    role: "img",
    name: "Snake board",
    description: null,
    value: null,
    checked: null,
    disabled: null,
    expanded: null,
    selected: null,
  },
  styles: {
    display: "block",
    position: "relative",
    width: "300px",
    height: "240px",
    color: null,
    backgroundColor: "rgb(0, 0, 0)",
    fontSize: null,
    fontWeight: null,
    borderRadius: null,
    zIndex: null,
    opacity: "1",
  },
  pageUrl: "http://localhost:3000/",
  pageTitle: "Snake",
  timestamp: "2026-03-24T12:00:00.000Z",
  screenshotDataUrl: "data:image/png;base64,AAA=",
} as const;

describe("browserElementContext", () => {
  it("formats chip labels with selector context", () => {
    expect(formatBrowserElementChipLabel(browserElementContext)).toBe("<canvas#game>");
  });

  it("builds stable dedupe keys from page and DOM identity", () => {
    const draft = toBrowserElementContextDraft(browserElementContext, "image-1");
    expect(browserElementContextDedupKey(draft)).toBe(
      "http://localhost:3000/\u0000body > main > canvas#game\u0000canvas#game",
    );
  });

  it("appends structured browser context blocks to prompts", () => {
    const prompt = appendBrowserElementContextsToPrompt(
      "Why is this canvas unfocusable?",
      [toBrowserElementContextDraft(browserElementContext, "image-1")],
      new Map([["image-1", "canvas-game.png"]]),
    );

    expect(prompt).toContain("[browser_context 1]");
    expect(prompt).toContain("selector: canvas#game");
    expect(prompt).toContain("attachment_name: canvas-game.png");
    expect(prompt).toContain("accessible_name: Snake board");
    expect(prompt).toContain("attributes: id=game, role=img");
    expect(prompt).toContain("[/browser_context]");
  });

  it("extracts trailing browser context blocks back into chips", () => {
    const prompt = appendBrowserElementContextsToPrompt(
      "Fix this section",
      [toBrowserElementContextDraft(browserElementContext, "image-1")],
      new Map([["image-1", "canvas-game.png"]]),
    );

    const extracted = extractTrailingBrowserElementContexts(prompt);

    expect(extracted.promptText).toBe("Fix this section");
    expect(extracted.contexts).toMatchObject([
      {
        selectorLabel: "canvas#game",
        domPath: "body > main > canvas#game",
        attachmentName: "canvas-game.png",
      },
    ]);
  });
});
