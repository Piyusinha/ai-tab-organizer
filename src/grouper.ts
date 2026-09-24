import { OTHER, type Category, type GroupColor } from "./categories";

const NO_GROUP = chrome.tabGroups.TAB_GROUP_ID_NONE;

interface UndoSnapshot {
  /** tabId -> groupId it had before the last organize (NO_GROUP if ungrouped). */
  previous: Record<number, number>;
}

type TabIds = [number, ...number[]];
/** chrome's typings require a non-empty tuple; callers only pass non-empty lists. */
const ids1 = (ids: number[]) => ids as TabIds;

const baseTitle = (title = "") => title.replace(/\s\(\d+\)$/, "");

export interface ApplyOptions {
  windowId: number;
  categories: Category[];
  collapse: boolean;
  showCounts: boolean;
}

/** Move tabs into one group per category, reusing existing groups whose title matches. */
export async function applyGroups(groups: Map<string, number[]>, opts: ApplyOptions): Promise<void> {
  const tabIds = [...groups.values()].flat();
  const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id)));
  const snapshot: UndoSnapshot = { previous: {} };
  for (const t of tabs) snapshot.previous[t.id!] = t.groupId;
  await chrome.storage.session.set({ undo: snapshot });

  const existing = await chrome.tabGroups.query({ windowId: opts.windowId });
  const byTitle = new Map(existing.map((g) => [baseTitle(g.title), g.id]));
  const colors = new Map<string, GroupColor>(opts.categories.map((c) => [c.name, c.color]));

  // Put "Other" last so the named groups sit first in the tab strip.
  const ordered = [...groups.entries()].sort(([a], [b]) => Number(a === OTHER) - Number(b === OTHER));
  for (const [name, ids] of ordered) {
    const reuse = byTitle.get(name);
    const groupId =
      reuse !== undefined
        ? await chrome.tabs.group({ tabIds: ids1(ids), groupId: reuse })
        : await chrome.tabs.group({ tabIds: ids1(ids), createProperties: { windowId: opts.windowId } });
    const count = (await chrome.tabs.query({ groupId })).length;
    await chrome.tabGroups.update(groupId, {
      title: opts.showCounts ? `${name} (${count})` : name,
      color: colors.get(name) ?? "grey",
      collapsed: opts.collapse,
    });
  }
}

/** Restore the grouping from before the last organize. Returns false if there is nothing to undo. */
export async function undoLast(): Promise<boolean> {
  const { undo } = (await chrome.storage.session.get("undo")) as { undo?: UndoSnapshot };
  if (!undo) return false;

  const liveGroups = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
  const liveTabs = new Set((await chrome.tabs.query({})).map((t) => t.id));
  const toUngroup: number[] = [];
  const toRegroup = new Map<number, number[]>();

  for (const [key, groupId] of Object.entries(undo.previous)) {
    const tabId = Number(key);
    if (!liveTabs.has(tabId)) continue;
    if (groupId !== NO_GROUP && liveGroups.has(groupId)) {
      toRegroup.set(groupId, [...(toRegroup.get(groupId) ?? []), tabId]);
    } else {
      toUngroup.push(tabId);
    }
  }
  if (toUngroup.length) await chrome.tabs.ungroup(ids1(toUngroup));
  for (const [groupId, tabIds] of toRegroup) await chrome.tabs.group({ groupId, tabIds: ids1(tabIds) });
  await chrome.storage.session.remove("undo");
  return true;
}

export async function ungroupAll(windowId: number): Promise<void> {
  const grouped = (await chrome.tabs.query({ windowId })).filter((t) => t.groupId !== NO_GROUP);
  if (grouped.length) await chrome.tabs.ungroup(ids1(grouped.map((t) => t.id!)));
}
