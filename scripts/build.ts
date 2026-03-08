import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: {
    content: "src/content.ts",
    background: "src/background.ts",
    popup: "src/popup.ts"
  },
  bundle: true,
  minify: true,
  outdir: "dist",
  target: ["chrome109"],
  format: "esm"
});

cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/popup.html", "dist/popup.html");

console.log("Build complete: dist/");
