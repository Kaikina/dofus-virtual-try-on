import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Dev server only: lets dev/harness.html save rendered frames to .dev-snapshots/ for visual checks. */
function devSnapshots(): Plugin {
  const dir = path.resolve(import.meta.dirname, ".dev-snapshots");
  return {
    name: "dev-snapshots",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/snapshot", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name")?.replace(/[^\w-]/g, "") || "snapshot";
        const chunks: Buffer[] = [];
        req.on("data", c => chunks.push(c));
        req.on("end", () => {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.concat(chunks));
          res.end("ok");
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [devSnapshots()],
});
