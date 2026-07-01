# Kibana — Project context for AI coding tools

Kibana is a large TypeScript monorepo: the Elastic stack UI for search, observability, and security. This file gives AI tools a quick map of the codebase, build, and where to put new code.

## Build and test (common commands)

```bash
# First-time and after dependency changes
yarn kbn bootstrap

# Type check (run before pushing)
node scripts/type_check

# Lint (run before pushing)
node scripts/eslint_all_files --no-cache
# Or with auto-fix:
node scripts/eslint_all_files --no-cache --fix

# Unit tests (Jest)
yarn test:jest
# Single package:
yarn test:jest packages/kbn-ui-actions

# FTR (functional test runner) — API tests
node scripts/functional_tests_server --config test/api_integration/config.js
node scripts/functional_test_runner --config test/api_integration/config.js

# FTR — UI / functional tests
node scripts/functional_tests --config test/functional/config.js

# Build (production)
yarn build
```

## Architecture summary

### Plugin system

- **Plugins** are the main unit of feature code. Each plugin has:
  - `public/` — browser code (React, UI)
  - `server/` — Node.js code (routes, saved objects, services)
  - `common/` — shared types and utilities used by both
- **Lifecycle:** `constructor` → `setup()` (register APIs, routes) → `start()` (use other plugins’ APIs). No module-level side effects; use lifecycle methods.
- **Contracts:** Plugins depend on each other via **plugin contracts** (public API). Never import from another plugin’s internal paths (e.g. `plugin/server/lib/foo`). Use the plugin’s public or server contract.
- **Manifest:** `kibana.jsonc` declares the plugin id, required/optional dependencies, and config.

### Packages and boundaries

- **`packages/`** — Shared packages under `@kbn/` (e.g. `@kbn/core`, `@kbn/ui-actions`). Use for code shared across many plugins.
- **`x-pack/packages/`** — X-Pack–specific packages (license, ML, etc.).
- **`src/`** — Legacy/core source; new features live in plugins or packages.
- **Naming:** Package scope is `@kbn/<name>`. Plugin IDs are kebab-case (e.g. `my_plugin` or `my-plugin` depending on Kibana convention in use).

### Solutions (solution areas)

- **Security** — `x-pack/solutions/security/` (SIEM, detection rules, timeline, etc.)
- **Observability** — `x-pack/solutions/observability/` (APM, logs, metrics, SLO)
- **Search** — `x-pack/solutions/search/` (enterprise search, connectors, applications)

New features in one of these areas usually live under the corresponding solution’s plugins.

## Key conventions

- **TypeScript:** Strict mode. Use `import type { ... }` for type-only imports. Prefer explicit return types on public APIs.
- **React:** Functional components and hooks. Use **EUI** components from `@elastic/eui` (e.g. `EuiButton`, `EuiFlexGroup`). Add `data-test-subj` to interactive elements for tests.
- **Server:** Route handlers with proper error handling. Use **Zod** (or Kibana’s validation pattern) for request/response validation. Register routes in the plugin’s `setup()`.
- **Testing:** Jest for unit tests; **FTR** for API and functional tests. Use `describe`/`it` with clear descriptions; inject services in FTR; use page objects and retries for UI tests.
- **i18n:** Use `i18n.translate()` and `<FormattedMessage>` for user-facing strings.

## Where does this go? (decision tree)

| If you are… | Then put it… |
|-------------|--------------|
| Adding a feature to an existing plugin | In that plugin’s `public/`, `server/`, or `common/` as appropriate |
| Creating a new plugin | New directory under `src/plugins/` or under a solution (e.g. `x-pack/plugins/` or solution folder) with `public/`, `server/`, `common/`, and `kibana.jsonc` |
| Adding code shared by multiple plugins | New or existing `@kbn/` package in `packages/` or `x-pack/packages/` |
| Adding a shared type or util used only inside one plugin | That plugin’s `common/` directory |
| Adding an HTTP API | Route handler in plugin’s `server/` and register in `setup()`; use request/response validation |
| Adding a saved object type | Define type and migrations in plugin’s `server/` (or `common/` for types); register in plugin `setup()` |
| Writing a unit test | Next to the module (e.g. `foo.test.ts`) or in `__tests__/` following existing package layout |
| Writing an API or functional test | Under `test/` (e.g. `test/api_integration/`, `test/functional/`) with the right FTR config |

## CI and PR preparation

- **CI runs:** Type check, ESLint, i18n check, unit tests, FTR (selected suites), bundle size checks.
- **Before pushing:** Run `node scripts/type_check`, `node scripts/eslint_all_files`, and the relevant test suites locally. On **draft PRs**, CI does not start automatically — comment `/ci` on the PR to trigger the pipeline. If CI pushes an auto-fix commit (e.g. eslint fix), comment `/ci` again to re-trigger.

## Cursor-specific setup

- **Rules:** `.cursor/rules/` — domain-specific rule files (e.g. `kibana-core.mdc`, `kibana-plugin-architecture.mdc`). Activate the rule sets that match your work area.
- **Skills:** `.cursor/skills/` — step-by-step skills for creating plugins, adding routes, writing tests, preparing PRs. Use the onboarding script or copy `.cursor/` from this deliverable into your Kibana repo root.

For full setup instructions, see the README in the same deliverable as this file.
