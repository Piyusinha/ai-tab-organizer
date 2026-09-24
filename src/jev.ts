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

export class JevError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JevError";
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
const MAX_RETRIES = 2;

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
      throw new JevError(`${provider.name}: network error (${(err as Error).message})`);
    }

    if (res.ok) {
      const parsed = provider.parse(await res.json());
      if (!parsed?.answers) throw new JevError(`${provider.name}: unexpected response shape`);
      return parsed;
    }

    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      await backoff(attempt, res.headers.get("retry-after"));
      continue;
    }

    const detail = (await res.text().catch(() => "")).slice(0, 300);
    switch (res.status) {
      case 401:
      case 403:
        throw new JevError(`${provider.name}: invalid API key`, res.status);
      case 422:
      case 400:
        throw new JevError(`${provider.name}: request rejected (${detail})`, res.status);
      case 429:
        throw new JevError(`${provider.name}: rate limit exceeded`, 429);
      case 529:
        throw new JevError(`${provider.name}: overloaded`, 529);
      default:
        throw new JevError(`${provider.name}: error ${res.status} ${detail}`, res.status);
    }
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

  const errors: string[] = [];
  for (const id of order) {
    const provider = providerById(id);
    const creds = credentials[id];
    if (!isConfigured(provider, creds)) {
      errors.push(`${provider.name}: not connected`);
      continue;
    }
    try {
      return { response: await systemOne(id, creds, req), provider: id };
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  throw new JevError(errors.join(" · "));
}

function backoff(attempt: number, retryAfter?: string | null): Promise<void> {
  const seconds = Number(retryAfter);
  const ms = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : 500 * 2 ** attempt;
  return new Promise((r) => setTimeout(r, ms + Math.random() * 250));
}
