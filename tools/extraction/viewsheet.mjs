// Contact sheet: one row per skin; columns = back layer + front layer composed, per direction; red cross = attach point
import sharp from "sharp"; import fs from "fs";
const [viewsDir, out, ...ids] = process.argv.slice(2);
const dirs = [["2", "face"], ["1", "3/4"], ["0", "profil"]];
const CW = 340, CH = 330, OX = 170, OY = 270; // cell size and where the attach point lands in each cell
const tiles = [];
for (const [r, id] of ids.entries()) {
  const meta = JSON.parse(fs.readFileSync(`${viewsDir}/${id}/views.json`)).views;
  tiles.push({ input: Buffer.from(`<svg width="80" height="40"><text x="4" y="26" font-size="22" font-family="Arial">${id}</text></svg>`), left: 0, top: r * CH + 120 });
  for (const [c, [d, label]] of dirs.entries()) {
    const left = 80 + c * CW, top = r * CH;
    for (const layer of [`ChapeauB_${d}`, `Chapeau_${d}`]) {
      const m = meta[layer]; if (!m) continue;
      const scale = 0.6; // shrink to fit
      const w = Math.round(m.width * scale), h = Math.round(m.height * scale);
      let input = await sharp(`${viewsDir}/${id}/${layer}.png`).resize(w, h).png().toBuffer();
      if (layer.startsWith("ChapeauB")) input = await sharp(input).modulate({ brightness: 0.6 }).png().toBuffer(); // darken back layer to tell it apart
      tiles.push({ input, left: Math.max(0, left + OX - Math.round(m.originX * scale)), top: Math.max(0, top + OY - Math.round(m.originY * scale)) });
    }
    tiles.push({ input: Buffer.from(`<svg width="${CW}" height="${CH}"><line x1="${OX - 8}" y1="${OY}" x2="${OX + 8}" y2="${OY}" stroke="red" stroke-width="2"/><line x1="${OX}" y1="${OY - 8}" x2="${OX}" y2="${OY + 8}" stroke="red" stroke-width="2"/><text x="6" y="${CH - 14}" font-size="16" font-family="Arial" fill="#555">${label}</text></svg>`), left, top });
  }
}
await sharp({ create: { width: 80 + dirs.length * CW, height: ids.length * CH, channels: 3, background: "#e8e8e8" } }).composite(tiles).png().toFile(out);
