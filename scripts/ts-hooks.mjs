// Lets plain Node (type stripping) run TypeScript that uses the app's import style:
// `@/x` → project root, and extensionless relative/alias imports → `.ts`/`.tsx`/`index.ts`.
// Used by `npm run migrate:owner` so the script reuses lib/ code without extra dependencies.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

function resolveFile(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Only rewrite imports made by our own TypeScript files; node_modules resolve as usual.
    const fromTs = /\.tsx?$/.test(context.parentURL ?? "") && !context.parentURL.includes("/node_modules/");
    if (!fromTs) return nextResolve(specifier, context);
    let base = null;
    if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
    else if (specifier.startsWith("./") || specifier.startsWith("../")) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    const file = base && resolveFile(base);
    return file ? nextResolve(pathToFileURL(file).href, context) : nextResolve(specifier, context);
  },
});
