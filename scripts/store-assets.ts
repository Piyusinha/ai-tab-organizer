// Renders Chrome Web Store images into release/store/:
//   screenshot-1-hero.png, screenshot-2-settings.png (1280x800), promo-small.png (440x280)
// Run after `npm run package` (uses the store build in release/dist).
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "release/dist");
const out = resolve(root, "release/store");
mkdirSync(out, { recursive: true });
const icon = `data:image/svg+xml;base64,${readFileSync(resolve(root, "scripts/icon.svg")).toString("base64")}`;

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [dist] });
const worker = await browser.waitForTarget((t) => t.type() === "service_worker");
const extId = new URL(worker.url()).host;
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

// Demo state: a connected provider (fake key, never used for a request).
await page.goto(`chrome-extension://${extId}/popup/index.html`);
await page.evaluate(() =>
  chrome.storage.local.set({
    settings: { provider: "openrouter", failover: true, credentials: { openrouter: { apiKey: "demo" } } },
  }),
);

// 1) Popup, captured at 2x to embed in the hero image.
await page.setViewport({ width: 280, height: 150, deviceScaleFactor: 2 });
await page.reload();
await page.evaluate(() => {
  const s = document.getElementById("status")!;
  s.textContent = "Sorted 42 tabs into 8 folders";
  s.className = "muted";
});
const popupPng = await page.screenshot({ encoding: "base64", fullPage: true });

// 2) Settings page screenshot.
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.goto(`chrome-extension://${extId}/options/index.html`);
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${out}/screenshot-2-settings.png` });

// 3) Hero: headline + illustrated tab strip + real popup.
const groups = [
  ["Dev", "#1a73e8", ["GitHub", "MDN", "Stack Overflow"]],
  ["AI", "#a142f4", ["Claude", "Hugging Face"]],
  ["Shopping", "#188038", ["Amazon", "Etsy"]],
  ["News", "#fa903e", ["BBC", "Reuters"]],
] as const;
const strip = groups
  .map(
    ([name, color, tabs]) =>
      `<div class="grp"><span class="label" style="background:${color}">${name}</span>${tabs
        .map((t) => `<span class="tab" style="border-color:${color}">${t}</span>`)
        .join("")}</div>`,
  )
  .join("");

const heroCss = `
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  width:1280px;height:800px;background:linear-gradient(135deg,#eef2ff,#f8fafc 55%,#ecfeff);color:#0f172a;overflow:hidden}
  .wrap{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;height:100%;padding:0 80px}
  .brand{display:flex;align-items:center;gap:14px;font-weight:700;font-size:22px;margin-bottom:28px}
  .brand img{width:52px;height:52px}
  h1{font-size:54px;line-height:1.05;margin:0 0 18px;letter-spacing:-.02em}
  p{font-size:21px;color:#475569;margin:0 0 26px;line-height:1.45}
  ul{list-style:none;padding:0;margin:0;font-size:18px;color:#334155} li{margin:10px 0} li::before{content:"✓  ";color:#2563eb;font-weight:700}
  .browser{background:#fff;border-radius:16px;box-shadow:0 30px 60px rgba(15,23,42,.18);overflow:hidden;border:1px solid #e2e8f0}
  .bar{background:#dee3ea;padding:12px 12px 0;display:flex;flex-wrap:wrap;gap:8px 14px}
  .grp{display:flex;align-items:center;gap:4px;padding-bottom:10px}
  .label{color:#fff;font-size:13px;font-weight:700;padding:4px 10px;border-radius:7px}
  .tab{background:#fff;font-size:12.5px;padding:6px 10px;border-radius:8px 8px 0 0;border-bottom:3px solid;color:#334155}
  .body{height:300px;position:relative;background:#f8fafc}
  .popup{position:absolute;right:22px;top:14px;width:280px;border-radius:12px;box-shadow:0 16px 40px rgba(15,23,42,.25);border:1px solid #e2e8f0}`;

await page.setContent(`<!doctype html><style>${heroCss}</style>
  <div class="wrap">
    <div>
      <div class="brand"><img src="${icon}">AI Tab Organizer</div>
      <h1>Tidy tabs.<br>One click.</h1>
      <p>Your open tabs are sorted into named, colored folders, so you find what you need fast.</p>
      <ul><li>Works with Chrome's own tab groups</li><li>Customize folders and colors</li><li>Undo anytime · Alt+Shift+O</li></ul>
    </div>
    <div class="browser"><div class="bar">${strip}</div>
      <div class="body"><img class="popup" src="data:image/png;base64,${popupPng}"></div></div>
  </div>`);
await page.screenshot({ path: `${out}/screenshot-1-hero.png` });

// 4) Small promo tile.
await page.setViewport({ width: 440, height: 280 });
await page.setContent(`<!doctype html><style>
  body{margin:0;width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff}
  img{width:88px;height:88px;filter:drop-shadow(0 8px 16px rgba(0,0,0,.25))} b{font-size:30px;letter-spacing:-.01em}
  span{font-size:16px;opacity:.9}</style>
  <img src="${icon}"><b>AI Tab Organizer</b><span>Sort tabs into folders in one click</span>`);
await page.screenshot({ path: `${out}/promo-small.png` });

await browser.close();
console.log(`Store images written to ${out}`);
