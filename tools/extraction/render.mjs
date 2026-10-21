// Render each part of a Dofus 3 SkinAsset (mesh + atlas) to its own PNG, in a shared coordinate frame
// whose origin is the attach point (head bone).
// CLI: node render.mjs <skinJson> <atlasPng> <outDir> [pxPerUnit]
import sharp from "sharp";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const ID = { rX: 1, uX: 0, rY: 0, uY: 1, tX: 0, tY: 0 };
const mul = (a, b) => ({ // a ∘ b (apply b then a)
  rX: a.rX * b.rX + a.uX * b.rY, uX: a.rX * b.uX + a.uX * b.uY,
  rY: a.rY * b.rX + a.uY * b.rY, uY: a.rY * b.uX + a.uY * b.uY,
  tX: a.rX * b.tX + a.uX * b.tY + a.tX, tY: a.rY * b.tX + a.uY * b.tY + a.tY });
const apply = (m, p) => ({ x: m.rX * p.x + m.uX * p.y + m.tX, y: m.rY * p.x + m.uY * p.y + m.tY });

/**
 * Renders every `<Part>_<dir>` part of a skin: `Chapeau_<dir>` / `ChapeauB_<dir>` (hat front / back layer),
 * `Cape_<dir>` / `CapeBas_<dir>` (cape top / bottom), etc.
 * Returns { pxPerUnit, parts: { [partName]: { file, width, height, originX, originY } } } where
 * (originX, originY) is the pixel position of the attach point inside the PNG.
 * `directions` (e.g. [0, 1, 2]) limits rendering to those Dofus directions.
 */
export async function renderSkin(skinJsonPath, atlasPath, outDir, pxPerUnit = 16, directions = null) {
  const st = JSON.parse(fs.readFileSync(skinJsonPath, "utf8")).m_Structure;
  const { data: tex, info: ti } = await sharp(atlasPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const parts = Object.fromEntries(st.m_values.map(v => [v.name, v]));

  // Skins with "ColorGray…" symbols carry pieces of the character to be tinted with the player's colours (e.g. ears
  // showing through hair). Besides those symbols, the same pieces also come as plain chunks with a fully grey texture.
  const hasCharacterPieces = st.referencedSymbols.some(n => n.startsWith("ColorGray"));
  /** Saturation of a chunk's texture, sampled at its triangles' centroids (0 = pure grey). */
  function saturation(c) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < c.indexCount; i += 3) {
      const uv = [0, 1, 2].map(k => st.vertices[c.startVertexIndex + st.triangles[c.startIndexIndex + i + k]].uv);
      const s = sample((uv[0].x + uv[1].x + uv[2].x) / 3, (uv[0].y + uv[1].y + uv[2].y) / 3);
      if (s[3] < 128) continue;
      r += s[0]; g += s[1]; b += s[2]; n++;
    }
    if (!n) return 1;
    const max = Math.max(r, g, b) / n, min = Math.min(r, g, b) / n;
    return max ? (max - min) / max : 0;
  }
  const isCharacterPiece = c => hasCharacterPieces && saturation(c) < 0.05;

  // Flatten a part into triangles [{p:[3 pos], uv:[3 uv]}] in draw order
  function tris(part, m, out) {
    let chunk = 0;
    for (const e of part.DisplayListEntry) {
      if (e.symbolId === -1) {
        const c = part.skinChunks[chunk++]; if (!c || isCharacterPiece(c)) continue;
        for (let i = 0; i < c.indexCount; i += 3) {
          const vs = [0, 1, 2].map(k => st.vertices[c.startVertexIndex + st.triangles[c.startIndexIndex + i + k]]);
          out.push({ p: vs.map(v => apply(m, v.pos)), uv: vs.map(v => v.uv) });
        }
      } else {
        const name = st.referencedSymbols[e.symbolId];
        // "ColorGray…" symbols are pieces of the character itself (e.g. its ears showing through hair), drawn grey for
        // the game to tint with the player's colours: the person trying the item on has their own, so leave them out
        if (name?.startsWith("ColorGray")) continue;
        const sym = parts[name];
        // display-list transforms are column-major Flash matrices (y down): transpose, then conjugate by a y-flip for the y-up mesh space
        const t = e.transform, f = { rX: t.rX, uX: -t.rY, rY: -t.uX, uY: t.uY, tX: t.tX, tY: -t.tY };
        if (sym) tris(sym, mul(m, f), out);
      }
    }
    return out;
  }
  function sample(u, v) { // bilinear, uv origin bottom-left
    const x = u * ti.width - 0.5, y = (1 - v) * ti.height - 0.5;
    const x0 = Math.max(0, Math.min(ti.width - 1, Math.floor(x))), y0 = Math.max(0, Math.min(ti.height - 1, Math.floor(y)));
    const x1 = Math.min(ti.width - 1, x0 + 1), y1 = Math.min(ti.height - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const px = (xx, yy, c) => tex[(yy * ti.width + xx) * 4 + c];
    return [0, 1, 2, 3].map(c => px(x0, y0, c) * (1 - fx) * (1 - fy) + px(x1, y0, c) * fx * (1 - fy) + px(x0, y1, c) * (1 - fx) * fy + px(x1, y1, c) * fx * fy);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const meta = {};
  for (const name of st.m_keys.filter(n => /^[A-Za-z]+_\d$/.test(n) && (!directions || directions.includes(+n.at(-1))))) {
    const T = tris(parts[name], ID, []);
    if (!T.length) continue;
    const xs = T.flatMap(t => t.p.map(p => p.x)), ys = T.flatMap(t => t.p.map(p => p.y));
    const minX = Math.floor(Math.min(...xs)), maxX = Math.ceil(Math.max(...xs)), minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
    const W = (maxX - minX) * pxPerUnit, H = (maxY - minY) * pxPerUnit;
    const img = new Float32Array(W * H * 4);
    const toPx = p => ({ x: (p.x - minX) * pxPerUnit, y: (maxY - p.y) * pxPerUnit }); // y up -> screen y down
    for (const t of T) {
      const [a, b, c] = t.p.map(toPx);
      const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y); if (Math.abs(area) < 1e-9) continue;
      for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); y < Math.min(H, Math.ceil(Math.max(a.y, b.y, c.y))); y++)
        for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); x < Math.min(W, Math.ceil(Math.max(a.x, b.x, c.x))); x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / area;
          const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const s = sample(w0 * t.uv[0].x + w1 * t.uv[1].x + w2 * t.uv[2].x, w0 * t.uv[0].y + w1 * t.uv[1].y + w2 * t.uv[2].y);
          const i = (y * W + x) * 4, sa = s[3] / 255, da = img[i + 3];
          const oa = sa + da * (1 - sa);
          for (let k = 0; k < 3; k++) img[i + k] = oa ? (s[k] * sa + img[i + k] * da * (1 - sa)) / oa : 0;
          img[i + 3] = oa;
        }
    }
    const buf = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { for (let k = 0; k < 3; k++) buf[i * 4 + k] = img[i * 4 + k]; buf[i * 4 + 3] = Math.round(img[i * 4 + 3] * 255); }
    const file = `${name}.png`;
    await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(`${outDir}/${file}`);
    meta[name] = { file, width: W, height: H, originX: -minX * pxPerUnit, originY: maxY * pxPerUnit };
  }
  return { pxPerUnit, parts: meta };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [jsonPath, atlasPath, outDir, ppu = "16"] = process.argv.slice(2);
  const res = await renderSkin(jsonPath, atlasPath, outDir, +ppu);
  fs.writeFileSync(`${outDir}/views.json`, JSON.stringify(res, null, 2));
  console.log(Object.keys(res.parts).join(" "));
}
