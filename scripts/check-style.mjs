// Fails when the codebase contains emoji or CSS gradients (section 1 visual rules).
import fs from "node:fs";
import path from "node:path";

const roots = ["src", "supabase", "public", "docs", "README.md"];
const skip = new Set(["node_modules", ".next", "database.types.ts"]);
const emoji = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const gradient = /(linear|radial|conic)-gradient|bg-gradient-to-|from-\w+-\d+\s+to-\w+-\d+/;
let bad = 0;

function walk(p) {
  if (skip.has(path.basename(p))) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).forEach((f) => walk(path.join(p, f)));
  if (!/\.(tsx?|jsx?|mjs|css|sql|md|json|html)$/.test(p)) return;
  const text = fs.readFileSync(p, "utf8");
  text.split("\n").forEach((line, i) => {
    if (emoji.test(line)) { console.log(`${p}:${i + 1}: emoji`); bad++; }
    if (gradient.test(line) && !p.endsWith("check-style.mjs")) { console.log(`${p}:${i + 1}: gradient`); bad++; }
  });
}
roots.forEach((r) => fs.existsSync(r) && walk(r));
if (bad) { console.error(`${bad} style violation(s)`); process.exit(1); }
console.log("No emoji and no gradients found.");
