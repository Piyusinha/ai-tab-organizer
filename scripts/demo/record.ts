// Records a real end-to-end demo: install → connect a provider → messy tabs → Organize → folders.
// Everything shown is captured from a real Chrome for Testing session with the store build loaded,
// and the tab strip is drawn from the live chrome.tabs / chrome.tabGroups state.
//
//   npm run package                                  # builds release/dist
//   VITE_AI_GATEWAY_API_KEY=... in .env
//   npx tsx scripts/demo/record.ts                   # → release/demo/demo.mp4 + demo.gif
//
// The key is typed into a password field (shown as dots) and never logged.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST = resolve(ROOT, "release/dist");
const OUT = resolve(ROOT, "release/demo");
const FRAMES = resolve(OUT, "frames");
const W = 1280;
const H = 800;
const TOP = 88; // tab strip + toolbar height in the stage
const CONTENT_H = H - TOP;

try {
  process.loadEnvFile(resolve(ROOT, ".env"));
} catch {}
const KEY = process.env.VITE_AI_GATEWAY_API_KEY?.trim();
if (!KEY) {
  console.error("Set VITE_AI_GATEWAY_API_KEY in .env first.");
  process.exit(1);
}

// Interleaved on purpose so the "before" strip looks messy.
const SITES = [
  "https://github.com/microsoft/TypeScript",
  "https://www.youtube.com/",
  "https://www.ebay.com/",
  "https://www.bbc.com/news",
  "https://huggingface.co/models",
  "https://stackoverflow.com/questions/tagged/typescript",
  "https://open.spotify.com/",
  "https://www.airbnb.com/",
  "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  "https://www.imdb.com/chart/top/",
  "https://www.theguardian.com/international",
  "https://www.coursera.org/",
  "https://en.wikipedia.org/wiki/Alan_Turing",
  "https://soundcloud.com/discover",
  "https://www.booking.com/",
  "https://vitejs.dev/guide/",
  "https://www.khanacademy.org/",
  "https://apnews.com/",
  "https://www.ikea.com/us/en/",
  "https://www.figma.com/",
];
const WANT_TABS = 16;
const BLOCKED = /just a moment|access denied|attention required|403|forbidden|captcha|robot|are you a human|not available|error|security check|verify/i;

const GROUP_HEX: Record<string, string> = {
  grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00", green: "#188038",
  pink: "#d01884", purple: "#a142f4", cyan: "#007b83", orange: "#fa903e",
};

interface StripTab { id: number; title: string; favIconUrl?: string; groupId: number; active?: boolean }
interface StripGroup { id: number; title: string; color: string }
interface Stage {
  tabs: StripTab[];
  groups: StripGroup[];
  url: string;
  content: string; // data URL
  popup?: string; // data URL
  caption?: { step?: string; text: string };
  cursor?: { x: number; y: number; click?: boolean };
  card?: { title: string; sub: string };
  /** Result panel listing each real group and its tabs. */
  summary?: boolean;
}

const icon = `data:image/png;base64,${readFileSync(resolve(ROOT, "public/icons/icon128.png")).toString("base64")}`;
const png = (b64: string) => `data:image/png;base64,${b64}`;

// ---------- frame recording ----------

let frameNo = 0;
const timeline: { file: string; duration: number }[] = [];
let stage: Page;
let current: Stage;

async function frame(state: Partial<Stage>, duration: number) {
  current = { ...current, ...state };
  await stage.evaluate((s) => (window as any).render(s), current as any);
  await stage.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  const file = resolve(FRAMES, `f${String(++frameNo).padStart(4, "0")}.png`);
  await stage.screenshot({ path: file as `${string}.png` });
  timeline.push({ file, duration });
}

/** Smoothly move the cursor, then optionally click. */
async function moveTo(x: number, y: number, click = false) {
  const from = current.cursor ?? { x: W / 2, y: H / 2 };
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
    await frame({ cursor: { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e } }, 0.045);
  }
  if (click) await frame({ cursor: { x, y, click: true } }, 0.18);
  await frame({ cursor: { x, y } }, 0.1);
}

// ---------- the stage (fake window frame, real content) ----------

const STAGE_HTML = `<!doctype html><html><head><style>
  *{box-sizing:border-box} body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#dfe3e8;
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;position:relative}
  .strip{height:46px;display:flex;align-items:flex-end;padding:0 8px 0 84px;gap:2px;position:relative;background:#dfe3e8}
  .lights{position:absolute;left:16px;top:17px;display:flex;gap:8px}
  .lights i{width:12px;height:12px;border-radius:50%;display:block}
  .tab{height:36px;flex:1 1 0;min-width:28px;max-width:220px;display:flex;align-items:center;gap:7px;padding:0 10px;
    border-radius:9px 9px 0 0;font-size:12px;color:#3c4043;white-space:nowrap;overflow:hidden;position:relative}
  .tab.active{background:#fff}
  .tab span{overflow:hidden;text-overflow:ellipsis}
  .tab img,.tab .fav{width:16px;height:16px;flex:none;border-radius:3px}
  .tab .fav{background:#9aa0a6;color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center}
  .tab .bar{position:absolute;left:4px;right:4px;bottom:0;height:3px;border-radius:3px 3px 0 0}
  .chip{flex:none;height:24px;margin-bottom:6px;padding:0 10px;border-radius:7px;color:#fff;font-size:12.5px;font-weight:700;
    display:flex;align-items:center;white-space:nowrap}
  .toolbar{height:42px;background:#fff;display:flex;align-items:center;gap:14px;padding:0 14px;border-bottom:1px solid #e3e5e8}
  .nav{color:#5f6368;font-size:17px;width:18px;text-align:center}
  .url{flex:1;height:30px;border-radius:15px;background:#f1f3f4;display:flex;align-items:center;padding:0 14px;font-size:13.5px;color:#202124;gap:8px}
  .url b{color:#5f6368;font-weight:400}
  .ext{width:28px;height:28px;border-radius:7px;display:grid;place-items:center}
  .ext img{width:20px;height:20px}
  .ext.on{background:#e8eaed}
  .avatar{width:26px;height:26px;border-radius:50%;background:#8ab4f8}
  .content{position:absolute;left:0;top:${TOP}px;width:${W}px;height:${CONTENT_H}px;background:#fff}
  .content img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
  .popup{position:absolute;right:14px;top:${TOP - 2}px;width:280px;border-radius:10px;overflow:hidden;
    box-shadow:0 10px 36px rgba(0,0,0,.28);border:1px solid #dadce0;background:#fff}
  .popup img{display:block;width:100%}
  .caption{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;
    background:rgba(17,24,39,.9);color:#fff;padding:12px 22px 12px 12px;border-radius:999px;font-size:20px;font-weight:600;
    box-shadow:0 10px 30px rgba(0,0,0,.25);white-space:nowrap}
  .caption .n{background:#3b82f6;border-radius:999px;padding:4px 12px;font-size:15px;font-weight:700}
  .caption.nostep{padding-left:22px}
  .cursor{position:absolute;width:26px;height:26px;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
  .ripple{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(59,130,246,.35);
    border:2px solid rgba(59,130,246,.8)}
  .summary{position:absolute;left:50%;top:${TOP + 34}px;transform:translateX(-50%);width:1120px;background:rgba(255,255,255,.97);
    border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.3);padding:22px 26px 26px;border:1px solid #e5e7eb}
  .summary h2{margin:0 0 16px;font-size:22px;color:#111827;display:flex;align-items:center;gap:10px}
  .summary h2 small{font-size:15px;font-weight:500;color:#6b7280}
  .cols{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .col{border:1px solid #eef0f3;border-radius:12px;overflow:hidden;background:#fff}
  .col .hd{color:#fff;font-weight:700;font-size:15px;padding:8px 12px;display:flex;justify-content:space-between}
  .col ul{list-style:none;margin:0;padding:6px 0}
  .col li{display:flex;align-items:center;gap:8px;padding:5px 12px;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden}
  .col li span{overflow:hidden;text-overflow:ellipsis}
  .col li img,.col li .fav{width:16px;height:16px;flex:none;border-radius:3px}
  .col li .fav{background:#9aa0a6;color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;font-style:normal}
  .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
    background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;text-align:center}
  .card img{width:120px;height:120px;filter:drop-shadow(0 10px 22px rgba(0,0,0,.25))}
  .card h1{margin:0;font-size:56px;letter-spacing:-.02em} .card p{margin:0;font-size:24px;opacity:.92}
</style></head><body><div id="root"></div><script>
  const HEX=${JSON.stringify(GROUP_HEX)}; const ICON=${JSON.stringify(icon)};
  const esc=(s)=>String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const favHtml=(t)=>t.favIconUrl&&!t.favIconUrl.startsWith("chrome")?'<img src="'+esc(t.favIconUrl)+'">':'<i class="fav">'+esc((t.title||"?")[0])+'</i>';
  const summary=(s)=>{
    const cols=s.groups.map(g=>({g,tabs:s.tabs.filter(t=>t.groupId===g.id)})).filter(c=>c.tabs.length)
      .sort((a,b)=>b.tabs.length-a.tabs.length);
    return '<div class="summary"><h2>Your tabs, sorted <small>'+s.tabs.length+' tabs · '+cols.length+' folders · real result from Jev</small></h2><div class="cols">'+
      cols.map(c=>'<div class="col"><div class="hd" style="background:'+HEX[c.g.color]+'"><span>'+esc(c.g.title)+'</span><span>'+c.tabs.length+'</span></div><ul>'+
        c.tabs.map(t=>'<li>'+favHtml(t)+'<span>'+esc(t.title)+'</span></li>').join("")+'</ul></div>').join("")+'</div></div>';
  };
  window.render=(s)=>{
    if(s.card){document.getElementById("root").innerHTML='<div class="card"><img src="'+ICON+'"><h1>'+esc(s.card.title)+'</h1><p>'+esc(s.card.sub)+'</p></div>';return;}
    let strip="",prev=null;
    for(const t of s.tabs){
      const g=s.groups.find(g=>g.id===t.groupId);
      if(g&&prev!==g.id) strip+='<div class="chip" style="background:'+HEX[g.color]+'">'+esc(g.title)+'</div>';
      prev=g?g.id:null;
      const fav=t.favIconUrl&&!t.favIconUrl.startsWith("chrome")?'<img src="'+esc(t.favIconUrl)+'" onerror="this.outerHTML=\\'<i class=fav>'+esc((t.title||"?")[0])+'</i>\\'">':'<i class="fav">'+esc((t.title||"?")[0])+'</i>';
      strip+='<div class="tab'+(t.active?' active':'')+'">'+fav+'<span>'+esc(t.title)+'</span>'+(g?'<i class="bar" style="background:'+HEX[g.color]+'"></i>':'')+'</div>';
    }
    const cur=s.cursor?(s.cursor.click?'<div class="ripple" style="left:'+s.cursor.x+'px;top:'+s.cursor.y+'px"></div>':'')+
      '<svg class="cursor" style="left:'+s.cursor.x+'px;top:'+s.cursor.y+'px" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6L9.5 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>':"";
    const cap=s.caption?'<div class="caption'+(s.caption.step?'':' nostep')+'">'+(s.caption.step?'<span class="n">'+esc(s.caption.step)+'</span>':'')+esc(s.caption.text)+'</div>':"";
    document.getElementById("root").innerHTML=
      '<div class="strip"><div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>'+strip+'</div>'+
      '<div class="toolbar"><span class="nav">←</span><span class="nav">→</span><span class="nav">↻</span>'+
      '<div class="url">'+esc(s.url)+'</div><div class="ext'+(s.popup?' on':'')+'"><img src="'+ICON+'"></div><div class="avatar"></div></div>'+
      '<div class="content"><img src="'+s.content+'"></div>'+
      (s.popup?'<div class="popup"><img src="'+s.popup+'"></div>':"")+(s.summary?summary(s):"")+cap+cur;
  };
</script></body></html>`;

const EXT_ICON = { x: W - 14 - 26 - 14 - 14, y: 46 + 21 }; // toolbar extension icon centre

// ---------- helpers ----------

async function shot(page: Page): Promise<string> {
  return png(await page.screenshot({ encoding: "base64" }));
}

async function newPage(browser: Browser, url: string, viewport = { width: W, height: CONTENT_H }) {
  const p = await browser.newPage();
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await p.setViewport(viewport);
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => {});
  return p;
}

async function liveStrip(ext: Page, activeId?: number): Promise<{ tabs: StripTab[]; groups: StripGroup[] }> {
  const data = await ext.evaluate(async () => {
    const win = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: win.id });
    const groups = await chrome.tabGroups.query({ windowId: win.id });
    return {
      tabs: tabs
        .filter((t) => /^https?:/.test(t.url ?? ""))
        .sort((a, b) => a.index - b.index)
        .map((t) => ({ id: t.id!, title: t.title ?? "", favIconUrl: t.favIconUrl, groupId: t.groupId })),
      groups: groups.map((g) => ({ id: g.id, title: g.title ?? "", color: g.color as string })),
    };
  });
  const first = activeId ?? data.tabs[0]?.id;
  data.tabs.forEach((t) => (t.active = t.id === first));
  return data;
}

// ---------- main ----------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

// Fresh profile with Chrome's appearance set to Light, so chrome:// pages match the rest of the demo.
const PROFILE = resolve(OUT, "profile");
mkdirSync(resolve(PROFILE, "Default"), { recursive: true });
writeFileSync(
  resolve(PROFILE, "Default/Preferences"),
  JSON.stringify({ browser: { theme: { color_scheme: 1, color_scheme2: 1 } } }),
);

const browser = await puppeteer.launch({
  headless: true,
  userDataDir: PROFILE,
  pipe: true,
  enableExtensions: [DIST],
  // Light theme everywhere, including chrome:// pages, regardless of the OS setting.
  args: ["--no-first-run", "--lang=en-US", "--blink-settings=preferredColorScheme=1", "--disable-features=WebUIDarkMode"],
});

try {
  const worker = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/background.js"));
  const extId = new URL(worker.url()).host;
  // On install the extension opens its settings, and Chrome may reuse the blank tab for it, so the
  // stage gets its own tab.
  await new Promise((r) => setTimeout(r, 1000));
  stage = await browser.newPage();
  await stage.setViewport({ width: W, height: H });
  await stage.setContent(STAGE_HTML);

  // Real pages we capture from.
  const extensions = await newPage(browser, "chrome://extensions");
  await extensions.evaluate(() => {
    const toolbar = (document.querySelector("extensions-manager") as any)?.shadowRoot?.querySelector("extensions-toolbar");
    const dev = toolbar?.shadowRoot?.querySelector("#devMode") as HTMLElement | null;
    if (dev && dev.getAttribute("aria-pressed") !== "true") dev.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  const loadBtn = await extensions.evaluate(() => {
    const toolbar = (document.querySelector("extensions-manager") as any)?.shadowRoot?.querySelector("extensions-toolbar");
    const r = toolbar?.shadowRoot?.querySelector("#loadUnpacked")?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });

  const options = await newPage(browser, `chrome-extension://${extId}/options/index.html`);
  await options.evaluate(() => chrome.storage.session.clear());

  // ---- Scene 0: title ----
  current = { tabs: [], groups: [], url: "", content: "" };
  await frame({ card: { title: "AI Tab Organizer", sub: "Messy tabs → tidy folders, in one click" } }, 2.4);
  current.card = undefined;

  // ---- Scene 1: install ----
  const extTab: StripTab = { id: -1, title: "Extensions", groupId: -1, active: true };
  await frame(
    {
      tabs: [extTab],
      groups: [],
      url: "chrome://extensions",
      content: await shot(extensions),
      caption: { step: "1", text: "Unzip the release and click “Load unpacked”" },
      cursor: { x: 640, y: 420 },
    },
    0.8,
  );
  if (loadBtn) await moveTo(loadBtn.x, loadBtn.y + TOP, true);
  await frame({ caption: { step: "1", text: "AI Tab Organizer is installed" } }, 2.2);

  // ---- Scene 2: connect ----
  const optTab: StripTab = { id: -2, title: "AI Tab Organizer settings", groupId: -1, active: true };
  const optUrl = `chrome-extension://${extId}/options/index.html`;
  const opt = async (caption: Stage["caption"], d: number) =>
    frame({ tabs: [extTab, optTab].map((t) => ({ ...t, active: t === optTab })), url: optUrl, content: await shot(options), caption }, d);

  await opt({ step: "2", text: "Settings open automatically" }, 1.8);
  const combo = await options.$eval("#providerBtn", (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + 120, y: r.y + r.height / 2 };
  });
  await moveTo(combo.x, combo.y + TOP, true);
  await options.click("#providerBtn");
  await opt({ step: "2", text: "Pick a provider" }, 0.9);
  for (const ch of "ver") {
    await options.type("#providerSearch", ch);
    await opt({ step: "2", text: "Pick a provider" }, 0.22);
  }
  await opt({ step: "2", text: "Pick a provider" }, 0.5);
  const vercel = await options.$$eval("#providerList li", (lis) => {
    const r = lis[0].getBoundingClientRect();
    return { x: r.x + 140, y: r.y + r.height / 2 };
  });
  await moveTo(vercel.x, vercel.y + TOP, true);
  await options.keyboard.press("Enter");
  await opt({ step: "2", text: "Vercel AI Gateway selected" }, 1.0);

  const keyBox = await options.$eval("#apiKey", (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + 160, y: r.y + r.height / 2 };
  });
  await moveTo(keyBox.x, keyBox.y + TOP, true);
  await options.focus("#apiKey");
  // Type in a few chunks so the dots visibly fill in. The password field never shows the key.
  const chunks = 5;
  for (let i = 1; i <= chunks; i++) {
    const part = KEY.slice(Math.floor(((i - 1) * KEY.length) / chunks), Math.floor((i * KEY.length) / chunks));
    await options.type("#apiKey", part);
    await opt({ step: "2", text: "Paste your API key" }, 0.16);
  }
  await opt({ step: "2", text: "Paste your API key" }, 0.8);

  const testBtn = await options.$eval("#test", (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await moveTo(testBtn.x, testBtn.y + TOP, true);
  await options.click("#test");
  await opt({ step: "2", text: "Test the connection" }, 0.5);
  await options.waitForFunction(() => /\b(ok|err)\b/.test(document.querySelector("#testResult")!.className), { timeout: 30_000 });
  const testOk = await options.$eval("#testResult", (e) => e.classList.contains("ok"));
  if (!testOk) throw new Error(`Connection test failed: ${await options.$eval("#testResult", (e) => e.textContent)}`);
  await new Promise((r) => setTimeout(r, 500)); // let autosave settle
  await opt({ step: "2", text: "Connected to Jev via Vercel AI Gateway" }, 2.4);

  // ---- Scene 3: messy tabs ----
  console.log("Opening real sites…");
  const pages: Page[] = [];
  for (const url of SITES) {
    if (pages.length >= WANT_TABS) break;
    const p = await newPage(browser, url);
    await new Promise((r) => setTimeout(r, 1200));
    const title = await p.title().catch(() => "");
    if (!title || BLOCKED.test(title)) {
      await p.close();
      continue;
    }
    pages.push(p);
  }
  await extensions.close();
  await options.close();
  console.log(`${pages.length} tabs ready`);

  // Extension page used to read live tab state and to drive the real popup.
  const popup = await newPage(browser, `chrome-extension://${extId}/popup/index.html`, { width: 280, height: 150 });
  const popupShot = async () => png(await (await popup.$("body"))!.screenshot({ encoding: "base64" }));
  const activePage = pages[0];
  const activeTitle = await activePage.title();
  const activeUrl = activePage.url();
  const pageContent = await shot(activePage);
  const before = await liveStrip(popup);
  const activeId = before.tabs.find((t) => t.title === activeTitle)?.id;
  const strip0 = await liveStrip(popup, activeId);

  await frame(
    { ...strip0, url: activeUrl.replace(/^https:\/\//, ""), content: pageContent, caption: { step: "3", text: `${strip0.tabs.length} tabs open. Which one was that video?` } },
    2.6,
  );

  // ---- Scene 4: organize ----
  await moveTo(EXT_ICON.x, EXT_ICON.y, true);
  await frame({ popup: await popupShot(), caption: { step: "4", text: "Click the icon → Organize tabs" } }, 1.2);
  await moveTo(W - 14 - 140, TOP + 60, true);
  await popup.$eval("#organize", (b) => (b as HTMLButtonElement).click());
  await frame({ popup: await popupShot(), caption: { step: "4", text: "Jev classifies every tab in parallel…" } }, 0.4);
  // Gateways occasionally return a transient 503; retry quietly (no frames recorded for failed tries).
  let status = { text: "", error: true };
  for (let attempt = 1; attempt <= 4 && status.error; attempt++) {
    if (attempt > 1) {
      console.log(`Organize attempt ${attempt - 1} failed (${status.text.slice(0, 80)}); retrying…`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      await popup.$eval("#organize", (b) => (b as HTMLButtonElement).click());
    }
    await popup.waitForFunction(() => !document.querySelector<HTMLButtonElement>("#organize")!.disabled, { timeout: 90_000 });
    status = await popup.$eval("#status", (e) => ({ text: e.textContent ?? "", error: e.className === "error" }));
  }
  if (status.error) throw new Error(`Organize failed: ${status.text}`);
  const after = await liveStrip(popup, activeId);

  await frame({ ...after, popup: await popupShot(), caption: { step: "4", text: status.text } }, 2.2);
  await frame({ popup: undefined, cursor: undefined, caption: { text: `Done: ${after.groups.length} named, colored tab groups` } }, 2.0);
  await frame({ summary: true, caption: undefined }, 4.2);
  current.summary = false;

  // ---- Scene 5: outro ----
  await frame({ card: { title: "Try it free", sub: "github.com/Piyusinha/ai-tab-organizer" } }, 2.8);

  console.log(`Sorted: ${after.groups.map((g) => `${g.title}(${after.tabs.filter((t) => t.groupId === g.id).length})`).join(", ")}`);
} finally {
  await browser.close();
  // The profile's extension storage holds the API key typed during the demo; never leave it on disk.
  rmSync(PROFILE, { recursive: true, force: true });
}

// ---------- encode ----------

const list = timeline.map((f) => `file '${f.file}'\nduration ${f.duration.toFixed(3)}`).join("\n") + `\nfile '${timeline.at(-1)!.file}'\n`;
writeFileSync(resolve(OUT, "frames.txt"), list);
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
ff("-f", "concat", "-safe", "0", "-i", resolve(OUT, "frames.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-movflags", "+faststart", resolve(OUT, "demo.mp4"));
ff(
  "-i", resolve(OUT, "demo.mp4"),
  "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a",
  resolve(OUT, "demo.gif"),
);
const total = timeline.reduce((s, f) => s + f.duration, 0);
console.log(`\n✓ ${resolve(OUT, "demo.mp4")} (${total.toFixed(1)}s, ${timeline.length} frames)\n✓ ${resolve(OUT, "demo.gif")}`);
