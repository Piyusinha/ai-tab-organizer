import { afterEach, describe, expect, it, vi } from "vitest";
import { callJev, choice, JevError } from "../src/jev";
import { providerById } from "../src/providers";

const req = { state: "s", questions: { q: choice("?", { A: "a", B: "b" }) } };
const ok = { model: "jev", answers: { q: { type: "choice", choice: "A", probabilities: { A: 1, B: 0 } } }, usage: { input_tokens: 5, output_tokens: 0 } };

afterEach(() => vi.unstubAllGlobals());

describe("provider request shapes", () => {
  it("TypeSafe / OpenRouter / Vercel send model + state + questions", () => {
    expect(providerById("typesafe").body(req, "jev-latest")).toEqual({ model: "jev-latest", ...req });
    expect(providerById("openrouter").url({ apiKey: "k" })).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(providerById("vercel").url({ apiKey: "k" })).toBe("https://ai-gateway.vercel.sh/typesafe/v1/systemone");
  });

  it("Cloudflare wraps the request in input and unwraps { result }", () => {
    const cf = providerById("cloudflare");
    expect(cf.url({ apiKey: "k", accountId: "abc" })).toBe("https://api.cloudflare.com/client/v4/accounts/abc/ai/run");
    expect(cf.body(req, "typesafe/jev")).toEqual({ model: "typesafe/jev", input: req });
    expect(cf.parse({ result: ok, success: true })).toEqual(ok);
    expect(cf.parse(ok)).toEqual(ok);
  });
});

describe("callJev failover", () => {
  it("skips a failing provider and uses the next configured one", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("typesafe.ai")
        ? new Response("overloaded", { status: 401 })
        : new Response(JSON.stringify(ok), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { provider, response } = await callJev(
      "typesafe",
      true,
      { typesafe: { apiKey: "t" }, openrouter: { apiKey: "o" }, cloudflare: { apiKey: "c" } /* no accountId */ },
      req,
    );
    expect(provider).toBe("openrouter");
    expect(response.answers.q).toMatchObject({ choice: "A" });
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer o");
    expect(JSON.parse(init.body as string).model).toBe("typesafe/jev-1.13");
  });

  it("reports every provider's error when all fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const err = await callJev("typesafe", true, { typesafe: { apiKey: "t" }, vercel: { apiKey: "v" } }, req).catch((e) => e);
    expect(err).toBeInstanceOf(JevError);
    expect(err.message).toBe("None of your providers could sort your tabs");
    expect(err.attempts.map((a: { message: string }) => a.message)).toEqual([
      "TypeSafe rejected your API key",
      "Vercel AI Gateway rejected your API key",
    ]);
  });

  it("turns a raw 503 body into a short message and keeps the body out of it", async () => {
    vi.useFakeTimers();
    const body = JSON.stringify({
      error: { message: "Service temporarily unavailable. Please try again shortly.", type: "service_unavailable_error" },
      providerMetadata: { gateway: { routing: { originalModel: "typesafe-ai/jev" } } },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = callJev("vercel", false, { vercel: { apiKey: "v" } }, req).catch((e) => e);
    await vi.runAllTimersAsync(); // skip retry backoff
    const err = await pending;
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(3); // first try + 2 retries
    expect(err.message).toBe("Vercel AI Gateway is temporarily unavailable");
    expect(err.kind).toBe("unavailable");
    expect(err.message).not.toMatch(/[{}"]/);
    expect(err.detail).toContain("Service temporarily unavailable");
  });

  it("does not try backups when failover is off", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callJev("typesafe", false, { typesafe: { apiKey: "t" }, openrouter: { apiKey: "o" } }, req)).rejects.toThrow(
      /^TypeSafe rejected your API key$/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("errors clearly when the provider is not connected", async () => {
    await expect(callJev("openrouter", false, {}, req)).rejects.toThrow(/OpenRouter has no API key/);
  });
});
