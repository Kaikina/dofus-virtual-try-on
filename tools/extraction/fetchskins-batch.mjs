// Save the SkinAsset JSON of many skins, loading them into AssetRipper in batches (all at once runs out of memory).
// Needs AssetRipper running headless on port 8765 with DefaultVersion set to the client's Unity version.
// Usage: node fetchskins-batch.mjs <outDir> [batchSize] [idsFile]   (default: every skin bundle of the client)
import fs from "node:fs";
import path from "node:path";

const [outDir, size = "300", idsFile] = process.argv.slice(2);
const SKINS = "E:/Dofus/Dofus-dofus3/Dofus_Data/StreamingAssets/Content/Characters/Skins";
const base = "http://localhost:8765";
const post = (u, body) => fetch(base + u, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, redirect: "manual" });
const get = async u => (await fetch(base + u)).text();

const ids = idsFile
  ? fs.readFileSync(idsFile, "utf8").split(/\s+/).filter(Boolean)
  : fs.readdirSync(SKINS).map(f => f.match(/^skins_assets_skin_(\d+)\.bundle$/)?.[1]).filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });
const todo = ids.filter(id => !fs.existsSync(path.join(outDir, `${id}.json`)));
console.log(`${todo.length} of ${ids.length} skins to fetch`);

const enc = o => encodeURIComponent(JSON.stringify(o));
for (let i = 0; i < todo.length; i += +size) {
  const chunk = todo.slice(i, i + +size);
  await post("/Reset", "");
  await post("/LoadFile", chunk.map(id => "Path=" + encodeURIComponent(`${SKINS}/skins_assets_skin_${id}.bundle`)).join("&"));
  // Each loaded file is a child bundle of the root; its first collection holds the SkinAsset MonoBehaviour
  const root = await get(`/Bundles/View?Path=${enc({ P: [] })}`);
  const children = [...root.matchAll(/href="\/Bundles\/View\?Path=([^"]*)"/g)].map(m => JSON.parse(decodeURIComponent(m[1].replace(/&amp;/g, "&"))));
  let saved = 0;
  for (const b of children) {
    if (b.P.length !== 1) continue;
    const coll = await get(`/Collections/View?Path=${enc({ B: b, I: 0 })}`);
    const rows = [...coll.matchAll(/<tr data-class="([^"]*)"><td>([^<]*)<\/td><td>[^<]*<\/td><td><a[^>]*>([^<]*)</g)];
    const mb = rows.find(r => r[1] === "MonoBehaviour");
    if (!mb) continue;
    // Path ids are 64-bit: splice the digits in as text, a JS number would round them
    const json = await get(`/Assets/Json?Path=${encodeURIComponent(`{"C":${JSON.stringify({ B: b, I: 0 })},"D":${mb[2]}}`)}`);
    const name = JSON.parse(json).m_Name;
    fs.writeFileSync(path.join(outDir, `${name}.json`), json);
    saved++;
  }
  console.log(`batch ${i / +size + 1}: ${saved} saved`);
}
