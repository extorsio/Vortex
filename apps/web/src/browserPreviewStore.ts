import { type ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

import {
  observeBrowserPreviewUrlsFromText,
  type BrowserPreviewUrlObservation,
} from "./browserPreview";

const MAX_TERMINAL_OBSERVATIONS_PER_THREAD = 24;

interface BrowserPreviewStoreState {
  terminalObservationsByThreadId: Record<ThreadId, BrowserPreviewUrlObservation[]>;
  recordTerminalText: (threadId: ThreadId, text: string, observedAt: string) => void;
}

export const useBrowserPreviewStore = create<BrowserPreviewStoreState>((set) => ({
  terminalObservationsByThreadId: {},
  recordTerminalText: (threadId, text, observedAt) => {
    const nextObservations = observeBrowserPreviewUrlsFromText(text, observedAt, "terminal");
    if (nextObservations.length === 0) {
      return;
    }

    set((state) => {
      const current = state.terminalObservationsByThreadId[threadId] ?? [];
      const next = [...current];

      for (const observation of nextObservations) {
        const existingIndex = next.findIndex((entry) => entry.url === observation.url);
        if (existingIndex >= 0) {
          next.splice(existingIndex, 1);
        }
        next.push(observation);
      }

      const limited = next.slice(-MAX_TERMINAL_OBSERVATIONS_PER_THREAD);
      return {
        terminalObservationsByThreadId: {
          ...state.terminalObservationsByThreadId,
          [threadId]: limited,
        },
      };
    });
  },
}));
