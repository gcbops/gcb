const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/app.js"],
  bundle: true,
  outfile: "build/scripts.bundle.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: false,
  minify: false
})
.then(() => {
  console.log("✓ Bundled JavaScript");
})
.catch(() => process.exit(1));