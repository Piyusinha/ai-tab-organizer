import { buildRequests, resolveAnswers, type TabInfo } from "./classify";
import { applyGroups, undoLast, ungroupAll } from "./grouper";
import { callJev, JEV_INPUT_PRICE, JevError } from "./jev";
import { isConfigured, providerById, PROVIDERS } from "./providers";
import { loadSettings } from "./settings";
import type { ErrorInfo, Message, Reply, RunStats } from "./messages";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  category: string;
  at: number;
}

/** Cached answers are only valid for the category list they were produced with. */
const cacheKey = (categoriesSig: string, url: string) => `c:${categoriesSig}:${url}`;

async function organize(windowId: number): Promise<RunStats> {
  const settings = await loadSettings();
  if (!PROVIDERS.some((p) => isConfigured(p, settings.credentials[p.id]))) {
    throw new JevError("No provider is connected yet", "not_connected");
  }

  const tabs: TabInfo[] = (await chrome.tabs.query({ windowId }))
    .filter((t) => t.id !== undefined && /^https?:/.test(t.url ?? ""))
    .filter((t) => !(settings.skipPinned && t.pinned))
    .map((t) => ({ id: t.id!, title: t.title ?? "", url: t.url! }));
  if (!tabs.length) return { tabs: 0, groups: 0, inputTokens: 0, cost: 0, cached: 0, providers: [] };

  // Reuse recent answers for URLs we've already classified.
  const sig = JSON.stringify(settings.categories.map((c) => [c.name, c.description]));
  const keys = tabs.map((t) => cacheKey(sig, t.url));
  const cache = (await chrome.storage.session.get(keys)) as Record<string, CacheEntry>;
  const now = Date.now();
  const groups = new Map<string, number[]>();
  const pending: TabInfo[] = [];
  tabs.forEach((t, i) => {
    const hit = cache[keys[i]];
    if (hit && now - hit.at < CACHE_TTL_MS) {
      groups.set(hit.category, [...(groups.get(hit.category) ?? []), t.id]);
    } else {
      pending.push(t);
    }
  });

  let inputTokens = 0;
  let cost = 0;
  const used = new Set<string>();
  if (pending.length) {
    const results = await Promise.all(
      buildRequests(pending, settings.categories).map((req) =>
        callJev(settings.provider, settings.failover, settings.credentials, req),
      ),
    );
    const responses = results.map((r) => r.response);
    for (const r of results) {
      const tokens = r.response.usage?.input_tokens ?? 0;
      inputTokens += tokens;
      cost += r.response.usage?.cost ?? tokens * JEV_INPUT_PRICE;
      used.add(providerById(r.provider).name);
    }

    const fresh = resolveAnswers(pending, responses, settings.categories, settings.threshold);
    const urlById = new Map(pending.map((t) => [t.id, t.url]));
    const toCache: Record<string, CacheEntry> = {};
    for (const [category, ids] of fresh) {
      groups.set(category, [...(groups.get(category) ?? []), ...ids]);
      for (const id of ids) toCache[cacheKey(sig, urlById.get(id)!)] = { category, at: now };
    }
    await chrome.storage.session.set(toCache);
  }

  await applyGroups(groups, {
    windowId,
    categories: settings.categories,
    collapse: settings.collapse,
    showCounts: settings.showCounts,
  });

  const stats: RunStats = {
    tabs: tabs.length,
    groups: groups.size,
    inputTokens,
    cost,
    cached: tabs.length - pending.length,
    providers: [...used],
  };
  await chrome.storage.local.set({ lastRun: stats });
  return stats;
}

async function describeError(err: unknown): Promise<ErrorInfo> {
  if (!(err instanceof JevError)) {
    console.error("[Tab Organizer]", err);
    return {
      title: "Something went wrong",
      hint: String((err as Error)?.message ?? err).slice(0, 140),
      attempts: [],
      retry: true,
      openOptions: false,
    };
  }
  // Full provider response goes to the service-worker console only, never the popup.
  if (err.detail) console.warn("[Tab Organizer] Jev call failed:", err.detail);

  const settings = await loadSettings();
  const connected = PROVIDERS.filter((p) => isConfigured(p, settings.credentials[p.id])).length;
  const transient = err.kind === "unavailable" || err.kind === "rate_limit" || err.kind === "network";
  // The chip shows the primary provider, which is always the first attempt.
  const primaryFailed = err.attempts[0]?.provider;
  const needsBackup = transient && connected < 2;

  let hint: string;
  if (err.kind === "not_connected") hint = "Add an API key in Options to start sorting.";
  else if (err.kind === "auth") hint = "Check the key in Options, or pick another provider.";
  else if (err.kind === "network") hint = "Check your internet connection and try again.";
  else if (transient) hint = needsBackup ? "Try again in a moment, or add a backup provider in Options." : "This is usually temporary. Try again in a moment.";
  else hint = "Try again. If it keeps happening, check your settings.";

  return {
    title: err.message,
    hint,
    attempts: err.attempts.length > 1 ? err.attempts.map((a) => a.message) : [],
    retry: err.kind !== "not_connected" && err.kind !== "auth",
    openOptions: err.kind === "not_connected" || err.kind === "auth" || needsBackup,
    provider: primaryFailed ? providerById(primaryFailed).name : undefined,
  };
}

async function handle(msg: Message): Promise<Reply> {
  try {
    switch (msg.type) {
      case "organize":
        return { ok: true, stats: await organize(msg.windowId) };
      case "undo":
        return { ok: true, undone: await undoLast() };
      case "ungroup":
        await ungroupAll(msg.windowId);
        return { ok: true };
    }
  } catch (err) {
    return { ok: false, error: await describeError(err) };
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg).then(sendResponse);
  return true; // keep the channel open for the async reply
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "organize-tabs") return;
  const win = await chrome.windows.getLastFocused();
  if (win.id === undefined) return;
  const reply = await handle({ type: "organize", windowId: win.id });
  await chrome.action.setBadgeText({ text: reply.ok ? "" : "!" });
});

// First install: open settings so the user can connect a provider.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.runtime.openOptionsPage();
});
