---
name: create-kibana-plugin
description: Create a new Kibana plugin from scratch — directory structure, plugin definition, lifecycle methods, registration, and basic tests
---

# Create new Kibana plugin

Use this skill when the user wants to create a new Kibana plugin (e.g. "create a plugin named X" or "scaffold a plugin for solution Y").

## Inputs

- **Plugin name** (e.g. `my_feature`) — kebab-case, used for directory and plugin id
- **Solution area** (optional) — e.g. `security`, `observability`, `search` — determines parent path under `x-pack/plugins/` or `src/plugins/`

## Steps

1. **Determine location.** If solution area is given, place the plugin under the solution’s plugins dir (e.g. `x-pack/plugins/security_solution/plugins/my_feature` or the repo’s equivalent). Otherwise use `src/plugins/my_feature` (or `x-pack/plugins/my_feature` if the repo uses x-pack for new plugins).

2. **Create directory structure:**
   - `public/` — for browser code
   - `server/` — for Node code
   - `common/` — for shared types/constants
   - Root: `plugin.ts` (or split into `public/plugin.ts` and `server/plugin.ts` if the repo uses that pattern)

3. **Create `kibana.jsonc`** in the plugin root with:
   - `id`: plugin id (e.g. `myFeature`)
   - `version`: `kibana.version` or the repo standard
   - `requiredPlugins`: list of core and optional plugin dependencies (e.g. `['core']` or `['core', 'data']`)
   - `optionalPlugins`: if any
   - `server`: true
   - `ui`: true

4. **Implement the plugin class** (in `plugin.ts` or separate public/server files):
   - Constructor: no heavy work
   - `setup(core, plugins)`: register routes, saved object types, return setup contract
   - `start(core, plugins)`: return start contract (and optionally hold service refs)
   - Use proper TypeScript types for `CoreSetup`/`CoreStart` and plugin dependencies

5. **Add minimal public and server entry** so the plugin loads:
   - Public: export the plugin instance and any public contract
   - Server: export the plugin instance and any server contract
   - Follow existing plugins in the repo for the exact export pattern (e.g. `plugin.ts` that imports and re-exports)

6. **Register the plugin** in the parent build/preset if required (e.g. add to `plugins` list in the solution’s or root config). Check the repo’s docs or existing plugins for how new plugins are discovered.

7. **Add a basic Jest test** (e.g. `plugin.test.ts`) that:
   - Mocks core and plugins
   - Instantiates the plugin, calls `setup()` and `start()`, and asserts the returned contract is defined

## Validation (run these and fix any failures)

1. **Type check:** From repo root run `node scripts/type_check` (or the project’s type-check command). Fix any errors in the new plugin files.
2. **Lint:** Run `node scripts/eslint_all_files` (or equivalent) for the new plugin path. Fix any violations.
3. **Unit test:** Run Jest for the new plugin (e.g. `yarn test:jest src/plugins/my_feature` or the repo’s test command). Ensure the new test passes.
4. **Smoke:** If the repo has a "list plugins" or dev server, start it and confirm the new plugin is loaded and does not crash.

After validation, report to the user: plugin path, main files created, and that type-check, lint, and the basic test pass.
