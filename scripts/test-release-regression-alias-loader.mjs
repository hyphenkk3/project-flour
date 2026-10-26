import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire, registerHooks } from "node:module";

const root = process.cwd();
const extensions = [".ts", ".mts", ".js", ".mjs"];
const require = createRequire(pathToFileURL(path.join(root, "package.json")));
const ts = require("typescript");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes(`${path.sep}node_modules${path.sep}`)) {
      return nextResolve(specifier, context);
    }
    let base;
    if (specifier.startsWith("@/")) {
      base = path.resolve(root, "src", specifier.slice(2));
    } else if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:") &&
      !path.extname(specifier)
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    } else {
      try {
        const resolvedPackageFile = require.resolve(specifier);
        return nextResolve(pathToFileURL(resolvedPackageFile).href, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }

    for (const extension of [...extensions, ".tsx"]) {
      if (existsSync(base + extension)) {
        return nextResolve(pathToFileURL(base + extension).href, context);
      }
    }
    if (existsSync(base) && !path.extname(base)) {
      for (const extension of extensions) {
        const indexFile = path.join(base, `index${extension}`);
        if (existsSync(indexFile)) {
          return nextResolve(pathToFileURL(indexFile).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith("file:")) return nextLoad(url, context);
    const filePath = fileURLToPath(url);
    if (
      !filePath.startsWith(root + path.sep) ||
      !/\.(?:ts|mts|tsx)$/.test(filePath)
    ) {
      return nextLoad(url, context);
    }
    const source = require("node:fs").readFileSync(filePath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filePath,
    });
    return { format: "module", source: outputText, shortCircuit: true };
  },
});
