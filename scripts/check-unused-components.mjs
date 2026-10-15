// Détecte les composants (hors components/ui) qui ne sont importés nulle part :
// ce sont les restes d'anciens designs. À lancer avant chaque livraison : npm run check:unused
import fs from "node:fs";
import path from "node:path";

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};
const all = walk(".");
const text = new Map(all.map((f) => [f, fs.readFileSync(f, "utf8")]));
const comps = all.filter((f) => f.startsWith("components" + path.sep) && f.endsWith(".tsx") && !f.includes(path.join("components", "ui") + path.sep));
const unused = comps.filter((f) => {
  const base = path.basename(f, ".tsx");
  const rel = f.replace(/\.tsx$/, "").split(path.sep).join("/");
  const re = new RegExp(`from\\s+["'][^"']*/${base}["']`);
  return ![...text].some(([k, s]) => k !== f && (s.includes("@/" + rel) || re.test(s)));
});
if (unused.length) { console.error("Composants non utilisés (anciens designs ?) :\n" + unused.join("\n")); process.exit(1); }
console.log("OK : aucun composant orphelin.");
