import type {
  GitCheckoutInput,
  GitActionProgressEvent,
  GitCreateBranchInput,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullRequestRefInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  GitStatusInput,
  GitStatusResult,
} from "./git";
import type {
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import type { ServerConfig } from "./server";
import type {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import type { ServerUpsertKeybindingInput, ServerUpsertKeybindingResult } from "./server";
import type {
  ClientOrchestrationCommand,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationEvent,
  OrchestrationReadModel,
} from "./orchestration";
import { EditorId } from "./editor";

export interface ContextMenuItem<T extends string = string> {
  id: T;
  label: string;
  destructive?: boolean;
}

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type DesktopRuntimeArch = "arm64" | "x64" | "other";
export type DesktopTheme = "light" | "dark" | "system";

export interface DesktopRuntimeInfo {
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: "check" | "download" | "install" | null;
  canRetry: boolean;
}

export interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

export interface BrowserPreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BrowserPreviewStatus = "closed" | "idle" | "loading" | "ready" | "error";

export interface BrowserPreviewState {
  open: boolean;
  status: BrowserPreviewStatus;
  url: string | null;
  title: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  lastError: string | null;
  bounds: BrowserPreviewBounds | null;
  workspaceRoot: string | null;
}

export interface BrowserPreviewOpenInput {
  url?: string;
  workspaceRoot?: string | null;
}

export interface BrowserPreviewNavigateInput {
  url: string;
  workspaceRoot?: string | null;
}

export type BrowserElementSelectionMode = "idle" | "selecting" | "selected" | "error";
export type BrowserSharedPageSessionMode = "user-session";

export interface BrowserElementBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserElementAccessibilitySnapshot {
  role: string | null;
  name: string | null;
  description: string | null;
  value: string | null;
  checked: boolean | null;
  disabled: boolean | null;
  expanded: boolean | null;
  selected: boolean | null;
}

export interface BrowserElementStyleSnapshot {
  display: string | null;
  position: string | null;
  width: string | null;
  height: string | null;
  color: string | null;
  backgroundColor: string | null;
  fontSize: string | null;
  fontWeight: string | null;
  borderRadius: string | null;
  zIndex: string | null;
  opacity: string | null;
}

export interface BrowserElementContext {
  id: string;
  selectorLabel: string;
  tagName: string;
  domPath: string;
  boundingBox: BrowserElementBoundingBox | null;
  textPreview: string | null;
  attributes: Record<string, string>;
  accessibility: BrowserElementAccessibilitySnapshot | null;
  styles: BrowserElementStyleSnapshot | null;
  pageUrl: string | null;
  pageTitle: string | null;
  timestamp: string;
  screenshotDataUrl: string | null;
}

export interface BrowserElementContextDraft {
  id: string;
  imageAttachmentId: string | null;
  selectorLabel: string;
  tagName: string;
  domPath: string;
  boundingBox: BrowserElementBoundingBox | null;
  textPreview: string | null;
  attributes: Record<string, string>;
  accessibility: BrowserElementAccessibilitySnapshot | null;
  styles: BrowserElementStyleSnapshot | null;
  pageUrl: string | null;
  pageTitle: string | null;
  timestamp: string;
}

export interface BrowserSelectionState {
  mode: BrowserElementSelectionMode;
  currentSelection: BrowserElementContext | null;
  pendingSelectionCount: number;
  lastError: string | null;
  sharedWithAgent: boolean;
  sharedPageSessionMode: BrowserSharedPageSessionMode;
}

export interface DesktopBridge {
  getWsUrl: () => string | null;
  pickFolder: () => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  setTheme: (theme: DesktopTheme) => Promise<void>;
  showContextMenu: <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number },
  ) => Promise<T | null>;
  openExternal: (url: string) => Promise<boolean>;
  onMenuAction: (listener: (action: string) => void) => () => void;
  getUpdateState: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
  browserPreview: {
    open: (input?: BrowserPreviewOpenInput) => Promise<BrowserPreviewState>;
    close: () => Promise<BrowserPreviewState>;
    navigate: (input: BrowserPreviewNavigateInput) => Promise<BrowserPreviewState>;
    goBack: () => Promise<BrowserPreviewState>;
    goForward: () => Promise<BrowserPreviewState>;
    reload: () => Promise<BrowserPreviewState>;
    setBounds: (bounds: BrowserPreviewBounds | null) => Promise<void>;
    getState: () => Promise<BrowserPreviewState>;
    onStateChanged: (listener: (state: BrowserPreviewState) => void) => () => void;
  };
  browserSelection: {
    start: () => Promise<BrowserSelectionState>;
    stop: () => Promise<BrowserSelectionState>;
    getState: () => Promise<BrowserSelectionState>;
    addCurrentSelectionToChat: () => Promise<BrowserElementContext | null>;
    onStateChanged: (listener: (state: BrowserSelectionState) => void) => () => void;
  };
}

export interface NativeApi {
  dialogs: {
    pickFolder: () => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
  };
  terminal: {
    open: (input: TerminalOpenInput) => Promise<TerminalSessionSnapshot>;
    write: (input: TerminalWriteInput) => Promise<void>;
    resize: (input: TerminalResizeInput) => Promise<void>;
    clear: (input: TerminalClearInput) => Promise<void>;
    restart: (input: TerminalRestartInput) => Promise<TerminalSessionSnapshot>;
    close: (input: TerminalCloseInput) => Promise<void>;
    onEvent: (callback: (event: TerminalEvent) => void) => () => void;
  };
  projects: {
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
  };
  shell: {
    openInEditor: (cwd: string, editor: EditorId) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
  git: {
    // Existing branch/worktree API
    listBranches: (input: GitListBranchesInput) => Promise<GitListBranchesResult>;
    createWorktree: (input: GitCreateWorktreeInput) => Promise<GitCreateWorktreeResult>;
    removeWorktree: (input: GitRemoveWorktreeInput) => Promise<void>;
    createBranch: (input: GitCreateBranchInput) => Promise<void>;
    checkout: (input: GitCheckoutInput) => Promise<void>;
    init: (input: GitInitInput) => Promise<void>;
    resolvePullRequest: (input: GitPullRequestRefInput) => Promise<GitResolvePullRequestResult>;
    preparePullRequestThread: (
      input: GitPreparePullRequestThreadInput,
    ) => Promise<GitPreparePullRequestThreadResult>;
    // Stacked action API
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    status: (input: GitStatusInput) => Promise<GitStatusResult>;
    runStackedAction: (input: GitRunStackedActionInput) => Promise<GitRunStackedActionResult>;
    onActionProgress: (callback: (event: GitActionProgressEvent) => void) => () => void;
  };
  contextMenu: {
    show: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  server: {
    getConfig: () => Promise<ServerConfig>;
    upsertKeybinding: (input: ServerUpsertKeybindingInput) => Promise<ServerUpsertKeybindingResult>;
  };
  browserPreview: {
    open: (input?: BrowserPreviewOpenInput) => Promise<BrowserPreviewState>;
    close: () => Promise<BrowserPreviewState>;
    navigate: (input: BrowserPreviewNavigateInput) => Promise<BrowserPreviewState>;
    goBack: () => Promise<BrowserPreviewState>;
    goForward: () => Promise<BrowserPreviewState>;
    reload: () => Promise<BrowserPreviewState>;
    setBounds: (bounds: BrowserPreviewBounds | null) => Promise<void>;
    getState: () => Promise<BrowserPreviewState>;
    onStateChanged: (listener: (state: BrowserPreviewState) => void) => () => void;
  };
  browserSelection: {
    start: () => Promise<BrowserSelectionState>;
    stop: () => Promise<BrowserSelectionState>;
    getState: () => Promise<BrowserSelectionState>;
    addCurrentSelectionToChat: () => Promise<BrowserElementContext | null>;
    onStateChanged: (listener: (state: BrowserSelectionState) => void) => () => void;
  };
  orchestration: {
    getSnapshot: () => Promise<OrchestrationReadModel>;
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
    getTurnDiff: (input: OrchestrationGetTurnDiffInput) => Promise<OrchestrationGetTurnDiffResult>;
    getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Promise<OrchestrationGetFullThreadDiffResult>;
    replayEvents: (fromSequenceExclusive: number) => Promise<OrchestrationEvent[]>;
    onDomainEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
  };
}
