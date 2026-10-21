// Parse Dofus 3 i18n .bin: [lenstr lang][u32 count][count x (u32 id, u32 offset)] then 7-bit-length UTF-8 strings
// CLI (search): node i18n.mjs <lang.bin> <regex>
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function loadI18n(path) {
  const b = fs.readFileSync(path);
  let p = 1 + b[0];
  const n = b.readUInt32LE(p); p += 4;
  const map = new Map();
  for (let i = 0; i < n; i++, p += 8) {
    const id = b.readUInt32LE(p), off = b.readUInt32LE(p + 4);
    let q = off, len = 0, shift = 0, c;
    do { c = b[q++]; len |= (c & 0x7f) << shift; shift += 7; } while (c & 0x80);
    map.set(id, b.toString("utf8", q, q + len));
  }
  return map;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const m = loadI18n(process.argv[2]);
  const re = new RegExp(process.argv[3], "i");
  for (const [id, s] of m) if (re.test(s) && s.length < 60) console.log(id, s);
}
