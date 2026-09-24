# Chrome Web Store submission

Everything to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Files to upload

| What | File |
|---|---|
| Package | `release/ai-tab-organizer-1.0.0.zip` (`npm run package`) |
| Screenshots (1280×800) | `release/store/screenshot-1-hero.png`, `release/store/screenshot-2-settings.png` |
| Small promo tile (440×280) | `release/store/promo-small.png` |
| Store icon (128×128) | `public/icons/icon128.png` |

Regenerate the images with `npx tsx scripts/store-assets.ts` after `npm run package`.

## Store listing tab

**Name:** AI Tab Organizer

**Summary** (max 132 characters):
> Sort your open tabs into named, colored tab groups in one click. Bring your own AI key (OpenRouter, Vercel, Cloudflare, TypeSafe).

**Category:** Productivity → Tools (or Workflow & Planning)

**Language:** English

**Description:**
```
Too many tabs? AI Tab Organizer sorts every open tab into named, colored folders using Chrome's built-in tab groups, all in one click.

HOW IT WORKS
• Click "Organize tabs" (or press Alt+Shift+O)
• Your tabs are sorted into folders like Dev, Work, AI, Shopping, News and Video
• Anything unclear goes into "Other"
• Changed your mind? Click Undo

MAKE IT YOURS
• Add, rename or remove folders, and pick their colors
• Choose how picky sorting should be
• Leave pinned tabs alone, collapse folders after sorting, or show tab counts

BRING YOUR OWN KEY
Sorting is done by Jev, a fast classification model from TypeSafe AI. Use your own API key from any of these providers:
• OpenRouter
• Vercel AI Gateway
• Cloudflare Workers AI
• TypeSafe
Turn on "Use backups" and the extension switches to another provider automatically if one is down.

It costs very little: about $0.0005 to sort 50 tabs, billed by your provider.

PRIVATE BY DESIGN
• Only tab titles and web addresses are sent, and only to the provider you choose
• No page content, no browsing history, no analytics, no servers of ours
• Your keys stay in your browser
```

## Privacy tab

**Single purpose:**
> Organizes the user's open tabs into named Chrome tab groups, based on each tab's title and address.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | Read the title and URL of tabs in the current window so they can be classified, and move them into groups. |
| `tabGroups` | Create, name, color, collapse and reuse tab groups (the "folders"). |
| `storage` | Save the user's settings (provider, API keys, folders, preferences) locally, and cache recent results for the current session. |
| Host: `api.typesafe.ai`, `openrouter.ai`, `ai-gateway.vercel.sh`, `api.cloudflare.com` | Send tab titles and URLs to the AI provider the user selected, using the user's own API key, to classify tabs. No other hosts are contacted. |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package; only JSON API calls are made.

**Data usage:** check these:
- ☑ **Web history**: tab URLs and titles are sent to the user-selected AI provider to classify tabs.
- ☑ **Authentication information**: the user's API key is stored locally and sent only to that provider.

Leave every other category unchecked. Then certify all three statements:
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://piyusinha.github.io/ai-tab-organizer/privacy.html

## Distribution tab

- Visibility: **Public** (or **Unlisted** to share only by link while you test)
- Pricing: Free
- Regions: All
