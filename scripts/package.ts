// Builds the Chrome Web Store package: release/ai-tab-organizer-<version>.zip
// Your .env keys are never included; the build fails if any of them shows up in the output.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "release/dist");
const { version } = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
const zip = resolve(root, `release/ai-tab-organizer-${version}.zip`);

execFileSync("npx", ["vite", "build", "--mode", "store"], { cwd: root, stdio: "inherit" });

// Safety check: no secret from .env may appear anywhere in the package.
const secrets: string[] = [];
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^VITE_\w+=(.+)$/);
    if (m && m[1].trim().length >= 8) secrets.push(m[1].trim());
  }
}
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
for (const file of files(out)) {
  const text = readFileSync(file, "latin1");
  if (secrets.some((s) => text.includes(s))) {
    console.error(`\n✗ An API key from .env was found in ${file}. Aborting.`);
    process.exit(1);
  }
}

rmSync(zip, { force: true });
execFileSync("zip", ["-qr", zip, "."], { cwd: out });
console.log(`\n✓ ${zip} (${(statSync(zip).size / 1024).toFixed(0)} KB), no API keys included`);
