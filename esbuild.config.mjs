import esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const isWindows = process.platform === "win32";

function packDir(sourceDir, outFile) {
  if (isWindows) {
    const src = resolve(sourceDir).replace(/\\/g, "\\\\");
    const dest = resolve(outFile).replace(/\\/g, "\\\\");
    execSync(`powershell -Command "Compress-Archive -Path '${src}\\\\*' -DestinationPath '${dest}' -Force"`);
  } else {
    execSync(`cd ${sourceDir} && zip -r ../${outFile.replace(/^dist\//, "")} .`);
  }
}

function packFiles(files, outFile) {
  if (isWindows) {
    const dest = resolve(outFile).replace(/\\/g, "\\\\");
    const paths = files.map((f) => `'${resolve(f).replace(/\\/g, "\\\\")}'`).join(", ");
    execSync(`powershell -Command "Compress-Archive -Path ${paths} -DestinationPath '${dest}' -Force"`);
  } else {
    execSync(`zip -r ${outFile} ${files.join(" ")} -x "*.DS_Store"`);
  }
}

const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");
const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "all"; // "chrome" | "firefox" | "all"

const buildChrome = target === "all" || target === "chrome";
const buildFirefox = target === "all" || target === "firefox";
const buildEdge = target === "all" || target === "edge";

const shared = {
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: false,
  sourcemap: false,
};

// ---------------------------------------------------------------------------
// Copy static files
// ---------------------------------------------------------------------------

if (buildChrome) {
  mkdirSync("dist/chrome/assets", { recursive: true });
  cpSync("src/extension/manifest.json", "dist/chrome/manifest.json");
  cpSync("src/assets", "dist/chrome/assets", { recursive: true });
}

if (buildFirefox) {
  mkdirSync("dist/firefox/assets", { recursive: true });
  cpSync("src/extension/manifest.firefox.json", "dist/firefox/manifest.json");
  cpSync("src/assets", "dist/firefox/assets", { recursive: true });
}

if (buildEdge) {
  mkdirSync("dist/edge/assets", { recursive: true });
  cpSync("src/extension/manifest.json", "dist/edge/manifest.json");
  cpSync("src/assets", "dist/edge/assets", { recursive: true });
}

// ---------------------------------------------------------------------------
// Build configs
// ---------------------------------------------------------------------------

function makeConfigs(outdir) {
  const configs = [
    { ...shared, entryPoints: ["src/lib/api.ts"], outfile: `${outdir}/capture.js` },
    { ...shared, entryPoints: ["src/extension/background.ts"], outfile: `${outdir}/background.js` },
    { ...shared, entryPoints: ["src/extension/toolbar.ts"], outfile: `${outdir}/toolbar.js` },
  ];
  // injector.js is only needed for Firefox
  if (outdir.includes("firefox")) {
    configs.push({
      ...shared,
      entryPoints: ["src/extension/injector.ts"],
      outfile: `${outdir}/injector.js`,
    });
  }
  return configs;
}

const configs = [
  ...(buildChrome ? makeConfigs("dist/chrome") : []),
  ...(buildFirefox ? makeConfigs("dist/firefox") : []),
  ...(buildEdge ? makeConfigs("dist/edge") : []),
];

// ---------------------------------------------------------------------------
// Build or watch
// ---------------------------------------------------------------------------

if (watch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }
  console.log("Watching for changes...");
} else {
  await Promise.all(configs.map((config) => esbuild.build(config)));
  const targets = [buildChrome && "chrome", buildFirefox && "firefox", buildEdge && "edge"].filter(Boolean).join(", ");
  console.log(`Build complete: ${targets}`);

  if (zip) {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    if (buildChrome) {
      const name = `dist/h2d-capture-chrome-v${version}.zip`;
      packDir("dist/chrome", name);
      console.log(`Packed: ${name}`);
    }
    if (buildFirefox) {
      const name = `dist/h2d-capture-firefox-v${version}.zip`;
      packDir("dist/firefox", name);
      console.log(`Packed: ${name}`);
    }
    if (buildEdge) {
      const name = `dist/h2d-capture-edge-v${version}.zip`;
      packDir("dist/edge", name);
      console.log(`Packed: ${name}`);
    }
    // Source code archive for Firefox Add-on review
    const srcName = `dist/h2d-capture-source-v${version}.zip`;
    packFiles(["src", "package.json", "package-lock.json", "tsconfig.json", "esbuild.config.mjs", "README.md", "LICENSE"], srcName);
    console.log(`Packed: ${srcName}`);
  }
}
