import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/content.ts"],
  bundle: true,
  minify: true,
  outfile: "dist/content.js",
  target: ["chrome109"],
  format: "iife"
});

cpSync("src/manifest.json", "dist/manifest.json");

console.log("Build complete: dist/");
