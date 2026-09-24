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

export type Reply =
  | { ok: true; stats?: RunStats; undone?: boolean }
  | { ok: false; error: string };

export const send = (msg: Message): Promise<Reply> => chrome.runtime.sendMessage(msg);
