import { send, type ErrorInfo, type Reply, type RunStats } from "../messages";
import { isConfigured, PROVIDERS, providerById } from "../providers";
import { loadSettings } from "../settings";

type Ok = Extract<Reply, { ok: true }>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");
const buttons = [...document.querySelectorAll<HTMLButtonElement>("button:not(.chip)")];
const alertBox = $("alert");
let chipName: string | null = null;

function showProvider(name: string | null, backups = 0) {
  chipName = name;
  const chip = $("provider");
  chip.className = `chip${name ? " ok" : ""}`;
  $("providerName").textContent = name ?? "Not connected";
  chip.title = name
    ? `Using ${name}${backups ? ` (+${backups} backup${backups > 1 ? "s" : ""})` : ""}. Click to change.`
    : "Add an API key in Options";
}

function show(text: string) {
  alertBox.hidden = true;
  status.textContent = text;
  status.className = "muted";
}

function showError(e: ErrorInfo) {
  status.textContent = "";
  $("alertTitle").textContent = e.title;
  $("alertHint").textContent = e.hint;
  $("alertAttempts").replaceChildren(...e.attempts.map((a) => Object.assign(document.createElement("li"), { textContent: a })));
  $("retry").hidden = !e.retry;
  $("alertOptions").hidden = !e.openOptions;
  // Amber for "try again later" problems, red for things the user must fix.
  alertBox.className = `alert${e.retry ? "" : " error"}`;
  alertBox.hidden = false;
  if (e.provider && e.provider === chipName) {
    $("provider").className = "chip warn";
    $("provider").title = `${e.provider}: ${e.title}. Click to change provider.`;
  }
}

function describe(s: RunStats): string {
  if (!s.tabs) return "No tabs to sort";
  return `Sorted ${s.tabs} tab${s.tabs === 1 ? "" : "s"} into ${s.groups} folder${s.groups === 1 ? "" : "s"}`;
}

async function run(label: string, action: () => ReturnType<typeof send>, done: (r: Ok) => string) {
  buttons.forEach((b) => (b.disabled = true));
  show(label);
  const reply = await action();
  buttons.forEach((b) => (b.disabled = false));
  if (reply.ok) show(done(reply));
  else showError(reply.error);
}

async function windowId() {
  return (await chrome.windows.getCurrent()).id!;
}

$("organize").addEventListener("click", async () => {
  const id = await windowId();
  run("Sorting tabs…", () => send({ type: "organize", windowId: id }), (r) => {
    // Show the provider that actually answered (may be a backup).
    if (r.stats?.providers.length) showProvider(r.stats.providers.join(" + "));
    else showProvider(chipName); // answered from cache: clear any earlier warning state
    return describe(r.stats!);
  });
});

$("undo").addEventListener("click", () =>
  run("Restoring…", () => send({ type: "undo" }), (r) => (r.undone ? "Restored previous grouping" : "Nothing to undo")),
);

$("ungroup").addEventListener("click", async () => {
  const id = await windowId();
  run("Ungrouping…", () => send({ type: "ungroup", windowId: id }), () => "All tabs ungrouped");
});

$("retry").addEventListener("click", () => $("organize").click());

for (const id of ["options", "provider", "alertOptions"]) {
  $(id).addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

loadSettings().then((settings) => {
  const connected = PROVIDERS.filter((p) => isConfigured(p, settings.credentials[p.id]));
  const primary = providerById(settings.provider);
  const primaryOk = connected.includes(primary);
  // The provider tried first: the chosen one, or the first backup if it has no key.
  const current = primaryOk ? primary : settings.failover ? connected[0] : undefined;
  showProvider(current?.name ?? null, settings.failover ? connected.length - 1 : 0);
  if (!current) show("Add an API key in Options to get started.");
});
