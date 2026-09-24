// Typed client for Jev (TypeSafe's System One model) over any supported gateway.
// The official @typesafe-ai/sdk targets Node 20+, so the extension talks to REST directly.
import { isConfigured, providerById, PROVIDERS, type Credentials, type ProviderId } from "./providers";

/** USD per input token; output tokens are free. */
export const JEV_INPUT_PRICE = 0.042 / 1_000_000;

export type Criteria = Record<string, string | null>;

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Criteria;
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

export type Question = ChoiceQuestion | NoulQuestion;

export const choice = (instructions: string, criteria: Criteria): ChoiceQuestion => ({
  type: "choice",
  instructions,
  criteria,
});

export const noul = (instructions: string): NoulQuestion => ({ type: "noul", instructions });

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence?: number;
}

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export type Answer = ChoiceAnswer | NoulAnswer;

export interface SystemOneRequest {
  state: unknown;
  questions: Record<string, Question>;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  /** OpenRouter also reports `cost` in USD. */
  usage: { input_tokens: number; output_tokens: number; cost?: number };
}

export type ErrorKind = "unavailable" | "auth" | "rate_limit" | "bad_request" | "network" | "not_connected" | "unknown";

export interface Attempt {
  provider: ProviderId;
  kind: ErrorKind;
  /** Short, user-facing sentence. */
  message: string;
}

/**
 * A Jev call failed. `message` is always a short sentence safe to show in the UI;
 * the raw provider response (if any) is kept in `detail` for logs only.
 */
export class JevError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind = "unknown",
    readonly status?: number,
    readonly detail?: string,
    readonly attempts: Attempt[] = [],
  ) {
    super(message);
    this.name = "JevError";
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
const MAX_RETRIES = 2;

function kindForStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 404 || status === 422) return "bad_request";
  if (status >= 500) return "unavailable";
  return "unknown";
}

function friendly(name: string, kind: ErrorKind): string {
  switch (kind) {
    case "unavailable":
      return `${name} is temporarily unavailable`;
    case "auth":
      return `${name} rejected your API key`;
    case "rate_limit":
      return `${name} rate limit reached`;
    case "bad_request":
      return `${name} couldn't process the request`;
    case "network":
      return `Can't reach ${name}`;
    case "not_connected":
      return `${name} has no API key`;
    default:
      return `${name} returned an error`;
  }
}

/** Pull a readable message out of a provider's error body (JSON or text), for logs. */
function extractDetail(body: string): string {
  try {
    const j = JSON.parse(body);
    const msg = j?.error?.message ?? j?.message ?? (typeof j?.error === "string" ? j.error : undefined) ?? j?.errors?.[0]?.message;
    if (msg) return String(msg).slice(0, 200);
  } catch {}
  return body.slice(0, 200);
}

/** One call to one provider, with backoff on transient errors. */
export async function systemOne(
  providerId: ProviderId,
  creds: Credentials,
  req: SystemOneRequest,
): Promise<SystemOneResponse> {
  const provider = providerById(providerId);
  const model = creds.model?.trim() || provider.defaultModel;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(provider.url(creds), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(provider.body(req, model)),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw new JevError(friendly(provider.name, "network"), "network", undefined, (err as Error).message);
    }

    if (res.ok) {
      const parsed = provider.parse(await res.json().catch(() => null));
      if (!parsed?.answers) throw new JevError(`${provider.name} sent an unexpected response`, "unknown", res.status);
      return parsed;
    }

    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      await backoff(attempt, res.headers.get("retry-after"));
      continue;
    }

    const kind = kindForStatus(res.status);
    const detail = extractDetail(await res.text().catch(() => ""));
    throw new JevError(friendly(provider.name, kind), kind, res.status, detail);
  }
}

/**
 * Call the primary provider. With `failover`, also try every other provider that has a key,
 * in order, until one succeeds (useful when one gateway is down or overloaded).
 */
export async function callJev(
  primary: ProviderId,
  failover: boolean,
  credentials: Partial<Record<ProviderId, Credentials>>,
  req: SystemOneRequest,
): Promise<{ response: SystemOneResponse; provider: ProviderId }> {
  const backups = failover
    ? PROVIDERS.filter((p) => p.id !== primary && isConfigured(p, credentials[p.id])).map((p) => p.id)
    : [];
  const order = [primary, ...backups];

  const attempts: Attempt[] = [];
  const details: string[] = [];
  for (const id of order) {
    const provider = providerById(id);
    const creds = credentials[id];
    if (!isConfigured(provider, creds)) {
      attempts.push({ provider: id, kind: "not_connected", message: friendly(provider.name, "not_connected") });
      continue;
    }
    try {
      return { response: await systemOne(id, creds, req), provider: id };
    } catch (err) {
      const e = err instanceof JevError ? err : new JevError(friendly(provider.name, "unknown"), "unknown", undefined, String(err));
      attempts.push({ provider: id, kind: e.kind, message: e.message });
      if (e.detail) details.push(`${provider.name} ${e.status ?? ""}: ${e.detail}`);
    }
  }
  const first = attempts[0];
  const message = attempts.length === 1 ? first.message : "None of your providers could sort your tabs";
  throw new JevError(message, first.kind, undefined, details.join(" | ") || undefined, attempts);
}

function backoff(attempt: number, retryAfter?: string | null): Promise<void> {
  const seconds = Number(retryAfter);
  const ms = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : 500 * 2 ** attempt;
  return new Promise((r) => setTimeout(r, ms + Math.random() * 250));
}
