// Load one skin bundle in AssetRipper and save its SkinAsset JSON + atlas PNG. Usage: node fetchskin.mjs <skinId> <outDir>
import fs from "fs";
const [id, out] = process.argv.slice(2);
const base = "http://localhost:8765";
const post = (u, body) => fetch(base + u, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, redirect: "manual" });
await post("/Reset", "");
await post("/LoadFile", "Path=" + encodeURIComponent(`E:/Dofus/Dofus-dofus3/Dofus_Data/StreamingAssets/Content/Characters/Skins/skins_assets_skin_${id}.bundle`));
const coll = encodeURIComponent('{"B":{"P":[0]},"I":0}');
const html = await (await fetch(`${base}/Collections/View?Path=${coll}`)).text();
const rows = [...html.matchAll(/<tr data-class="([^"]*)"><td>([^<]*)<\/td>/g)].map(m => ({ cls: m[1], pid: m[2] }));
const asset = pid => encodeURIComponent(`{"C":{"B":{"P":[0]},"I":0},"D":${pid}}`);
fs.mkdirSync(out, { recursive: true });
for (const r of rows) {
  if (r.cls === "MonoBehaviour") fs.writeFileSync(`${out}/${id}.json`, await (await fetch(`${base}/Assets/Json?Path=${asset(r.pid)}`)).text());
  if (r.cls === "Texture2D") fs.writeFileSync(`${out}/${id}_atlas.png`, Buffer.from(await (await fetch(`${base}/Assets/Image?Path=${asset(r.pid)}&Extension=png`)).arrayBuffer()));
}
console.log(id, rows.map(r => r.cls).join(","));
