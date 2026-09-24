import { OTHER, type Category } from "./categories";
import { choice, type Criteria, type SystemOneRequest, type SystemOneResponse } from "./jev";

export interface TabInfo {
  id: number;
  title: string;
  url: string;
}

/**
 * Max tabs per Jev request. Each question repeats the criteria (~200 tokens), so 60 tabs stays well
 * under the 32K context of the OpenRouter/Cloudflare deployments. Chunks run in parallel.
 */
export const CHUNK_SIZE = 60;

const questionKey = (i: number) => `tab_${i}`;

export function buildCriteria(categories: Category[]): Criteria {
  const criteria: Criteria = {};
  for (const c of categories) {
    if (c.name !== OTHER) criteria[c.name] = c.description;
  }
  criteria[OTHER] = "Nothing above fits";
  return criteria;
}

function describeUrl(url: string): { domain: string; path: string } {
  try {
    const u = new URL(url);
    return { domain: u.hostname.replace(/^www\./, ""), path: u.pathname.slice(0, 80) };
  } catch {
    return { domain: "", path: "" };
  }
}

/** One Choice question per tab, split into chunks. Each chunk's indices are local to its own state. */
export function buildRequests(tabs: TabInfo[], categories: Category[]): SystemOneRequest[] {
  const criteria = buildCriteria(categories);
  const requests: SystemOneRequest[] = [];
  for (let start = 0; start < tabs.length; start += CHUNK_SIZE) {
    const chunk = tabs.slice(start, start + CHUNK_SIZE);
    const state = {
      tabs: chunk.map((t, i) => ({ i, title: t.title.slice(0, 120), ...describeUrl(t.url) })),
    };
    const questions: SystemOneRequest["questions"] = {};
    chunk.forEach((_, i) => {
      questions[questionKey(i)] = choice(
        `Which folder best fits tabs[${i}]? Judge by what the user is doing on that page, not just the site.`,
        criteria,
      );
    });
    requests.push({ state, questions });
  }
  return requests;
}

/**
 * Map each chunk's answers back to tab ids, grouped by category name.
 * Missing answers, unknown labels and low-confidence picks fall back to "Other".
 */
export function resolveAnswers(
  tabs: TabInfo[],
  responses: SystemOneResponse[],
  categories: Category[],
  threshold: number,
): Map<string, number[]> {
  const known = new Set(categories.map((c) => c.name));
  const groups = new Map<string, number[]>();
  tabs.forEach((tab, idx) => {
    const res = responses[Math.floor(idx / CHUNK_SIZE)];
    const answer = res?.answers[questionKey(idx % CHUNK_SIZE)];
    let name = OTHER;
    // Some gateways omit `confidence`; fall back to the chosen option's probability.
    const confidence = answer?.type === "choice" ? (answer.confidence ?? answer.probabilities?.[answer.choice] ?? 0) : 0;
    if (answer?.type === "choice" && known.has(answer.choice) && confidence >= threshold) {
      name = answer.choice;
    }
    const ids = groups.get(name) ?? [];
    ids.push(tab.id);
    groups.set(name, ids);
  });
  return groups;
}
