/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { REPO_ROOT } from '@kbn/repo-info';
import path from 'node:path';

export const SCOUT_OUTPUT_ROOT = path.resolve(REPO_ROOT, '.scout');

// Servers

export const SCOUT_SERVERS_ROOT = path.resolve(SCOUT_OUTPUT_ROOT, 'servers');

// Reporting

export const SCOUT_REPORT_OUTPUT_ROOT = path.resolve(SCOUT_OUTPUT_ROOT, 'reports');
export const SCOUT_TEST_CONFIG_STATS_PATH = path.resolve(
  SCOUT_OUTPUT_ROOT,
  'test_config_stats.json'
);

// Scout definitions

export const SCOUT_PLAYWRIGHT_CONFIGS_PATH = path.resolve(
  SCOUT_OUTPUT_ROOT,
  'test_configs',
  'scout_playwright_configs.json'
);

export const PLATFORM_AND_SOLUTION_SCOUT_ROOT_PATH_GLOB =
  '{src/platform,src/core,x-pack/**}/{plugins,packages}/**/test/scout{_*,}';

export const EXAMPLE_PLUGIN_SCOUT_ROOT_PATH_GLOB = '{examples,x-pack/examples}/**/test/scout{_*,}';

export const CORE_MODULE_SCOUT_ROOT_PATH_GLOB = 'src/core/test/scout{_*,}';

export const TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB = `{${[
  PLATFORM_AND_SOLUTION_SCOUT_ROOT_PATH_GLOB,
  EXAMPLE_PLUGIN_SCOUT_ROOT_PATH_GLOB,
  CORE_MODULE_SCOUT_ROOT_PATH_GLOB,
].join(',')}}`;

export const TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX = new RegExp(
  `(?:src|x-pack)` +
    `\/(?:(platform|core)|solutions\/(\\w+))` + // 1: platform or core, 2: solution
    `\/(plugins|packages)` + // 3: plugin or package
    `\/?(shared|private|)` + // 4: artifact visibility
    `\/([\\w|-]+(?:\\/[\\w|-]+)*)` + // 5: plugin/package name (supports nested paths like vis_types/timelion)
    `\/test\/scout(?:_([^\\/]*))?` // 6: custom target config set name
);

export const SCOUT_TEST_CATEGORIES = ['api', 'ui'];

export const SCOUT_CONFIG_PATH_GLOB =
  TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB +
  `/{,*/}{${SCOUT_TEST_CATEGORIES.join(',')}}/{,*.}playwright.config.ts`;

export const SCOUT_CONFIG_PATH_REGEX = new RegExp(
  TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX.source +
    `\/(${SCOUT_TEST_CATEGORIES.join('|')})` + // 7: Scout test category
    `\/(\\w*)\\.?playwright\\.config\\.ts` // 8: Scout config type
);

export const SCOUT_CONFIG_MANIFEST_PATH_GLOB =
  TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB +
  `/{,*/}.meta/{${SCOUT_TEST_CATEGORIES.join(',')}}/*.json`;

/**
 * Playwright configs under top-level `examples/` and `x-pack/examples/` (developer example plugins).
 * `module.name` for these paths is resolved from `plugin.id` in kibana.jsonc (see test_config.fromPath).
 * Capture groups: 1=examplesRoot, 2=plugin, 3=serverConfigSet, 4=namespace (optional), 5=category, 6=configType.
 */
export const SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX = new RegExp(
  `^(examples|x-pack/examples)/([^/]+)/test/scout(?:_([^/]*))?(?:/([^/]+))?/(${SCOUT_TEST_CATEGORIES.join(
    '|'
  )})/(\\w*)\\.?playwright\\.config\\.ts$`
);

/**
 * Unified regex matching both platform/solution and example plugin Playwright config paths.
 * Uses named capture groups so callers can branch on `examplesRoot` to decide how to
 * resolve module metadata (kibana.jsonc vs directory-derived).
 */
export const SCOUT_UNIFIED_CONFIG_PATH_REGEX = new RegExp(
  `^(?:` +
    `(?<examplesRoot>examples|x-pack/examples)/(?<examplePlugin>[^/]+)` +
    `|` +
    `(?<coreRoot>src/core)` +
    `|` +
    `(?:src|x-pack)/(?:(?<platformOrCore>platform|core)|solutions/(?<solution>\\w+))` +
    `/(?<moduleKind>plugins|packages)/?(?<moduleVisibility>shared|private|)` +
    `/(?<moduleName>[\\w|-]+(?:\\/[\\w|-]+)*)` +
    `)` +
    `/test/scout(?:_(?<serverConfigSet>[^/]*))?` +
    `(?:/(?<namespace>[^/]+))?` +
    `/(?<testCategory>${SCOUT_TEST_CATEGORIES.join('|')})` +
    `/(?<testConfigType>\\w*)\\.?playwright\\.config\\.ts$`
);

// Scout CI
export const SCOUT_CI_CONFIG_PATH = path.resolve(REPO_ROOT, '.buildkite', 'scout_ci_config.yml');

// Selective testing — patterns used by the Scout selective-testing resolver.

/**
 * Documentation-only files inside Scout test scopes that should be ignored when
 * deciding whether a PR's diff is "Scout tests only". A README or markdown change
 * next to a Playwright config is noise — it must not block the fast path nor
 * schedule any Playwright config to run.
 */
export const SCOUT_TESTS_ONLY_IGNORE_PATTERNS: readonly string[] = [
  '**/README*',
  '**/*.md',
  '**/CHANGELOG*',
];

/**
 * Path globs that uniquely identify a Scout test scope — i.e. a directory
 * containing a Playwright config and its co-located tests/fixtures/helpers.
 *
 * A "scope" is `<package-root>/test/(scout|scout_<custom>)[/<namespace>]/(api|ui)`, owning at
 * most two configs:
 *   - <scope>/playwright.config.ts          (single-thread, tests under tests/)
 *   - <scope>/parallel.playwright.config.ts (parallel, tests under parallel_tests/)
 *
 * The optional `<namespace>` segment is a single-level sub-directory directly under
 * the scout root (e.g. `test/scout/detection_engine/ui/`). It enables a single
 * plugin to have multiple independent Playwright configs — one per logical team
 * namespace — while still sharing the same server configuration.
 *
 * The `.meta/(api|ui)` variant covers auto-generated manifests. For namespace configs
 * the manifest lives at `test/scout/<namespace>/.meta/(api|ui)/`.
 *
 * Both patterns derive their `(api|ui)` and `scout(_*,)` segments from
 * `SCOUT_TEST_CATEGORIES` and the same brace-expansion idiom used by
 * `SCOUT_CONFIG_MANIFEST_PATH_GLOB` so they all stay in sync.
 */
export const SCOUT_TESTS_ONLY_SCOPE_GLOBS: readonly string[] = [
  `**/test/scout{_*,}/{${SCOUT_TEST_CATEGORIES.join(',')}}/**`,
  `**/test/scout{_*,}/*/{${SCOUT_TEST_CATEGORIES.join(',')}}/**`,
  `**/test/scout{_*,}/.meta/{${SCOUT_TEST_CATEGORIES.join(',')}}/**`,
  `**/test/scout{_*,}/*/.meta/{${SCOUT_TEST_CATEGORIES.join(',')}}/**`,
];

/**
 * Captures `<prefix>/test/scout{_*}[/<namespace>]/(api|ui)/<rest?>` and its `.meta/` variant.
 * A negative lookahead prevents `.meta` from being captured as a namespace; backtracking
 * prevents `api`/`ui` from being captured as a namespace.
 *
 * Capture groups: 1=prefix, 2=scoutDir, 3=namespace (optional), 4=category (api|ui), 5=rest (optional).
 */
export const SCOUT_TEST_SCOPE_PATTERN = new RegExp(
  `^(.+?)\\/test\\/(scout(?:_[^/]+)?)(?:\\/(?!\\.meta)([^/]+))?\\/(?:\\.meta\\/)?(${SCOUT_TEST_CATEGORIES.join(
    '|'
  )})(?:\\/(.*))?$`
);

/**
 * Files whose modification invalidates Scout selective testing entirely:
 * any change here forces a full Scout suite run regardless of the diff's
 * other contents.
 */
export const CRITICAL_FILES_SCOUT: readonly string[] = [
  'package.json',
  'yarn.lock',
  'tsconfig.json',
  '.node-version',
  '.nvmrc',
  'src/setup_node_env/**/*',
  'packages/kbn-babel-preset/**/*',
  'src/platform/packages/shared/kbn-repo-info/**/*',
  'src/platform/packages/shared/kbn-scout/**/*',
  'src/platform/packages/private/kbn-scout-reporting/**/*',
  'scripts/scout.js',
  '.buildkite/scripts/steps/test/scout/**/*',
  '.buildkite/pipeline-utils/affected-packages/**/*.{ts,js,sh}',
  '.buildkite/pipeline-utils/ci-stats/**/*.{ts,js}',
];
