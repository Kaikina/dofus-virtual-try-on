// Self-host MediaPipe: copy the WASM runtime from node_modules and download the Face and Pose Landmarker models into public/mediapipe.
// Run with `npm run setup:mediapipe` after `npm install`.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "public", "mediapipe");
const wasmSrc = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const MODELS = {
  "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  // Shoulders and person segmentation mask, only loaded when a Cape is worn
  "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

fs.mkdirSync(path.join(outDir, "wasm"), { recursive: true });
for (const f of fs.readdirSync(wasmSrc).filter(f => f.startsWith("vision_wasm_internal") || f.startsWith("vision_wasm_nosimd_internal"))) {
  fs.copyFileSync(path.join(wasmSrc, f), path.join(outDir, "wasm", f));
}

for (const [file, url] of Object.entries(MODELS)) {
  const modelPath = path.join(outDir, file);
  if (fs.existsSync(modelPath)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed (${file}): ${res.status}`);
  fs.writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
}
console.log("MediaPipe ready in", path.relative(root, outDir));
