# AI Tab Organizer

[![CI](https://github.com/Piyusinha/ai-tab-organizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Piyusinha/ai-tab-organizer/actions/workflows/ci.yml)

Chrome extension that sorts your open tabs into named, colored tab groups in one click.
Tabs are classified by [Jev](https://docs.typesafe.ai), TypeSafe AI's decision model, through the
provider you choose: **OpenRouter**, **Vercel AI Gateway**, **Cloudflare Workers AI** or **TypeSafe**
directly. You bring your own key; the extension has no backend.

<p align="center">
  <img src="docs/demo.gif" alt="Demo: install, connect Vercel AI Gateway, click Organize, and 16 real tabs are sorted into 9 folders" width="900">
  <br>
  <a href="https://piyusinha.github.io/ai-tab-organizer/demo.mp4"><b>▶ Watch the full demo video (35 s)</b></a>
  · recorded with a real Chrome, real websites and real Jev results
</p>

<p align="center">
  <a href="https://github.com/Piyusinha/ai-tab-organizer/releases/latest/download/ai-tab-organizer.zip"><b>⬇ Download ai-tab-organizer.zip</b></a>
  · <a href="https://github.com/Piyusinha/ai-tab-organizer/releases/latest">Latest release</a>
  · <a href="#setup-2-minutes">Setup guide</a>
</p>

## How it works: Jev

Tabs are classified by **[Jev](https://docs.typesafe.ai)**, a *System One* model from TypeSafe AI.
Jev doesn't generate text the way ChatGPT or Claude do. You send it some data plus typed questions,
and it returns typed answers with calibrated probabilities:

```text
state:     { tabs: [{ i: 0, title: "microsoft/TypeScript", domain: "github.com" }, …] }
question:  tab_0 → choice: which folder fits tabs[0]?  { Dev, Work, AI, Shopping, …, Other }
answer:    tab_0 → { choice: "Dev", probabilities: { Dev: 0.97, Work: 0.02, … }, confidence: 0.94 }
```

The extension asks **one question per tab**, all in a single request that Jev answers in parallel
(about 70–500 ms). This design has four practical benefits:

- **Only valid folders come back.** Jev can only pick from your folder names, so there is no JSON to
  parse and no invented labels.
- **Honest uncertainty.** Every answer has a confidence score. Tabs below your strictness setting go
  to **Other** instead of being put in the wrong folder.
- **Fast.** Sorting feels instant, and there are no output tokens to wait for.
- **Cheap per token.** Jev costs **$0.042 per 1M input tokens, and output is free.**

The trade-off: Jev can't invent new folder names, so you choose them in settings.

### What sorting costs

Measured on a real run: **21 tabs → 7,865 input tokens**, about **375 tokens per tab**. That's more
than the tab text alone, because every per-tab question repeats the folder list.

| Tabs per click | Input tokens | Cost with Jev |
|---:|---:|---:|
| 20 | ~7.5K | **$0.0003** |
| 50 | ~19K | **$0.0008** |
| 100 | ~38K | **$0.0016** |

Heavy use (50 tabs, 10 times a day) costs about **$0.24 a month**. Tabs sorted in the last 24 hours
are cached, so clicking again costs nothing. The popup doesn't show costs; check your provider's dashboard.

### Compared with general-purpose LLMs

The usual alternative is one chat-model prompt: "here are 50 tabs, return JSON mapping each tab to a folder".
That prompt is about 2,000 input tokens (tab list plus instructions), and the answer is about 450 output tokens.

| Model | Price per 1M tokens (input / output) | ≈ cost for 50 tabs | vs Jev |
|---|---:|---:|---:|
| **Jev** (this extension) | **$0.042 / free** | **$0.0008** | — |
| GPT-5 nano | $0.05 / $0.40 | $0.0003 + reasoning tokens | ~0.4–1× |
| Gemini 2.5 Flash-Lite | $0.10 / $0.40 | $0.0004 | ~0.5× |
| GPT-5 mini | $0.25 / $2.00 | $0.0014 + reasoning tokens | ~2× |
| Gemini 2.5 Flash | $0.30 / $2.50 | $0.0017 | ~2× |
| Claude Haiku 4.5 | $1.00 / $5.00 | $0.0043 | ~5× |
| Claude Sonnet 5 | $2.00 / $10.00 | $0.0085 | ~11× |

**What the table shows:**
- Jev is cheaper than mid-size models such as GPT-5 mini, Gemini Flash and Claude.
- It costs about the same as the very smallest models (GPT-5 nano, Gemini Flash-Lite), or slightly more.
- It wins on reliability, not raw price. Answers are always one of your folders and come with calibrated
  confidence, with no JSON parsing, retries or made-up labels.
- Reasoning models such as GPT-5 nano and mini also bill hidden "thinking" tokens as output, so their
  real cost is usually higher than shown.

Prices are list prices as of September 2026. LLM token counts are estimates for a typical prompt, and
Jev's are measured. Sources: [TypeSafe](https://docs.typesafe.ai), [OpenRouter](https://openrouter.ai/typesafe/jev-1.13),
[OpenAI](https://openai.com/api/pricing/), [Google](https://ai.google.dev/gemini-api/docs/pricing),
[Anthropic](https://www.anthropic.com/pricing#api).

### Where Jev runs

The extension calls Jev through whichever provider you pick, using your own key, with optional
automatic failover to your other providers:

| Provider | Endpoint | Key |
|---|---|---|
| [OpenRouter](https://openrouter.ai/typesafe/jev-1.13) | `openrouter.ai/api/alpha/decisions` | OpenRouter API key |
| [Vercel AI Gateway](https://vercel.com/ai-gateway/models/jev) | `ai-gateway.vercel.sh/typesafe/v1/systemone` | AI Gateway API key |
| [Cloudflare Workers AI](https://developers.cloudflare.com/ai/models/typesafe/jev/) | `api.cloudflare.com/client/v4/accounts/{id}/ai/run` | API token + account ID |
| [TypeSafe](https://docs.typesafe.ai/api.md) | `api.typesafe.ai/v1/systemone` | TypeSafe API key |

## Setup (2 minutes)

You don't need to code or build anything. Download the ready-made extension and load it into Chrome.

### 1. Download the extension

Open the **[latest release](https://github.com/Piyusinha/ai-tab-organizer/releases/latest)** and, under **Assets**,
download **`ai-tab-organizer.zip`**, or use this direct link:
**[ai-tab-organizer.zip](https://github.com/Piyusinha/ai-tab-organizer/releases/latest/download/ai-tab-organizer.zip)**.

<img src="docs/setup/1-release-assets.png" alt="Release assets: download ai-tab-organizer.zip, not Source code" width="760">

> [!IMPORTANT]
> Don't download **Source code (zip)**. That's the raw project and can't be loaded into Chrome.
> `ai-tab-organizer-<version>.zip` is the same file as `ai-tab-organizer.zip` with the version in its name.

### 2. Unzip it

- **macOS:** double-click the zip.
- **Windows:** right-click → **Extract All…**

Move the extracted folder somewhere permanent, such as `Documents/ai-tab-organizer`. Chrome runs the
extension from this folder, so don't delete it. The folder should contain `manifest.json`.

### 3. Load it in Chrome

1. Open **`chrome://extensions`** in the address bar.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the folder from step 2.

<img src="docs/setup/2-load-unpacked.png" alt="chrome://extensions with Developer mode on and Load unpacked" width="760">

**AI Tab Organizer** appears in your extensions. Click the puzzle-piece icon in the toolbar and **pin** it.

<img src="docs/setup/3-installed.png" alt="AI Tab Organizer installed" width="760">

### 4. Connect a provider

The settings page opens automatically (or right-click the icon → **Options**).

1. **Pick a provider** from the dropdown (you can search it).
2. **Paste your API key** and click **Test connection**. You should see **✓ Connected**.

<img src="docs/setup/4-connect.png" alt="Settings: Vercel AI Gateway connected" width="760">

| Provider | Get a key | Notes |
|---|---|---|
| OpenRouter | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | Easiest; pay with OpenRouter credits |
| Vercel AI Gateway | [vercel.com → AI Gateway → API keys](https://vercel.com/dashboard/ai-gateway/api-keys) | Used in the demo |
| Cloudflare Workers AI | [dash.cloudflare.com → API tokens](https://dash.cloudflare.com/profile/api-tokens) | Also needs your **account ID** |
| TypeSafe | [console.typesafe.ai](https://console.typesafe.ai) | Direct from the makers of Jev |

Add keys for more than one provider and leave **Use backups** on. If one provider is down, the extension switches to another automatically.

### 5. Organize your tabs

Click the extension icon → **Organize tabs**, or press **Alt+Shift+O**.

<img src="docs/setup/5-organize.png" alt="Popup: Sorted 16 tabs into 9 folders" width="760">

Your tabs are grouped into named, colored folders in the tab strip. Changed your mind? Click **Undo**.

<img src="docs/setup/6-result.png" alt="Result: tabs sorted into Dev, News, Music, Learning, Video, AI, Travel, Reading, Shopping" width="760">

### Updating

Download the new `ai-tab-organizer.zip`, extract it **over the same folder** (replace the files), then click
**↻ Reload** on the extension's card in `chrome://extensions`. Your settings and keys are kept.

### Troubleshooting

| Problem | Fix |
|---|---|
| *"Manifest file is missing or unreadable"* | You selected the wrong folder or downloaded **Source code**. Select the folder that contains `manifest.json`. |
| Popup says **Not connected** | Open settings, paste a key and click **Test connection**. |
| *"invalid API key"* | Copy the key again. For Cloudflare, also check the account ID. |
| *"overloaded"* / *503* | The provider is busy. Try again, or add a second provider with **Use backups** on. |
| Chrome warns about developer-mode extensions | That's expected for extensions loaded from a zip. Keep it enabled. |

Also works in Edge, Brave and other Chromium browsers (`edge://extensions`, `brave://extensions`).

## Build from source

Requirements: Node 24 (see `.nvmrc`) and Chrome.

```bash
git clone https://github.com/Piyusinha/ai-tab-organizer.git
cd ai-tab-organizer
nvm use            # optional, picks Node 24
npm install
npm run build      # → dist/
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/`.
The settings page opens on first install. Choose a provider, paste your key and click **Test connection**.

## Local development

| Command | What it does |
|---|---|
| `npm run dev` | Rebuilds `dist/` on every change (click reload on the extension card to pick it up) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type check + build `dist/` for loading unpacked |
| `npm run package` | Web Store zip in `release/`, built **without** any `.env` keys |
| `npm run check` | Everything CI runs: typecheck, tests, store package. Run it before opening a PR |
| `npm run test:e2e` | Opens 100 real tabs in Chrome for Testing and sorts them with real Jev (needs a key in `.env`) |
| `npm run store-assets` | Renders store screenshots and the promo tile into `release/store/` |
| `npm run demo` | Records the demo video/GIF with a real Chrome and real Jev (needs `VITE_AI_GATEWAY_API_KEY` in `.env`) → `release/demo/` |

### Optional: default keys for local builds

```bash
cp .env.example .env   # then fill in any providers you have
```

Keys in `.env` are baked into `dist/` so you don't have to paste them in settings. They are
used by the e2e test, and are **never** included in `npm run package` (the build fails if one leaks).
`.env` is git-ignored.

### Project layout

```
src/
  background.ts   service worker: reads tabs, calls Jev, applies groups
  jev.ts          typed Jev client, retries and provider failover
  providers.ts    TypeSafe / OpenRouter / Vercel / Cloudflare endpoints
  classify.ts     builds Jev questions (one per tab), maps answers to folders
  grouper.ts      creates/reuses tab groups, undo
  popup/          toolbar popup
  options/        settings page
test/             unit tests, plus e2e/ (real browser, real API)
scripts/          store packaging, icons and store images
docs/privacy.html privacy policy (served with GitHub Pages)
```

## Contributing

`main` is protected: no direct pushes. Every change goes through a pull request.

1. `git checkout -b my-change`
2. Make your change, then run `npm run check`
3. `git push -u origin my-change` and open a PR
4. The **CI / Build & test** check must pass
5. **Squash and merge.** Merge commits are disabled, so history stays linear

## Publish to the Chrome Web Store

1. **Register** a developer account at https://chrome.google.com/webstore/devconsole ($5 one-time fee).
2. **Build:** `npm run package` → `release/ai-tab-organizer-<version>.zip`, then `npm run store-assets`.
   CI also uploads the zip as an artifact on every run.
3. **Privacy policy:** hosted with GitHub Pages from `docs/` at
   https://piyusinha.github.io/ai-tab-organizer/privacy.html (updates go live when a PR merges).
4. **Create the item:** *New item* → upload the zip → fill in the tabs using `STORE_LISTING.md`.
5. **Submit for review.** Reviews usually take a few days.

## Releasing a new version

1. In a PR, bump `version` in `public/manifest.json` and `package.json`, then merge it.
2. Tag the merge commit and push the tag:
   ```bash
   git checkout main && git pull
   git tag v1.1.0 && git push origin v1.1.0
   ```
3. The **Release** workflow checks the tag matches the manifest, runs the tests, builds the zip and publishes a
   [GitHub Release](https://github.com/Piyusinha/ai-tab-organizer/releases) with the zip and install steps.
4. For the Web Store, upload the same zip on the item's *Package* tab.

## License

[MIT](LICENSE)
