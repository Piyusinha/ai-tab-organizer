// Renders scripts/icon.svg to the PNG sizes Chrome and the Web Store need.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const root = resolve(import.meta.dirname, "..");
const svg = readFileSync(resolve(root, "scripts/icon.svg"), "utf8");
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  );
  await page.screenshot({ path: resolve(root, `public/icons/icon${size}.png`) as `${string}.png`, omitBackground: true });
}
await browser.close();
console.log("Icons written to public/icons/");
