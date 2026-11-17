import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensions = [".ts", ".tsx", ".js", ".mjs"];

function resolveFile(basePath) {
  if (path.extname(basePath)) {
    return existsSync(basePath) ? basePath : null;
  }

  for (const extension of extensions) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) return candidate;
  }

  for (const extension of extensions) {
    const candidate = path.join(basePath, `index${extension}`);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const candidate = resolveFile(
      path.resolve(process.cwd(), "src", specifier.slice(2)),
    );
    if (candidate) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const url = new URL(specifier, context.parentURL);
    const filePath = fileURLToPath(url);
    if (!path.extname(filePath)) {
      const candidate = resolveFile(filePath);
      if (candidate) {
        const resolved = pathToFileURL(candidate);
        resolved.search = url.search;
        resolved.hash = url.hash;
        return { url: resolved.href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}
