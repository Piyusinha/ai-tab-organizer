export type GroupColor = `${chrome.tabGroups.Color}`;

export interface Category {
  name: string;
  description: string;
  color: GroupColor;
}

/** Fallback bucket for low-confidence or unmatched tabs. Always present. */
export const OTHER = "Other";

// Descriptions are repeated in every per-tab question, so keep them short: they drive token cost.
export const DEFAULT_CATEGORIES: Category[] = [
  { name: "Dev", description: "Code, GitHub, APIs, dev docs, Stack Overflow, localhost", color: "blue" },
  { name: "Work", description: "Company tools, dashboards, tickets, calendars, meetings", color: "grey" },
  { name: "AI", description: "AI chat apps, model playgrounds, AI tools", color: "purple" },
  { name: "Learning", description: "Courses, tutorials, research papers", color: "cyan" },
  { name: "Reading", description: "Articles, blogs, long-form posts, wikis", color: "yellow" },
  { name: "Video", description: "YouTube, streaming, movies, TV", color: "red" },
  { name: "Music", description: "Music and podcast players", color: "pink" },
  { name: "Social", description: "Social networks, forums, Reddit, X, LinkedIn", color: "cyan" },
  { name: "News", description: "News sites and headlines", color: "orange" },
  { name: "Shopping", description: "Stores, products, carts, deals", color: "green" },
  { name: "Finance", description: "Banking, payments, investing, crypto", color: "green" },
  { name: "Travel", description: "Flights, hotels, maps, bookings", color: "orange" },
  { name: "Email & Chat", description: "Email inboxes, messaging apps", color: "blue" },
];

export const CHROME_COLORS: GroupColor[] = [
  "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange",
];
