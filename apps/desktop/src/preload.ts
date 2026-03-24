import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@t3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CONFIRM_CHANNEL = "desktop:confirm";
const SET_THEME_CHANNEL = "desktop:set-theme";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
const BROWSER_PREVIEW_STATE_CHANNEL = "desktop:browser-preview-state";
const BROWSER_PREVIEW_OPEN_CHANNEL = "desktop:browser-preview-open";
const BROWSER_PREVIEW_CLOSE_CHANNEL = "desktop:browser-preview-close";
const BROWSER_PREVIEW_NAVIGATE_CHANNEL = "desktop:browser-preview-navigate";
const BROWSER_PREVIEW_BACK_CHANNEL = "desktop:browser-preview-back";
const BROWSER_PREVIEW_FORWARD_CHANNEL = "desktop:browser-preview-forward";
const BROWSER_PREVIEW_RELOAD_CHANNEL = "desktop:browser-preview-reload";
const BROWSER_PREVIEW_BOUNDS_CHANNEL = "desktop:browser-preview-bounds";
const BROWSER_PREVIEW_GET_STATE_CHANNEL = "desktop:browser-preview-get-state";
const wsUrl = process.env.T3CODE_DESKTOP_WS_URL ?? null;

contextBridge.exposeInMainWorld("desktopBridge", {
  getWsUrl: () => wsUrl,
  pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
  browserPreview: {
    open: (input) => ipcRenderer.invoke(BROWSER_PREVIEW_OPEN_CHANNEL, input),
    close: () => ipcRenderer.invoke(BROWSER_PREVIEW_CLOSE_CHANNEL),
    navigate: (input) => ipcRenderer.invoke(BROWSER_PREVIEW_NAVIGATE_CHANNEL, input),
    goBack: () => ipcRenderer.invoke(BROWSER_PREVIEW_BACK_CHANNEL),
    goForward: () => ipcRenderer.invoke(BROWSER_PREVIEW_FORWARD_CHANNEL),
    reload: () => ipcRenderer.invoke(BROWSER_PREVIEW_RELOAD_CHANNEL),
    setBounds: (bounds) => ipcRenderer.invoke(BROWSER_PREVIEW_BOUNDS_CHANNEL, bounds),
    getState: () => ipcRenderer.invoke(BROWSER_PREVIEW_GET_STATE_CHANNEL),
    onStateChanged: (listener) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
        if (typeof state !== "object" || state === null) return;
        listener(state as Parameters<typeof listener>[0]);
      };

      ipcRenderer.on(BROWSER_PREVIEW_STATE_CHANNEL, wrappedListener);
      return () => {
        ipcRenderer.removeListener(BROWSER_PREVIEW_STATE_CHANNEL, wrappedListener);
      };
    },
  },
} satisfies DesktopBridge);
