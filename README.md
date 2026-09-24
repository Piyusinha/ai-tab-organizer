# AI Tab Organizer

[![CI](https://github.com/Piyusinha/ai-tab-organizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Piyusinha/ai-tab-organizer/actions/workflows/ci.yml)

Chrome extension that sorts your open tabs into named, colored tab groups in one click.
Tabs are classified by [Jev](https://docs.typesafe.ai), TypeSafe AI's decision model, through the
provider you choose: **OpenRouter**, **Vercel AI Gateway**, **Cloudflare Workers AI** or **TypeSafe**
directly. You bring your own key; the extension has no backend.

## Quick start

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

**Updates:** bump `version` in `public/manifest.json` and `package.json` in a PR, merge it,
run `npm run package` and upload the zip on the item's *Package* tab.

## License

[MIT](LICENSE)
