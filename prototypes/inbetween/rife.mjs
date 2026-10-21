// Method C: RIFE (rife-ncnn-vulkan, model rife-v4.6) between face→3/4 and 3/4→profile, 31 frames per segment.
// RIFE only sees RGB, so colour (bled past the edges, see bleed) and alpha are interpolated as two separate image pairs.
// CLI: node rife.mjs <path to rife-ncnn-vulkan.exe>
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { HATS, S, loadView, bleed, P } from "./lib.mjs";

const exe = process.argv[2], model = process.argv[3] ?? "rife-v4.6";

const save = (buf, file) => sharp(buf, { raw: { width: S, height: S, channels: 3 } }).png().toFile(file);
for (const id of HATS) {
  for (const [seg, d0, d1] of [["21", 2, 1], ["10", 1, 0]]) {
    const dir = P(`rife/${id}/${seg}`);
    for (const [k, d] of [[1, d0], [2, d1]]) {
      const f = await loadView(id, d), col = bleed(f), rgb = Buffer.alloc(S * S * 3), al = Buffer.alloc(S * S * 3);
      for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) {
        rgb[i * 3 + c] = Math.round(col[i * 3 + c] * 255);
        al[i * 3 + c] = Math.round(f.d[i * 4 + 3] * 255);
      }
      for (const [kind, buf] of [["rgb", rgb], ["alpha", al]]) {
        fs.mkdirSync(`${dir}/in-${kind}`, { recursive: true });
        await save(buf, `${dir}/in-${kind}/${String(k).padStart(8, "0")}.png`);
      }
    }
    for (const kind of ["rgb", "alpha"]) {
      fs.mkdirSync(`${dir}/${kind}`, { recursive: true });
      const t0 = Date.now();
      execFileSync(exe, ["-i", `${dir}/in-${kind}`, "-o", `${dir}/${kind}`, "-n", "31", "-m", exe.replace(/[^\\/]+$/, model)], { stdio: "pipe" });
      console.log(id, seg, kind, `${Date.now() - t0} ms`);
    }
  }
}
