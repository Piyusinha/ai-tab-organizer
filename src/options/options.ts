import { CHROME_COLORS, DEFAULT_CATEGORIES, OTHER, type Category, type GroupColor } from "../categories";
import { choice, systemOne } from "../jev";
import { isConfigured, PROVIDERS, providerById, type ProviderId } from "../providers";
import { loadSettings, saveSettings, type Settings } from "../settings";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// Chrome's tab group palette, so folder dots match what you'll see in the tab strip.
const COLOR_HEX: Record<GroupColor, string> = {
  grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00", green: "#188038",
  pink: "#d01884", purple: "#a142f4", cyan: "#007b83", orange: "#fa903e",
};

const AVATARS: Record<ProviderId, { text: string; bg: string }> = {
  typesafe: { text: "TS", bg: "#2563eb" },
  openrouter: { text: "OR", bg: "#6366f1" },
  vercel: { text: "▲", bg: "#111111" },
  cloudflare: { text: "CF", bg: "#f38020" },
};

let settings: Settings;
/** Result of the last "Test connection" per provider (undefined = not tested). */
const keyWorks: Partial<Record<ProviderId, boolean>> = {};

// ---------- Autosave ----------

let saveTimer: number | undefined;
let toastTimer: number | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    settings.categories = readFolders();
    await saveSettings(settings);
    const toast = $("toast");
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 1200);
  }, 400);
  renderStatus();
}

function renderStatus() {
  const el = $("status");
  const p = providerById(settings.provider);
  const ready = isConfigured(p, settings.credentials[p.id]) && keyWorks[p.id] !== false;
  el.className = `status${ready ? " ok" : ""}`;
  el.textContent = ready ? `Ready · ${p.name}` : keyWorks[p.id] === false ? "Key not working" : "Not connected";
}

// ---------- Step 1: provider ----------

const btn = $<HTMLButtonElement>("providerBtn");
const panel = $("providerPanel");
const search = $<HTMLInputElement>("providerSearch");
const list = $("providerList");
const apiKey = $<HTMLInputElement>("apiKey");
const accountId = $<HTMLInputElement>("accountId");
const model = $<HTMLInputElement>("model");
const testResult = $("testResult");
let active = 0;

function avatar(id: ProviderId) {
  const a = AVATARS[id];
  return Object.assign(document.createElement("span"), {
    className: "avatar",
    textContent: a.text,
    style: `background:${a.bg}`,
  });
}

function connectedPill(id: ProviderId) {
  const hasKey = isConfigured(providerById(id), settings.credentials[id]);
  const [cls, text] = !hasKey
    ? ["pill", "Not set"]
    : keyWorks[id] === false
      ? ["pill err", "Key not working"]
      : keyWorks[id]
        ? ["pill ok", "Connected"]
        : ["pill ok", "Key added"];
  return Object.assign(document.createElement("span"), { className: cls, textContent: text });
}

function filtered() {
  const q = search.value.trim().toLowerCase();
  return PROVIDERS.filter((p) => !q || `${p.name} ${p.description}`.toLowerCase().includes(q));
}

function renderList() {
  const items = filtered();
  active = Math.min(active, Math.max(items.length - 1, 0));
  list.replaceChildren(
    ...items.map((p, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(p.id === settings.provider));
      if (i === active) li.classList.add("active");
      const main = Object.assign(document.createElement("span"), { className: "opt-main" });
      const text = Object.assign(document.createElement("span"), { className: "opt-name", textContent: p.name });
      text.append(Object.assign(document.createElement("span"), { className: "opt-desc", textContent: p.description }));
      main.append(avatar(p.id), text);
      li.append(main, connectedPill(p.id));
      li.addEventListener("mouseenter", () => {
        active = i;
        list.querySelectorAll("li").forEach((el, j) => el.classList.toggle("active", j === i));
      });
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectProvider(p.id);
      });
      return li;
    }),
  );
  if (!items.length) list.append(Object.assign(document.createElement("li"), { textContent: "No match", className: "muted" }));
}

function setOpen(show: boolean) {
  panel.hidden = !show;
  btn.setAttribute("aria-expanded", String(show));
  if (show) {
    search.value = "";
    active = Math.max(PROVIDERS.findIndex((p) => p.id === settings.provider), 0);
    renderList();
    search.focus();
  }
}

function selectProvider(id: ProviderId) {
  settings.provider = id;
  setOpen(false);
  renderProvider();
  save();
}

function renderProvider() {
  const p = providerById(settings.provider);
  const c = (settings.credentials[p.id] ??= { apiKey: "" });
  const label = $("providerLabel");
  const name = Object.assign(document.createElement("span"), { className: "opt-name", textContent: p.name });
  label.replaceChildren(avatar(p.id), name, connectedPill(p.id));

  $("keyLabel").textContent = p.keyLabel;
  $<HTMLAnchorElement>("keyLink").href = p.keyUrl;
  apiKey.value = c.apiKey;
  $("accountField").hidden = !p.needsAccountId;
  accountId.value = c.accountId ?? "";
  model.value = c.model ?? "";
  model.placeholder = p.defaultModel;
  testResult.hidden = true;
}

function updateCreds() {
  const c = (settings.credentials[settings.provider] ??= { apiKey: "" });
  c.apiKey = apiKey.value.trim();
  c.accountId = accountId.value.trim();
  c.model = model.value.trim();
  delete keyWorks[settings.provider];
  const label = $("providerLabel");
  label.lastElementChild?.replaceWith(connectedPill(settings.provider));
  save();
}

function refreshPills() {
  $("providerLabel").lastElementChild?.replaceWith(connectedPill(settings.provider));
  renderStatus();
}

async function testConnection() {
  const id = settings.provider;
  const p = providerById(id);
  const creds = settings.credentials[id];
  testResult.hidden = false;
  if (!isConfigured(p, creds)) {
    testResult.className = "pill err";
    testResult.textContent = p.needsAccountId ? "Add your key and account ID first" : "Paste a key first";
    return;
  }
  testResult.className = "pill busy";
  testResult.textContent = "Checking…";
  const t0 = performance.now();
  try {
    await systemOne(id, creds, {
      state: { title: "microsoft/TypeScript on GitHub", domain: "github.com" },
      questions: { q: choice("Which folder fits this tab?", { Dev: "Code", Shopping: "Stores" }) },
    });
    keyWorks[id] = true;
    refreshPills();
    if (settings.provider !== id) return;
    testResult.className = "pill ok";
    testResult.textContent = `✓ Connected · ${Math.round(performance.now() - t0)} ms`;
  } catch (err) {
    keyWorks[id] = false;
    refreshPills();
    if (settings.provider !== id) return;
    testResult.className = "pill err";
    testResult.textContent = (err as Error).message.replace(`${p.name}: `, "");
  }
}

btn.addEventListener("click", () => setOpen(!!panel.hidden));
search.addEventListener("input", () => {
  active = 0;
  renderList();
});
search.addEventListener("keydown", (e) => {
  const items = filtered();
  if (e.key === "ArrowDown") active = Math.min(active + 1, items.length - 1);
  else if (e.key === "ArrowUp") active = Math.max(active - 1, 0);
  else if (e.key === "Enter" && items[active]) return selectProvider(items[active].id);
  else if (e.key === "Escape") return setOpen(false);
  else return;
  e.preventDefault();
  renderList();
});
document.addEventListener("click", (e) => {
  if (!$("combo").contains(e.target as Node)) setOpen(false);
});

for (const input of [apiKey, accountId, model]) input.addEventListener("input", updateCreds);
// Pasting a key checks it right away.
apiKey.addEventListener("paste", () => setTimeout(testConnection, 0));
$("test").addEventListener("click", testConnection);
$("reveal").addEventListener("click", () => {
  apiKey.type = apiKey.type === "password" ? "text" : "password";
});
$<HTMLInputElement>("failover").addEventListener("change", (e) => {
  settings.failover = (e.target as HTMLInputElement).checked;
  save();
});

// ---------- Step 2: folders ----------

const folders = $("folders");

function closePalettes() {
  folders.querySelectorAll(".palette").forEach((p) => p.remove());
}

function folderRow(c: Category, isOther = false) {
  const li = Object.assign(document.createElement("li"), { className: `folder${isOther ? " folder-other" : ""}` });
  li.dataset.color = c.color;

  const dotBtn = Object.assign(document.createElement("button"), { className: "dot-btn", title: "Change color" });
  const dot = Object.assign(document.createElement("span"), { className: "dot" });
  dot.style.background = COLOR_HEX[c.color];
  dotBtn.append(dot);
  dotBtn.disabled = isOther;
  dotBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = li.querySelector(".palette");
    closePalettes();
    if (wasOpen) return;
    const pal = Object.assign(document.createElement("div"), { className: "palette" });
    for (const col of CHROME_COLORS) {
      const b = Object.assign(document.createElement("button"), { title: col });
      b.style.background = COLOR_HEX[col];
      b.setAttribute("aria-pressed", String(li.dataset.color === col));
      b.addEventListener("click", () => {
        li.dataset.color = col;
        dot.style.background = COLOR_HEX[col];
        closePalettes();
        save();
      });
      pal.append(b);
    }
    li.append(pal);
  });

  const text = Object.assign(document.createElement("div"), { className: "folder-text" });
  const name = Object.assign(document.createElement("input"), { className: "name", value: c.name, placeholder: "Folder name" });
  const desc = Object.assign(document.createElement("input"), {
    className: "desc",
    value: c.description,
    placeholder: "What goes here? e.g. GitHub, docs, Stack Overflow",
  });
  name.readOnly = desc.readOnly = isOther;
  name.addEventListener("input", save);
  desc.addEventListener("input", save);
  text.append(name, desc);

  const remove = Object.assign(document.createElement("button"), { className: "remove", title: "Remove folder", textContent: "×" });
  remove.addEventListener("click", () => {
    li.remove();
    save();
  });

  li.append(dotBtn, text, remove);
  return li;
}

function renderFolders(categories: Category[]) {
  folders.replaceChildren(
    ...categories.map((c) => folderRow(c)),
    folderRow({ name: OTHER, description: "Tabs that don't clearly fit anywhere else", color: "grey" }, true),
  );
}

function readFolders(): Category[] {
  const seen = new Set<string>();
  const out: Category[] = [];
  for (const li of folders.querySelectorAll<HTMLLIElement>(".folder:not(.folder-other)")) {
    const name = li.querySelector<HTMLInputElement>(".name")!.value.trim();
    const description = li.querySelector<HTMLInputElement>(".desc")!.value.trim();
    if (!name || name === OTHER || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, description, color: li.dataset.color as GroupColor });
  }
  return out;
}

$("add").addEventListener("click", () => {
  const used = new Set(readFolders().map((c) => c.color));
  const color = CHROME_COLORS.find((c) => !used.has(c)) ?? "grey";
  const row = folderRow({ name: "", description: "", color });
  folders.insertBefore(row, folders.querySelector(".folder-other"));
  row.querySelector<HTMLInputElement>(".name")!.focus();
});
$("reset").addEventListener("click", () => {
  renderFolders(DEFAULT_CATEGORIES);
  save();
});
document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".palette")) closePalettes();
});

// ---------- Step 3: preferences ----------

const strictness = $("strictness");
function renderStrictness() {
  const buttons = [...strictness.querySelectorAll<HTMLButtonElement>("button")];
  const nearest = buttons.reduce((a, b) =>
    Math.abs(Number(b.dataset.value) - settings.threshold) < Math.abs(Number(a.dataset.value) - settings.threshold) ? b : a,
  );
  for (const b of buttons) b.setAttribute("aria-checked", String(b === nearest));
}
strictness.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  settings.threshold = Number(b.dataset.value);
  renderStrictness();
  save();
});

for (const key of ["skipPinned", "collapse", "showCounts"] as const) {
  $<HTMLInputElement>(key).addEventListener("change", (e) => {
    settings[key] = (e.target as HTMLInputElement).checked;
    save();
  });
}

// ---------- Init ----------

loadSettings().then((s) => {
  settings = structuredClone(s);
  renderProvider();
  renderStatus();
  $<HTMLInputElement>("failover").checked = s.failover;
  renderFolders(s.categories);
  renderStrictness();
  $<HTMLInputElement>("skipPinned").checked = s.skipPinned;
  $<HTMLInputElement>("collapse").checked = s.collapse;
  $<HTMLInputElement>("showCounts").checked = s.showCounts;
});
