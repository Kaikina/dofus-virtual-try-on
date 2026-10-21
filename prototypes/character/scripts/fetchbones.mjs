// Load one Bones bundle in AssetRipper (headless, localhost:8765, DefaultVersion=6000.3.16f1) and save:
//  - <outDir>/*.json : every MonoBehaviour (the rig: exposedNodeNames, animation list) via /Assets/Json
//  - <outDir>/../export-<prefix>/Assets/TextAsset/*.bytes : the animations, raw, via Export/PrimaryContent.
//    /Assets/Text and /Assets/Json mangle the binary (bytes ≥ 0x80 become U+FFFD) and /Assets/Binary returns nothing.
// Usage: node fetchbones.mjs <bundle name without .bundle> <outDir>   e.g. bones_assets_bone_1-static .../bone_1-static
import fs from "fs";
import path from "path";
const [name, out] = process.argv.slice(2);
const base = "http://localhost:8765";
const post = (u, body) => fetch(base + u, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, redirect: "manual" });
await post("/Reset", "");
await post("/LoadFile", "Path=" + encodeURIComponent(`E:/Dofus/Dofus-dofus3/Dofus_Data/StreamingAssets/Content/Characters/Bones/${name}.bundle`));
const coll = encodeURIComponent('{"B":{"P":[0]},"I":0}');
const html = await (await fetch(`${base}/Collections/View?Path=${coll}`)).text();
// path ids are read as strings: they exceed 2^53 and lose precision as JSON numbers
const rows = [...html.matchAll(/<tr data-class="([^"]*)"><td>([^<]*)<\/td>/g)].map(m => ({ cls: m[1], pid: m[2] }));
const asset = pid => encodeURIComponent(`{"C":{"B":{"P":[0]},"I":0},"D":${pid}}`);
fs.mkdirSync(out, { recursive: true });
for (const r of rows.filter(r => r.cls === "MonoBehaviour"))
  fs.writeFileSync(`${out}/MonoBehaviour_${r.pid}.json`, await (await fetch(`${base}/Assets/Json?Path=${asset(r.pid)}`)).text());
const prefix = name.replace(/^bones_assets_bone_/, "");
await post("/Export/PrimaryContent", "Path=" + encodeURIComponent(path.resolve(out, `../export-${prefix}`)));
console.log(rows.length, "assets:", Object.entries(rows.reduce((a, r) => (a[r.cls] = (a[r.cls] || 0) + 1, a), {})).map(e => e.join("=")).join(" "));
