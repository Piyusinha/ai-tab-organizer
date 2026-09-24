import { DEFAULT_CATEGORIES, type Category } from "./categories";
import { isConfigured, PROVIDERS, type Credentials, type ProviderId } from "./providers";

export interface Settings {
  /** Gateway to call Jev through. */
  provider: ProviderId;
  /** If the provider fails, try the other connected providers. */
  failover: boolean;
  credentials: Partial<Record<ProviderId, Credentials>>;
  categories: Category[];
  /** Tabs whose top choice is below this confidence go to "Other". */
  threshold: number;
  skipPinned: boolean;
  collapse: boolean;
  showCounts: boolean;
}

// Optional defaults baked in at build time from .env (see .env.example).
const env = import.meta.env;
const ENV_CREDENTIALS: Partial<Record<ProviderId, Credentials>> = {
  typesafe: { apiKey: env.VITE_TYPESAFE_API_KEY ?? "" },
  openrouter: { apiKey: env.VITE_OPENROUTER_API_KEY ?? "" },
  vercel: { apiKey: env.VITE_AI_GATEWAY_API_KEY ?? "" },
  cloudflare: { apiKey: env.VITE_CLOUDFLARE_API_TOKEN ?? "", accountId: env.VITE_CLOUDFLARE_ACCOUNT_ID ?? "" },
};

const firstConnected = () => PROVIDERS.find((p) => isConfigured(p, ENV_CREDENTIALS[p.id]))?.id ?? "openrouter";
const envProvider = env.VITE_JEV_PROVIDER as ProviderId | "auto" | undefined;

export const DEFAULT_SETTINGS: Settings = {
  provider: envProvider && envProvider !== "auto" ? envProvider : firstConnected(),
  failover: true,
  credentials: ENV_CREDENTIALS,
  categories: DEFAULT_CATEGORIES,
  threshold: 0.35,
  skipPinned: true,
  collapse: false,
  showCounts: false,
};

/** Saved values win; empty saved fields fall back to the .env defaults. */
function mergeCredentials(saved: Settings["credentials"] = {}): Settings["credentials"] {
  const out: Settings["credentials"] = {};
  for (const id of Object.keys({ ...ENV_CREDENTIALS, ...saved }) as ProviderId[]) {
    const s = saved[id] ?? { apiKey: "" };
    const e = ENV_CREDENTIALS[id] ?? { apiKey: "" };
    out[id] = { ...s, apiKey: s.apiKey || e.apiKey, accountId: s.accountId || e.accountId };
  }
  return out;
}

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get("settings")).settings as
    | (Partial<Settings> & { apiKey?: string })
    | undefined;
  const credentials = { ...stored?.credentials };
  // Migrate the single-key setting from v0.1.
  if (stored?.apiKey && !credentials.typesafe?.apiKey) credentials.typesafe = { apiKey: stored.apiKey };
  const { apiKey: _legacy, ...rest } = stored ?? {};
  const settings = { ...DEFAULT_SETTINGS, ...rest, credentials: mergeCredentials(credentials) };
  // Migrate the old "auto" provider choice to primary + failover.
  if ((settings.provider as string) === "auto") {
    settings.provider = PROVIDERS.find((p) => isConfigured(p, settings.credentials[p.id]))?.id ?? "openrouter";
    settings.failover = true;
  }
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}
