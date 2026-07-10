// Writes layer/nodejs/package.json: the curated dependency list from
// tools/layer-package.json, but every version pinned from the root package.json
// so the layer can't drift behind the app's deps. Version source of truth = root.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rootDeps = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies || {};
const layerPkg = JSON.parse(readFileSync(join(root, "tools/layer-package.json"), "utf8"));

const drifted = [];
layerPkg.dependencies = Object.fromEntries(
  Object.entries(layerPkg.dependencies).map(([name, version]) => {
    const rootVersion = rootDeps[name];
    if (rootVersion && rootVersion !== version) drifted.push(`${name}: ${version} -> ${rootVersion}`);
    return [name, rootVersion || version];
  })
);

const outDir = join(root, "layer/nodejs");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "package.json"), JSON.stringify(layerPkg, null, 2) + "\n");

console.log(drifted.length ? `[build-layer] synced from root:\n  ${drifted.join("\n  ")}` : "[build-layer] layer versions already in sync with root");
