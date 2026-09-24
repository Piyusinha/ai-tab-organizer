## Install in Chrome (about 1 minute)

1. **Download** `ai-tab-organizer-{{VERSION}}.zip` from the **Assets** list below.
2. **Unzip it.** Double-click the file (macOS) or right-click → *Extract All* (Windows). Chrome can't load the `.zip` itself.
   Move the extracted folder somewhere permanent, such as `Documents/ai-tab-organizer`. Chrome loads the extension from this folder, so don't delete it.
3. Open **`chrome://extensions`** in Chrome.
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the extracted folder (the one that contains `manifest.json`).
6. Click the puzzle-piece icon in the toolbar and **pin** AI Tab Organizer.
7. The settings page opens automatically. **Pick a provider** (OpenRouter is easiest), paste your API key and click **Test connection**.

Done. Click the extension icon → **Organize tabs**, or press **Alt+Shift+O**.

### Updating to a new version
Download the new zip and extract it over the same folder (replace the files), then click **↻ Reload** on the extension's card in `chrome://extensions`. Your settings and keys are kept.

### Notes
- Works in Chrome, Edge, Brave and other Chromium browsers (use `edge://extensions`, `brave://extensions`, and so on).
- On startup, Chrome may say that developer-mode extensions are enabled. That's expected for extensions installed from a zip.
- You need your own API key from one of: [OpenRouter](https://openrouter.ai/settings/keys), [Vercel AI Gateway](https://vercel.com/dashboard/ai-gateway/api-keys), [Cloudflare Workers AI](https://dash.cloudflare.com/profile/api-tokens) or [TypeSafe](https://console.typesafe.ai). Sorting 50 tabs costs less than $0.001.
- Privacy: only tab titles and addresses are sent, and only to the provider you choose. See the [privacy policy](https://piyusinha.github.io/ai-tab-organizer/privacy.html).
