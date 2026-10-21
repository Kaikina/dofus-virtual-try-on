// Generates public/og.png, the 1200×630 link-preview image: the page's palette, its title, and a few real items
// from the catalogue in face view. Run after the catalogue build: node tools/make-og.mjs
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const W = 1200, H = 630;
// Same values as src/tokens.css (paper, ink, muted, accent), as sRGB for librsvg
const PAPER = "#0f1118", INK = "#eff0f5", MUTED = "#9da0ad", ACCENT = "#e7b85c", RULE = "#2b2e3a";

/** Items shown on the right: [folder, skin id, file]. */
const ITEMS = [
  ["ailes", 2934, "Ailes_2.webp"],
  ["coiffes", 239, "Chapeau_2.webp"],
  ["coiffes", 448, "Chapeau_2.webp"],
  ["capes", 178, "Cape_2.webp"],
  ["coiffes", 292, "Chapeau_2.webp"],
  ["coiffes", 4919, "Chapeau_2.webp"],
];

const text = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <line x1="600" y1="64" x2="600" y2="${H - 64}" stroke="${RULE}" stroke-width="1"/>
  <text x="64" y="120" font-family="Segoe UI, Arial, sans-serif" font-size="22" letter-spacing="3" fill="${MUTED}">FANSITE DOFUS · GRATUIT</text>
  <text font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="64" fill="${INK}" letter-spacing="-1">
    <tspan x="64" y="230">Essayez coiffes,</tspan>
    <tspan x="64" y="306">capes et ailes</tspan>
    <tspan x="64" y="382">sur votre webcam</tspan>
  </text>
  <rect x="64" y="424" width="72" height="5" fill="${ACCENT}"/>
  <text x="64" y="486" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="${MUTED}">635 coiffes · 379 capes · 36 ailes</text>
  <text x="64" y="${H - 64}" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="${MUTED}">virtual-try-on-dofus.tom-girou.dev</text>
</svg>`;

// Right half: a 3×2 grid of items, each fitted in its cell
const cellW = 160, cellH = 220, x0 = 640, y0 = 85;
const tiles = await Promise.all(ITEMS.map(async ([folder, id, file], i) => ({
  input: await sharp(path.join(root, "public", folder, String(id), file))
    .resize(cellW - 16, cellH - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
  left: x0 + (i % 3) * (cellW + 20) + 8,
  top: y0 + Math.floor(i / 3) * (cellH + 20) + 8,
})));

await sharp(Buffer.from(text)).composite(tiles).png({ compressionLevel: 9 }).toFile(path.join(root, "public", "og.png"));
console.log("public/og.png written");
