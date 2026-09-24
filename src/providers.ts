// Gateways that serve TypeSafe's Jev. All accept the same { state, questions } body and
// return the same { answers, usage } shape; they differ in URL, auth, model id and wrapping.
//   TypeSafe:   https://docs.typesafe.ai/api.md
//   OpenRouter: https://openrouter.ai/docs/guides/community/jev
//   Vercel:     https://vercel.com/changelog/ai-gateway-now-supports-typesafe-clients-and-http-api-for-jev
//   Cloudflare: https://developers.cloudflare.com/ai/models/typesafe/jev/
import type { SystemOneRequest, SystemOneResponse } from "./jev";

export type ProviderId = "typesafe" | "openrouter" | "vercel" | "cloudflare";

export interface Credentials {
  apiKey: string;
  /** Cloudflare only. */
  accountId?: string;
  /** Overrides the provider's default model id. */
  model?: string;
}

export interface Provider {
  id: ProviderId;
  name: string;
  description: string;
  keyLabel: string;
  keyUrl: string;
  defaultModel: string;
  needsAccountId?: boolean;
  url(creds: Credentials): string;
  body(req: SystemOneRequest, model: string): unknown;
  /** Unwrap the provider's envelope into the TypeSafe response shape. */
  parse(json: any): SystemOneResponse;
}

const identity = (json: any) => json as SystemOneResponse;

export const PROVIDERS: Provider[] = [
  {
    id: "typesafe",
    name: "TypeSafe",
    description: "Direct from TypeSafe AI",
    keyLabel: "TypeSafe API key",
    keyUrl: "https://console.typesafe.ai",
    defaultModel: "jev-latest",
    url: () => "https://api.typesafe.ai/v1/systemone",
    body: (req, model) => ({ model, ...req }),
    parse: identity,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Decisions API, billed to your OpenRouter credits",
    keyLabel: "OpenRouter API key",
    keyUrl: "https://openrouter.ai/settings/keys",
    defaultModel: "typesafe/jev-1.13",
    url: () => "https://openrouter.ai/api/alpha/decisions",
    body: (req, model) => ({ model, ...req }),
    parse: identity,
  },
  {
    id: "vercel",
    name: "Vercel AI Gateway",
    description: "TypeSafe-compatible endpoint on AI Gateway",
    keyLabel: "AI Gateway API key",
    keyUrl: "https://vercel.com/dashboard/ai-gateway/api-keys",
    defaultModel: "jev-latest",
    url: () => "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
    body: (req, model) => ({ model, ...req }),
    parse: identity,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    description: "Workers AI REST API (needs account ID)",
    keyLabel: "Cloudflare API token",
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    defaultModel: "typesafe/jev",
    needsAccountId: true,
    url: (c) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(c.accountId ?? "")}/ai/run`,
    body: (req, model) => ({ model, input: req }),
    // The REST API usually wraps results as { result, success, errors }.
    parse: (json) => (json?.result?.answers ? json.result : json) as SystemOneResponse,
  },
];

export const providerById = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

export function isConfigured(p: Provider, c?: Credentials): c is Credentials {
  return !!c?.apiKey && (!p.needsAccountId || !!c.accountId);
}
