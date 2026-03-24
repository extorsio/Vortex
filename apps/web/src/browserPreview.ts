import type { ChatMessage } from "./types";

export interface BrowserPreviewUrlObservation {
  url: string;
  observedAt: string;
  source: "message" | "terminal";
}

const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g;
const TRAILING_PUNCTUATION_PATTERN = /[.,;!?]+$/;

function trimClosingDelimiters(value: string): string {
  let output = value.replace(TRAILING_PUNCTUATION_PATTERN, "");
  if (output.length === 0) return output;

  const trimUnbalanced = (open: string, close: string) => {
    while (output.endsWith(close)) {
      const openCount = output.split(open).length - 1;
      const closeCount = output.split(close).length - 1;
      if (openCount >= closeCount) return;
      output = output.slice(0, -1);
    }
  };

  trimUnbalanced("(", ")");
  trimUnbalanced("[", "]");
  trimUnbalanced("{", "}");
  return output;
}

export function normalizeBrowserPreviewUrlCandidate(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
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

export function extractBrowserPreviewUrls(text: string): string[] {
  const matches = new Set<string>();
  URL_PATTERN.lastIndex = 0;

  for (const rawMatch of text.matchAll(URL_PATTERN)) {
    const rawValue = rawMatch[0];
    if (!rawValue) continue;
    const normalized = normalizeBrowserPreviewUrlCandidate(trimClosingDelimiters(rawValue));
    if (!normalized) continue;
    matches.add(normalized);
  }

  return [...matches];
}

export function observeBrowserPreviewUrlsFromText(
  text: string,
  observedAt: string,
  source: BrowserPreviewUrlObservation["source"],
): BrowserPreviewUrlObservation[] {
  return extractBrowserPreviewUrls(text).map((url) => ({
    url,
    observedAt,
    source,
  }));
}

export function collectMessageBrowserPreviewObservations(
  messages: ReadonlyArray<Pick<ChatMessage, "role" | "text" | "createdAt" | "completedAt">>,
): BrowserPreviewUrlObservation[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant" && message.role !== "system") {
      return [];
    }
    return observeBrowserPreviewUrlsFromText(
      message.text,
      message.completedAt ?? message.createdAt,
      "message",
    );
  });
}

function hostnamePriority(url: string): number {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 0;
  }

  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost")) {
    return 3;
  }
  if (parsed.hostname === "127.0.0.1" || parsed.hostname === "::1" || parsed.hostname === "[::1]") {
    return 2;
  }
  return 1;
}

function observedAtValue(observedAt: string): number {
  const value = Date.parse(observedAt);
  return Number.isFinite(value) ? value : 0;
}

export function resolvePreferredBrowserPreviewUrl(input: {
  messageObservations: ReadonlyArray<BrowserPreviewUrlObservation>;
  terminalObservations: ReadonlyArray<BrowserPreviewUrlObservation>;
}): string | null {
  const merged = [...input.messageObservations, ...input.terminalObservations];
  if (merged.length === 0) return null;

  const best = merged.toSorted((left, right) => {
    const priorityDelta = hostnamePriority(right.url) - hostnamePriority(left.url);
    if (priorityDelta !== 0) return priorityDelta;
    return observedAtValue(right.observedAt) - observedAtValue(left.observedAt);
  })[0];

  return best?.url ?? null;
}
