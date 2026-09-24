// End-to-end test against the REAL Jev API:
// launches Chrome for Testing with the built extension, opens 100 real sites,
// clicks "Organize", then checks the tab groups and scores accuracy.
//
//   1. put VITE_TYPESAFE_API_KEY=... in .env
//   2. npm run test:e2e            (HEADLESS=1 to hide the browser)
import { resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer";
import { TABS } from "./tabs";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST = resolve(ROOT, "dist");
const CONCURRENCY = 12;
const LOAD_TIMEOUT_MS = 20_000;

try {
  process.loadEnvFile(resolve(ROOT, ".env"));
} catch {}
const env = (name: string) => process.env[name]?.trim() || "";
const requested = env("VITE_JEV_PROVIDER");
const credentials = {
  typesafe: { apiKey: env("VITE_TYPESAFE_API_KEY") },
  openrouter: { apiKey: env("VITE_OPENROUTER_API_KEY") },
  vercel: { apiKey: env("VITE_AI_GATEWAY_API_KEY") },
  cloudflare: { apiKey: env("VITE_CLOUDFLARE_API_TOKEN"), accountId: env("VITE_CLOUDFLARE_ACCOUNT_ID") },
};
const withKeys = Object.entries(credentials).filter(([, c]) => c.apiKey).map(([id]) => id);
if (!withKeys.length) {
  console.error("No Jev provider key found. Add one to .env (see .env.example).");
  process.exit(1);
}
const provider = requested && requested !== "auto" ? requested : withKeys[0];
console.log(`Provider: ${provider}, backups on (keys for: ${withKeys.join(", ")})`);

let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS === "1",
  pipe: true,
  protocolTimeout: 90_000,
  enableExtensions: [DIST],
  defaultViewport: null,
  args: ["--no-first-run", "--window-size=1500,900"],
});

try {
  const worker = await browser.waitForTarget(
    (t) => t.type() === "service_worker" && t.url().endsWith("/background.js"),
    { timeout: 15_000 },
  );
  const extId = new URL(worker.url()).host;
  console.log(`Extension loaded: ${extId}`);

  // Open 100 real tabs, a few at a time.
  console.log(`Opening ${TABS.length} tabs…`);
  const started = Date.now();
  let next = 0;
  let loaded = 0;
  const pages: Page[] = new Array(TABS.length);
  const [firstPage] = await browser.pages();
  // Create tabs in order first so tab.index matches fixture order, then load them in parallel.
  for (let i = 0; i < TABS.length; i++) pages[i] = await browser.newPage();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < TABS.length) {
        const i = next++;
        await pages[i]
          .goto(TABS[i].url, { waitUntil: "domcontentloaded", timeout: LOAD_TIMEOUT_MS })
          .then(() => loaded++)
          .catch(() => {});
      }
    }),
  );
  console.log(`Loaded ${loaded}/${TABS.length} tabs in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // Use the initial blank tab as the extension popup page.
  const popup = firstPage;
  await popup.bringToFront(); // background tabs get throttled and can stall evaluate()/click()
  await popup.goto(`chrome-extension://${extId}/popup/index.html`);
  await popup.evaluate(
    async (provider, credentials) => {
      const { settings } = (await chrome.storage.local.get("settings")) as { settings?: object };
      await chrome.storage.local.set({ settings: { ...settings, provider, failover: true, credentials } });
      await chrome.storage.session.clear(); // no cached answers: force real Jev calls
    },
    provider,
    credentials,
  );

  // Snapshot tab id -> fixture before grouping reorders the strip.
  const before = await popup.evaluate(async () => {
    const win = await chrome.windows.getCurrent();
    return (await chrome.tabs.query({ windowId: win.id })).map((t) => ({ id: t.id!, index: t.index, url: t.url ?? "" }));
  });
  const fixtureByTab = new Map<number, (typeof TABS)[number]>();
  const byIndex = before.filter((t) => !t.url.startsWith("chrome-extension://")).sort((a, b) => a.index - b.index);
  byIndex.forEach((t, i) => TABS[i] && fixtureByTab.set(t.id, TABS[i]));
  check(fixtureByTab.size === TABS.length, `all ${TABS.length} tabs are in the organizer's window (${fixtureByTab.size})`);

  async function organize() {
    const t0 = Date.now();
    await popup.bringToFront();
    await popup.$eval("#organize", (b) => (b as HTMLButtonElement).click());
    await popup.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#organize")!.disabled,
      { timeout: 60_000 },
    );
    const status = await popup.$eval("#status", (el) => ({ text: el.textContent ?? "", error: el.className === "error" }));
    return { ...status, ms: Date.now() - t0 };
  }

  async function readGroups() {
    return popup.evaluate(async () => {
      const win = await chrome.windows.getCurrent();
      const groups = await chrome.tabGroups.query({ windowId: win.id });
      const tabs = await chrome.tabs.query({ windowId: win.id });
      return groups.map((g) => ({
        title: g.title ?? "",
        color: g.color,
        tabs: tabs.filter((t) => t.groupId === g.id).map((t) => ({ id: t.id!, title: t.title ?? "" })),
      }));
    });
  }

  // ---- Run 1: real classification ----
  console.log("\nRun 1: organizing with Jev…");
  const run1 = await organize();
  console.log(`  ${run1.text}  (${run1.ms} ms end-to-end)`);
  check(!run1.error, "organize succeeded");
  if (run1.error) throw new Error(run1.text);

  const groups = await readGroups();
  const grouped = groups.flatMap((g) => g.tabs.map((t) => ({ ...t, group: g.title })));
  check(grouped.length === TABS.length, `every tab is in a group (${grouped.length}/${TABS.length})`);
  check(new Set(groups.map((g) => g.title)).size === groups.length, "no duplicate group names");

  console.log("\nGroups:");
  for (const g of groups.sort((a, b) => b.tabs.length - a.tabs.length)) {
    console.log(`  [${g.color.padEnd(6)}] ${g.title.padEnd(14)} ${g.tabs.length} tabs`);
  }

  let correct = 0;
  const misses: string[] = [];
  for (const t of grouped) {
    const fx = fixtureByTab.get(t.id);
    if (!fx) continue;
    if (fx.expect === t.group) correct++;
    else misses.push(`  ${fx.url}\n      expected ${fx.expect}, got ${t.group}   (title: ${t.title.slice(0, 60)})`);
  }
  const accuracy = correct / TABS.length;
  console.log(`\nAccuracy vs expected folders: ${correct}/${TABS.length} (${(accuracy * 100).toFixed(0)}%)`);
  if (misses.length) console.log(`Mismatches:\n${misses.join("\n")}`);
  check(accuracy >= 0.7, "accuracy >= 70%");

  const lastRun = (await popup.evaluate(async () => (await chrome.storage.local.get("lastRun")).lastRun)) as {
    inputTokens: number;
    cost: number;
  };
  console.log(
    `\nCost: ${lastRun.inputTokens.toLocaleString()} input tokens = $${lastRun.cost.toFixed(6)} ` +
      `(≈ $${((lastRun.cost / TABS.length) * 1000).toFixed(4)} per 1,000 tabs)`,
  );

  // ---- Run 2: should reuse groups and hit the cache ----
  console.log("\nRun 2: organizing again (should reuse groups, use cache)…");
  const run2 = await organize();
  console.log(`  ${run2.text}  (${run2.ms} ms)`);
  const groups2 = await readGroups();
  check(groups2.length === groups.length, `same number of groups (${groups2.length})`);
  const run2Stats = (await popup.evaluate(async () => (await chrome.storage.local.get("lastRun")).lastRun)) as {
    inputTokens: number;
  };
  check(run2Stats.inputTokens === 0, "second run answered fully from cache (0 tokens)");

  // ---- Undo ----
  await popup.$eval("#undo", (b) => (b as HTMLButtonElement).click());
  await popup.waitForFunction(() => /Restored|Nothing/.test(document.querySelector("#status")!.textContent ?? ""));
  console.log(`\nUndo: ${await popup.$eval("#status", (el) => el.textContent)}`);
} catch (err) {
  failures++;
  console.error("\nERROR:", (err as Error).message);
} finally {
  if (process.env.KEEP_OPEN === "1") {
    console.log("\nKEEP_OPEN=1: browser left open, press Ctrl+C to exit.");
  } else {
    await browser.close();
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exitCode = failures ? 1 : 0;
