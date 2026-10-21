// Decoder for Dofus 3 "Bones" animation TextAssets (raw .bytes from AssetRipper's Export/PrimaryContent).
// Layout (little endian), reverse-engineered on 1-static_AnimStatiqueExplo0_2:
//   u16 frameCount, u16 maxEntriesPerFrame, u16 ?, u16 ?, u32 frameOffset[frameCount]
//   frame = entries until next offset; entry = u16 depth, u16 flags, i16 ?, u16 nodeId, u16 ?, u16 ?, then payload by flags
//   flags & 0x10 -> 6 x f32 matrix [a b tx c d ty] (y up, units = 3 x skin units); flags 0x20 alone -> same as previous frame
import fs from "fs";
export function decodeAnim(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const frameCount = dv.getUint16(0, true), maxEntries = dv.getUint16(2, true), h2 = dv.getUint16(4, true), h3 = dv.getUint16(6, true);
  const offs = Array.from({ length: frameCount }, (_, i) => dv.getUint32(8 + 4 * i, true));
  const frames = [], unknownFlags = new Set();
  for (let f = 0; f < frameCount; f++) {
    let p = offs[f]; const end = f + 1 < frameCount ? offs[f + 1] : buf.byteLength; const es = [];
    while (p < end) {
      const e = { depth: dv.getUint16(p, true), flags: dv.getUint16(p + 2, true), a: dv.getInt16(p + 4, true), node: dv.getUint16(p + 6, true), b: dv.getUint16(p + 8, true), c: dv.getUint16(p + 10, true) };
      p += 12;
      if (e.flags & 0x10) { e.m = Array.from({ length: 6 }, (_, k) => dv.getFloat32(p + 4 * k, true)); p += 24; }
      if (e.flags & ~0x30) { unknownFlags.add(e.flags); e.rest = [...buf.subarray(p, Math.min(end, p + 32))]; break; }
      es.push(e);
    }
    frames.push(es);
  }
  return { frameCount, maxEntries, h2, h3, frames, unknownFlags: [...unknownFlags] };
}
if (process.argv[1]?.endsWith("bonesanim.mjs")) {
  const [file, namesJson] = process.argv.slice(2);
  const names = JSON.parse(fs.readFileSync(namesJson, "utf8").replace(/-?Infinity/g, "null")).m_Structure.exposedNodeNames;
  const a = decodeAnim(fs.readFileSync(file));
  console.log("frames", a.frameCount, "max", a.maxEntries, "h", a.h2, a.h3, "unknownFlags", a.unknownFlags.map(x => x.toString(16)));
  for (const e of a.frames[0]) console.log(e.depth, e.flags.toString(16), e.a, names[e.node], e.b, e.c, e.m?.map(v => +v.toFixed(3)).join(" "));
}
