---
navigation_title: "TypeScript project references"
description: "How to configure TypeScript project references in a Kibana plugin."
---

# TypeScript project references

All new Kibana code should be written in [TypeScript](https://www.typescriptlang.org/). Kibana uses [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html) and [incremental builds](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#faster-subsequent-builds-with-the---incremental-flag) to keep compilation fast and IDE responses snappy across the large codebase.

## How project references work

Instead of compiling the whole codebase at once, the project references setup splits the code into independent projects that form a directed acyclic graph (DAG). This lets the TypeScript compiler (`tsc`) apply several optimizations:

- Every project emits public interfaces as `d.ts` type declarations.
- Those declarations are used when a referenced project is imported, avoiding re-compilation of unchanged dependencies.
- Only projects that have changed (or depend on something that changed) are rebuilt.

More details are available in the [official TypeScript docs](https://www.typescriptlang.org/docs/handbook/project-references.html).

## Constraints

The project reference architecture imposes a few rules:

- **No circular dependencies.** When building with project references (using `node scripts/type_check` or `./node_modules/.bin/tsc -b`), circular dependencies between projects are detected and must be resolved.
- **Every project must emit type declarations.** This is not always possible if the compiler cannot infer a type. Two common cases:
  1. Your plugin exports a type that infers an internal Kibana type — either export the internal type or declare the exported type explicitly.
  2. Your plugin exports something that infers a type from a third-party library that doesn't export it — declare the exported type manually.

## Setting up project references for a new plugin

1. Make sure all plugins listed in `requiredPlugins`, `optionalPlugins`, and `requiredBundles` in your `kibana.jsonc` already have `tsconfig.json` files with project references configured.

2. Add a `tsconfig.json` in the root folder of your plugin:

```json
{
  "extends": "@kbn/tsconfig-base/tsconfig.json",
  "compilerOptions": {
    "outDir": "./target/types",
    "emitDeclarationOnly": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": [
    // add all the folders containing files to be compiled
  ],
  "references": [
    { "path": "../../core/tsconfig.json" }
    // add references to other TypeScript projects your plugin depends on
  ]
}
```

   If your plugin imports a file not listed in `include`, the build will fail with: `File '…' is not listed within the file list of project …`. Either list the file explicitly or use an `include` pattern.

3. Build your plugin and fix any type declaration errors:

```bash
node scripts/type_check --project src/plugins/my_plugin/tsconfig.json
```

4. Add your project reference to the `references` property of `tsconfig.refs.json`.

5. Add your plugin to the `references` property and your plugin folder to the `exclude` property of the root `tsconfig.json` it previously belonged to (e.g. `tsconfig.json` for `src/plugins/**`, `x-pack/tsconfig.json` for `x-pack/plugins/**`).

6. Add a reference to your project in all Kibana `tsconfig.json` files that may import it: `tsconfig.json`, `test/tsconfig.json`, `x-pack/tsconfig.json`, `x-pack/platform/test/tsconfig.json`, and any plugin-specific `tsconfig.refs.json` for dependent plugins.

You can use [PR #79446](https://github.com/elastic/kibana/pull/79446) as a reference example.

## Measuring compilation performance

To check whether your changes improve or regress `tsc` performance:

```bash
node --max-old-space-size=4096 ./node_modules/.bin/tsc -p tsconfig.json --extendedDiagnostics --noEmit
```

Compare the output against `main`.
