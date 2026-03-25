import type { BrowserElementContext, BrowserElementContextDraft } from "@t3tools/contracts";

import type { ComposerImageAttachment } from "./composerDraftStore";
import { randomUUID } from "./lib/utils";

const BROWSER_CONTEXT_BLOCK_PATTERN = /\[browser_context \d+\]\n([\s\S]*?)\n\[\/browser_context\]/g;

export interface ParsedBrowserElementContextEntry {
  selectorLabel: string;
  domPath: string;
  page: string | null;
  accessibleName: string | null;
  role: string | null;
  text: string | null;
  attributes: string | null;
  styles: string | null;
  attachmentName: string | null;
}

export interface ExtractedBrowserElementContexts {
  promptText: string;
  contexts: ParsedBrowserElementContextEntry[];
}

function compactRecord(record: Record<string, string>): string | null {
  const entries = Object.entries(record).filter(([, value]) => value.trim().length > 0);
  if (entries.length === 0) return null;
  return entries
    .toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

export function browserElementContextDedupKey(
  context: Pick<BrowserElementContextDraft, "selectorLabel" | "domPath" | "pageUrl">,
): string {
  return `${context.pageUrl ?? ""}\u0000${context.domPath}\u0000${context.selectorLabel}`;
}

export function formatBrowserElementChipLabel(
  context: Pick<BrowserElementContextDraft, "selectorLabel" | "tagName">,
): string {
  const label = context.selectorLabel.trim();
  if (label.length > 0) {
    return `<${label}>`;
  }
  return `<${context.tagName.toLowerCase()}>`;
}

export function toBrowserElementContextDraft(
  context: BrowserElementContext,
  imageAttachmentId: string | null,
): BrowserElementContextDraft {
  return {
    id: context.id,
    imageAttachmentId,
    selectorLabel: context.selectorLabel,
    tagName: context.tagName,
    domPath: context.domPath,
    boundingBox: context.boundingBox ? { ...context.boundingBox } : null,
    textPreview: context.textPreview,
    attributes: { ...context.attributes },
    accessibility: context.accessibility ? { ...context.accessibility } : null,
    styles: context.styles ? { ...context.styles } : null,
    pageUrl: context.pageUrl,
    pageTitle: context.pageTitle,
    timestamp: context.timestamp,
  };
}

export async function browserElementContextToComposerImage(
  context: BrowserElementContext,
): Promise<ComposerImageAttachment | null> {
  if (!context.screenshotDataUrl) {
    return null;
  }

  const response = await fetch(context.screenshotDataUrl);
  const blob = await response.blob();
  const extension = blob.type === "image/jpeg" ? "jpg" : "png";
  const baseName = context.selectorLabel.replace(/[^a-z0-9#.-]+/gi, "-").slice(0, 48) || "element";
  const fileName = `${baseName}.${extension}`;
  const file = new File([blob], fileName, {
    type: blob.type || "image/png",
    lastModified: Date.parse(context.timestamp) || Date.now(),
  });

  return {
    type: "image",
    id: randomUUID(),
    name: file.name,
    mimeType: file.type || "image/png",
    sizeBytes: file.size,
    previewUrl: context.screenshotDataUrl,
    file,
  };
}

export function appendBrowserElementContextsToPrompt(
  prompt: string,
  contexts: ReadonlyArray<BrowserElementContextDraft>,
  imageNameByAttachmentId?: ReadonlyMap<string, string>,
): string {
  if (contexts.length === 0) {
    return prompt;
  }

  const sections = contexts.map((context, index) => {
    const lines = [
      `[browser_context ${index + 1}]`,
      `selector: ${context.selectorLabel}`,
      `dom_path: ${context.domPath}`,
    ];
    if (context.pageTitle || context.pageUrl) {
      lines.push(
        `page: ${[context.pageTitle, context.pageUrl].filter((value) => value).join(" | ")}`,
      );
    }
    const attachmentName =
      context.imageAttachmentId && imageNameByAttachmentId
        ? (imageNameByAttachmentId.get(context.imageAttachmentId) ?? null)
        : null;
    if (attachmentName) {
      lines.push(`attachment_name: ${attachmentName}`);
    }
    if (context.accessibility?.name) {
      lines.push(`accessible_name: ${context.accessibility.name}`);
    }
    if (context.accessibility?.role) {
      lines.push(`role: ${context.accessibility.role}`);
    }
    if (context.textPreview) {
      lines.push(`text: ${context.textPreview}`);
    }
    const attributes = compactRecord(context.attributes);
    if (attributes) {
      lines.push(`attributes: ${attributes}`);
    }
    const styles = context.styles
      ? compactRecord(
          Object.fromEntries(
            Object.entries(context.styles).flatMap(([key, value]) =>
              value && value.trim().length > 0 ? [[key, value]] : [],
            ),
          ),
        )
      : null;
    if (styles) {
      lines.push(`styles: ${styles}`);
    }
    lines.push("[/browser_context]");
    return lines.join("\n");
  });

  return `${prompt.trimEnd()}\n\n${sections.join("\n\n")}`.trim();
}

function parseBrowserContextBlock(blockBody: string): ParsedBrowserElementContextEntry | null {
  const values = new Map<string, string>();
  for (const rawLine of blockBody.split("\n")) {
    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = rawLine.slice(0, separatorIndex).trim();
    const value = rawLine.slice(separatorIndex + 1).trim();
    if (key.length === 0 || value.length === 0) {
      continue;
    }
    values.set(key, value);
  }

  const selectorLabel = values.get("selector");
  const domPath = values.get("dom_path");
  if (!selectorLabel || !domPath) {
    return null;
  }

  return {
    selectorLabel,
    domPath,
    page: values.get("page") ?? null,
    accessibleName: values.get("accessible_name") ?? null,
    role: values.get("role") ?? null,
    text: values.get("text") ?? null,
    attributes: values.get("attributes") ?? null,
    styles: values.get("styles") ?? null,
    attachmentName: values.get("attachment_name") ?? null,
  };
}

export function extractTrailingBrowserElementContexts(
  prompt: string,
): ExtractedBrowserElementContexts {
  const matches = [...prompt.matchAll(BROWSER_CONTEXT_BLOCK_PATTERN)];
  if (matches.length === 0) {
    return {
      promptText: prompt,
      contexts: [],
    };
  }

  const acceptedMatches: Array<{
    index: number;
    end: number;
    context: ParsedBrowserElementContextEntry;
  }> = [];
  let trailingCursor = prompt.length;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (!match?.[0] || match.index === undefined) {
      continue;
    }
    const between = prompt.slice(match.index + match[0].length, trailingCursor);
    if (between.trim().length > 0) {
      break;
    }
    const parsed = parseBrowserContextBlock(match[1] ?? "");
    if (!parsed) {
      break;
    }
    acceptedMatches.unshift({
      index: match.index,
      end: match.index + match[0].length,
      context: parsed,
    });
    trailingCursor = match.index;
  }

  if (acceptedMatches.length === 0) {
    return {
      promptText: prompt,
      contexts: [],
    };
  }

  return {
    promptText: prompt.slice(0, acceptedMatches[0]!.index).trimEnd(),
    contexts: acceptedMatches.map((entry) => entry.context),
  };
}

export function buildBrowserElementContextDetailMarkdown(
  context: ParsedBrowserElementContextEntry,
): string {
  const lines = [
    "Attached Element Context from Integrated Browser",
    "",
    `Element: ${context.selectorLabel}`,
    "",
    "HTML Path:",
    context.domPath,
  ];
  if (context.attributes) {
    lines.push("", "Attributes:", `- ${context.attributes.replaceAll(", ", "\n- ")}`);
  }
  if (context.styles) {
    lines.push("", "Computed Styles:", `- ${context.styles.replaceAll(", ", "\n- ")}`);
  }
  if (context.accessibleName || context.role) {
    lines.push("", "Accessibility:");
    if (context.accessibleName) {
      lines.push(`- name: ${context.accessibleName}`);
    }
    if (context.role) {
      lines.push(`- role: ${context.role}`);
    }
  }
  if (context.page) {
    lines.push("", "Page:", context.page);
  }
  if (context.text) {
    lines.push("", "Visible Text:", context.text);
  }
  return lines.join("\n");
}
