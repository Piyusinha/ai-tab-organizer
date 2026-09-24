export type Message =
  | { type: "organize"; windowId: number }
  | { type: "undo" }
  | { type: "ungroup"; windowId: number };

export interface RunStats {
  tabs: number;
  groups: number;
  inputTokens: number;
  /** USD */
  cost: number;
  /** Tabs answered from the local cache (no API cost). */
  cached: number;
  /** Display names of the gateways that answered. */
  providers: string[];
}

/** A failure the popup can show compactly: one-line title, a hint, and what to offer next. */
export interface ErrorInfo {
  title: string;
  hint: string;
  /** Short per-provider lines when several providers were tried. */
  attempts: string[];
  retry: boolean;
  openOptions: boolean;
  /** Provider whose failure the chip should reflect. */
  provider?: string;
}

export type Reply =
  | { ok: true; stats?: RunStats; undone?: boolean }
  | { ok: false; error: ErrorInfo };

export const send = (msg: Message): Promise<Reply> => chrome.runtime.sendMessage(msg);
