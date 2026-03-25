import type {
  BrowserElementAccessibilitySnapshot,
  BrowserElementBoundingBox,
  BrowserElementStyleSnapshot,
} from "@t3tools/contracts";

export const BROWSER_SELECTION_CONSOLE_PREFIX = "__t3_browser_selection__:";

export interface BrowserSelectionOverlayPayload {
  selectorLabel: string;
  tagName: string;
  domPath: string;
  boundingBox: BrowserElementBoundingBox | null;
  textPreview: string | null;
  attributes: Record<string, string>;
  accessibility: BrowserElementAccessibilitySnapshot | null;
  styles: BrowserElementStyleSnapshot | null;
}

export type BrowserSelectionOverlayEvent =
  | { type: "selected"; payload: BrowserSelectionOverlayPayload }
  | { type: "cancelled" }
  | { type: "error"; message: string };

function overlayScriptBody(): string {
  return String.raw`
(() => {
  const globalKey = "__T3_BROWSER_SELECTION__";
  const prefix = ${JSON.stringify(BROWSER_SELECTION_CONSOLE_PREFIX)};
  const existing = window[globalKey];
  if (existing && typeof existing.stop === "function") {
    existing.stop();
  }

  const emit = (event) => {
    try {
      console.debug(prefix + JSON.stringify(event));
    } catch {
      console.debug(prefix + JSON.stringify({ type: "error", message: "Failed to serialize selection event." }));
    }
  };

  const toBool = (value) => (value === "true" ? true : value === "false" ? false : null);

  const safeText = (value, maxLength = 240) => {
    if (!value) return null;
    const normalized = String(value).replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength - 1) + "…";
  };

  const readLabelledByText = (ids) => {
    if (!ids) return null;
    const parts = [];
    for (const id of ids.split(/\s+/)) {
      const node = document.getElementById(id);
      const text = safeText(node && ("innerText" in node ? node.innerText : node.textContent));
      if (text) parts.push(text);
    }
    return parts.length > 0 ? safeText(parts.join(" ")) : null;
  };

  const inferAccessibility = (element) => {
    const role = element.getAttribute("role") || null;
    const labelledBy = readLabelledByText(element.getAttribute("aria-labelledby"));
    const describedBy = readLabelledByText(element.getAttribute("aria-describedby"));
    const ariaLabel = safeText(element.getAttribute("aria-label"));
    const title = safeText(element.getAttribute("title"));
    const alt = safeText(element.getAttribute("alt"));
    const placeholder = safeText(element.getAttribute("placeholder"));
    const text = safeText("innerText" in element ? element.innerText : element.textContent);
    const value =
      "value" in element && typeof element.value === "string" ? safeText(element.value) : null;
    const name = labelledBy || ariaLabel || alt || title || placeholder || text;
    const description = safeText(element.getAttribute("aria-description")) || describedBy;
    return {
      role,
      name,
      description,
      value,
      checked: toBool(element.getAttribute("aria-checked")),
      disabled:
        element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true"
          ? true
          : null,
      expanded: toBool(element.getAttribute("aria-expanded")),
      selected: toBool(element.getAttribute("aria-selected")),
    };
  };

  const buildSelectorLabel = (element) => {
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? "#" + element.id : "";
    const className =
      typeof element.className === "string"
        ? element.className
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((value) => "." + value)
            .join("")
        : "";
    return tagName + id + className;
  };

  const buildDomPath = (element) => {
    const segments = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 6) {
      const tagName = current.tagName.toLowerCase();
      const id = current.id ? "#" + current.id : "";
      let segment = tagName + id;
      if (!id && current.parentElement) {
        const siblings = Array.from(current.parentElement.children).filter(
          (candidate) => candidate.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          segment += ":nth-of-type(" + String(siblings.indexOf(current) + 1) + ")";
        }
      }
      segments.unshift(segment);
      if (id) break;
      current = current.parentElement;
    }
    return segments.join(" > ");
  };

  const pickAttributes = (element) => {
    const keys = [
      "id",
      "class",
      "name",
      "role",
      "type",
      "placeholder",
      "href",
      "src",
      "alt",
      "for",
      "aria-label",
      "aria-labelledby",
      "aria-describedby",
      "aria-description",
      "aria-controls",
      "aria-current",
      "aria-live",
      "data-testid",
    ];
    const output = {};
    for (const key of keys) {
      const value = element.getAttribute(key);
      if (!value) continue;
      const normalized = safeText(value, 160);
      if (!normalized) continue;
      output[key] = normalized;
    }
    return output;
  };

  const pickStyles = (element) => {
    const computed = window.getComputedStyle(element);
    return {
      display: computed.display || null,
      position: computed.position || null,
      width: computed.width || null,
      height: computed.height || null,
      color: computed.color || null,
      backgroundColor: computed.backgroundColor || null,
      fontSize: computed.fontSize || null,
      fontWeight: computed.fontWeight || null,
      borderRadius: computed.borderRadius || null,
      zIndex: computed.zIndex || null,
      opacity: computed.opacity || null,
    };
  };

  const toBoundingBox = (rect) => {
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.floor(rect.left)),
      y: Math.max(0, Math.floor(rect.top)),
      width: Math.max(0, Math.floor(rect.width)),
      height: Math.max(0, Math.floor(rect.height)),
    };
  };

  const tooltip = document.createElement("div");
  tooltip.style.position = "fixed";
  tooltip.style.zIndex = "2147483647";
  tooltip.style.pointerEvents = "none";
  tooltip.style.background = "rgba(15, 23, 42, 0.96)";
  tooltip.style.color = "#f8fafc";
  tooltip.style.border = "1px solid rgba(148, 163, 184, 0.45)";
  tooltip.style.borderRadius = "10px";
  tooltip.style.padding = "8px 10px";
  tooltip.style.font = "12px/1.4 ui-sans-serif, system-ui, sans-serif";
  tooltip.style.boxShadow = "0 18px 40px rgba(2, 6, 23, 0.35)";
  tooltip.style.maxWidth = "280px";
  tooltip.style.whiteSpace = "normal";
  tooltip.style.display = "none";

  const outline = document.createElement("div");
  outline.style.position = "fixed";
  outline.style.zIndex = "2147483646";
  outline.style.pointerEvents = "none";
  outline.style.border = "2px solid #38bdf8";
  outline.style.boxShadow = "0 0 0 1px rgba(15, 23, 42, 0.55)";
  outline.style.borderRadius = "8px";
  outline.style.background = "rgba(56, 189, 248, 0.12)";
  outline.style.display = "none";

  const container = document.createElement("div");
  container.setAttribute("data-t3-browser-selection-overlay", "true");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "none";
  container.style.zIndex = "2147483645";
  container.append(outline, tooltip);
  document.documentElement.appendChild(container);

  let currentElement = null;

  const render = (element) => {
    currentElement = element;
    if (!element) {
      outline.style.display = "none";
      tooltip.style.display = "none";
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      outline.style.display = "none";
      tooltip.style.display = "none";
      return;
    }

    outline.style.display = "block";
    outline.style.left = Math.max(0, rect.left) + "px";
    outline.style.top = Math.max(0, rect.top) + "px";
    outline.style.width = Math.max(0, rect.width) + "px";
    outline.style.height = Math.max(0, rect.height) + "px";

    const selectorLabel = buildSelectorLabel(element);
    const accessibility = inferAccessibility(element);
    const tooltipLines = [
      '<div style="font-weight:600;color:#e2e8f0">' + selectorLabel + "</div>",
      '<div style="color:#94a3b8">' + Math.floor(rect.width) + " × " + Math.floor(rect.height) + "</div>",
    ];
    if (accessibility.name) {
      tooltipLines.push('<div><span style="color:#94a3b8">Name:</span> ' + accessibility.name + "</div>");
    }
    if (accessibility.role) {
      tooltipLines.push('<div><span style="color:#94a3b8">Role:</span> ' + accessibility.role + "</div>");
    }
    tooltip.innerHTML = tooltipLines.join("");
    tooltip.style.display = "block";

    const desiredTop = rect.top - tooltip.offsetHeight - 10;
    const top = desiredTop >= 8 ? desiredTop : rect.bottom + 10;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - tooltip.offsetWidth - 8),
    );
    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
  };

  const resolveTarget = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    if (container.contains(target)) return null;
    return target;
  };

  const onPointerMove = (event) => {
    render(resolveTarget(event));
  };

  const onScroll = () => {
    render(currentElement);
  };

  const onClick = (event) => {
    const target = resolveTarget(event);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const rect = target.getBoundingClientRect();
    emit({
      type: "selected",
      payload: {
        selectorLabel: buildSelectorLabel(target),
        tagName: target.tagName.toLowerCase(),
        domPath: buildDomPath(target),
        boundingBox: toBoundingBox(rect),
        textPreview: safeText("innerText" in target ? target.innerText : target.textContent),
        attributes: pickAttributes(target),
        accessibility: inferAccessibility(target),
        styles: pickStyles(target),
      },
    });
    api.stop();
  };

  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    emit({ type: "cancelled" });
    api.stop();
  };

  const api = {
    stop() {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll, true);
      container.remove();
      if (document.documentElement.style.cursor === "crosshair") {
        document.documentElement.style.cursor = "";
      }
      delete window[globalKey];
    },
  };

  window[globalKey] = api;
  document.documentElement.style.cursor = "crosshair";
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll, true);
  return true;
})();
`;
}

export function getInstallBrowserSelectionScript(): string {
  return overlayScriptBody();
}

export const STOP_BROWSER_SELECTION_SCRIPT = String.raw`
(() => {
  const existing = window.__T3_BROWSER_SELECTION__;
  if (existing && typeof existing.stop === "function") {
    existing.stop();
  }
  return true;
})();
`;

export function parseBrowserSelectionConsoleEvent(
  message: string,
): BrowserSelectionOverlayEvent | null {
  if (!message.startsWith(BROWSER_SELECTION_CONSOLE_PREFIX)) {
    return null;
  }

  const payload = message.slice(BROWSER_SELECTION_CONSOLE_PREFIX.length);
  try {
    return JSON.parse(payload) as BrowserSelectionOverlayEvent;
  } catch {
    return {
      type: "error",
      message: "Failed to parse browser selection payload.",
    };
  }
}
