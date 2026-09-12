import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Load the real, browser-independent TypeScript modules in Node's test runner.
// Entity-method tests explicitly register their own small Phaser math boundary;
// these checks are not rendering, DOM, physics-world or browser integration tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(candidate.pathname) && existsSync(fileURLToPath(`${candidate.href}.ts`))) {
        return { url: `${candidate.href}.ts`, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
          fileName: fileURLToPath(url),
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});
