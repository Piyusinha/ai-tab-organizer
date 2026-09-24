import { describe, expect, it } from "vitest";
import { buildCriteria, buildRequests, CHUNK_SIZE, resolveAnswers, type TabInfo } from "../src/classify";
import type { Category } from "../src/categories";
import type { SystemOneResponse } from "../src/jev";

const cats: Category[] = [
  { name: "Dev", description: "Code", color: "blue" },
  { name: "Video", description: "YouTube", color: "red" },
];

const tabs = (n: number): TabInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: 1000 + i, title: `Tab ${i}`, url: `https://www.site${i}.com/p/${i}` }));

const response = (answers: Record<string, { choice: string; confidence: number }>): SystemOneResponse => ({
  model: "jev-test",
  usage: { input_tokens: 0, output_tokens: 0 },
  answers: Object.fromEntries(
    Object.entries(answers).map(([k, v]) => [k, { type: "choice", probabilities: {}, ...v }]),
  ),
});

describe("buildCriteria", () => {
  it("adds Other last", () => {
    expect(Object.keys(buildCriteria(cats))).toEqual(["Dev", "Video", "Other"]);
  });
});

describe("buildRequests", () => {
  it("makes one choice question per tab with a compact state", () => {
    const [req] = buildRequests(tabs(3), cats);
    expect(Object.keys(req.questions)).toEqual(["tab_0", "tab_1", "tab_2"]);
    expect(req.questions.tab_1).toMatchObject({ type: "choice" });
    expect((req.state as any).tabs[1]).toEqual({ i: 1, title: "Tab 1", domain: "site1.com", path: "/p/1" });
  });

  it("chunks large tab sets with local indices", () => {
    const reqs = buildRequests(tabs(CHUNK_SIZE + 5), cats);
    expect(reqs).toHaveLength(2);
    expect(Object.keys(reqs[1].questions)).toHaveLength(5);
    expect((reqs[1].state as any).tabs[0].title).toBe(`Tab ${CHUNK_SIZE}`);
  });
});

describe("resolveAnswers", () => {
  it("groups by choice and sends low-confidence, unknown and missing answers to Other", () => {
    const t = tabs(5);
    const res = response({
      tab_0: { choice: "Dev", confidence: 0.9 },
      tab_1: { choice: "Video", confidence: 0.8 },
      tab_2: { choice: "Dev", confidence: 0.1 }, // below threshold
      tab_3: { choice: "Gaming", confidence: 0.9 }, // not a known category
      // tab_4 missing
    });
    const groups = resolveAnswers(t, [res], cats, 0.35);
    expect(groups.get("Dev")).toEqual([1000]);
    expect(groups.get("Video")).toEqual([1001]);
    expect(groups.get("Other")).toEqual([1002, 1003, 1004]);
  });

  it("falls back to the chosen probability when a gateway omits confidence", () => {
    const res = response({});
    res.answers.tab_0 = { type: "choice", choice: "Dev", probabilities: { Dev: 0.8 } };
    res.answers.tab_1 = { type: "choice", choice: "Dev", probabilities: { Dev: 0.2 } };
    const groups = resolveAnswers(tabs(2), [res], cats, 0.35);
    expect(groups.get("Dev")).toEqual([1000]);
    expect(groups.get("Other")).toEqual([1001]);
  });

  it("maps answers from later chunks back to the right tabs", () => {
    const t = tabs(CHUNK_SIZE + 1);
    const groups = resolveAnswers(t, [response({}), response({ tab_0: { choice: "Video", confidence: 1 } })], cats, 0.35);
    expect(groups.get("Video")).toEqual([1000 + CHUNK_SIZE]);
  });
});
