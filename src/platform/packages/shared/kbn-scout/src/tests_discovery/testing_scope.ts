/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import path from 'path';
import { Minimatch } from 'minimatch';
import { createFailError } from '@kbn/dev-cli-errors';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  CRITICAL_FILES_SCOUT,
  SCOUT_TESTS_ONLY_IGNORE_PATTERNS,
  SCOUT_TESTS_ONLY_SCOPE_GLOBS,
  SCOUT_TEST_SCOPE_PATTERN,
} from '@kbn/scout-info';
import type { CodeChanges } from './code_changes';

const PLAYWRIGHT_CONFIG = 'playwright.config.ts';
const PARALLEL_PLAYWRIGHT_CONFIG = 'parallel.playwright.config.ts';

// Pre-compile glob patterns once at module load; `minimatch(file, pattern, ...)`
// compiles the pattern on every call, which dominates the per-file cost when
// matching N changed files against M patterns.
const compileMatchers = (patterns: readonly string[]): readonly Minimatch[] =>
  patterns.map((p) => new Minimatch(p, { dot: true }));

const CRITICAL_FILES_MATCHERS = compileMatchers(CRITICAL_FILES_SCOUT);
const IGNORE_MATCHERS = compileMatchers(SCOUT_TESTS_ONLY_IGNORE_PATTERNS);
const SCOPE_MATCHERS = compileMatchers(SCOUT_TESTS_ONLY_SCOPE_GLOBS);

const matchesAny = (file: string, matchers: readonly Minimatch[]): boolean =>
  matchers.some((m) => m.match(file));

const filterExisting = (
  configs: readonly string[],
  repoRoot: string,
  existsCache?: Map<string, boolean>
): string[] =>
  configs.filter((rel) => {
    const cached = existsCache?.get(rel);
    if (cached !== undefined) return cached;
    const exists = fs.existsSync(path.join(repoRoot, rel));
    existsCache?.set(rel, exists);
    return exists;
  });

/**
 * Returns true when at least one changed file matches the Scout critical-files list.
 * A critical-files hit forces a full Scout suite run (selective testing skipped).
 */
export const criticalScoutFilesTouched = (changedFiles: readonly string[]): boolean =>
  changedFiles.some((file) => matchesAny(file, CRITICAL_FILES_MATCHERS));

/**
 * Returns true when, after dropping noise files (READMEs, markdown, changelogs),
 * every remaining changed file lives inside a Scout test scope. Empty diffs
 * (or noise-only diffs) return false — there is nothing to fast-path.
 */
export const isScoutTestsOnlyDiff = (changedFiles: readonly string[]): boolean => {
  let sawMeaningful = false;
  for (const file of changedFiles) {
    if (matchesAny(file, IGNORE_MATCHERS)) continue;
    sawMeaningful = true;
    if (!matchesAny(file, SCOPE_MATCHERS)) return false;
  }
  return sawMeaningful;
};

/**
 * Map a single changed file path to the Playwright config(s) that own it.
 *
 * Returns 0–2 repo-relative config paths:
 *   - 0 when the file is outside any Scout scope
 *   - 1 when the file is under `tests/` or `parallel_tests/` (single owning config)
 *   - 1–2 for shared scope files (fixtures, helpers, page objects, .meta/, the
 *     config file itself) filtered against `repoRoot` to drop configs that
 *     don't exist on disk.
 *
 * The resolver never crosses ui ↔ api or scout ↔ scout_<custom> scopes.
 */
export const deriveScoutConfigsForFile = (
  file: string,
  repoRoot: string,
  existsCache?: Map<string, boolean>
): string[] => {
  const match = file.match(SCOUT_TEST_SCOPE_PATTERN);
  if (!match) {
    return [];
  }

  const [, prefix, scoutDir, namespace, type, rest = ''] = match;
  const scope = namespace
    ? `${prefix}/test/${scoutDir}/${namespace}/${type}`
    : `${prefix}/test/${scoutDir}/${type}`;

  if (rest.startsWith('tests/')) {
    return filterExisting([`${scope}/${PLAYWRIGHT_CONFIG}`], repoRoot, existsCache);
  }

  if (rest.startsWith('parallel_tests/')) {
    return filterExisting([`${scope}/${PARALLEL_PLAYWRIGHT_CONFIG}`], repoRoot, existsCache);
  }

  // Shared scope file (fixtures/, helpers, constants, page_objects/, .meta/, ...)
  // or the playwright config itself: map to whichever configs exist in the scope.
  return filterExisting(
    [`${scope}/${PLAYWRIGHT_CONFIG}`, `${scope}/${PARALLEL_PLAYWRIGHT_CONFIG}`],
    repoRoot,
    existsCache
  );
};

/**
 * Map a list of changed files to the union of owning Playwright configs.
 * Used as the affected-configs filter in `discover-playwright-configs` and
 * `create-test-tracks`.
 */
export const deriveScoutConfigsForFiles = (
  files: readonly string[],
  repoRoot: string
): Set<string> => {
  // Many changed files typically share the same scope (e.g. multiple spec
  // edits in one plugin). Memoise existence checks across the whole batch so
  // we don't re-stat the same playwright.config.ts once per file.
  const existsCache = new Map<string, boolean>();
  const configs = new Set<string>();
  for (const file of files) {
    for (const config of deriveScoutConfigsForFile(file, repoRoot, existsCache)) {
      configs.add(config);
    }
  }
  return configs;
};

/**
 * Outcome of the Scout selective-testing decision. Consumers
 * (`discover-playwright-configs`, `create-test-tracks`) dispatch on `kind` to
 * apply the matching filter to their own test items.
 *
 *   - 'full'             : run everything (selective testing disabled, or the
 *                          diff touches a critical Scout file).
 *   - 'tests-only'       : run only the Playwright configs whose owning scope
 *                          contains a changed file. `affectedConfigPaths` is
 *                          repo-relative.
 *   - 'dependency-tree'  : run configs whose owning @kbn/ module appears in
 *                          `affectedModuleIds` (graph-traversal mode).
 */
export type ScoutTestingScope =
  | { kind: 'full'; reason: 'selective-disabled' | 'critical-files' }
  | { kind: 'tests-only'; affectedConfigPaths: ReadonlySet<string> }
  | { kind: 'dependency-tree'; affectedModuleIds: ReadonlySet<string> };

/**
 * Decide which Scout testing scope to apply for a given diff.
 *
 * Decision tree (only when `selectiveTesting` is true and `codeChanges` is set):
 *   1. Critical Scout files touched      -> { kind: 'full', reason: 'critical-files' }
 *   2. Diff is exclusively Scout tests   -> { kind: 'tests-only', affectedConfigPaths }
 *   3. Otherwise                         -> { kind: 'dependency-tree', affectedModuleIds }
 *
 * When selective testing is disabled OR no code-changes file was provided, the
 * scope is `{ kind: 'full', reason: 'selective-disabled' }`. Per-item `isAffected`
 * marking is NOT part of the scope — consumers derive it from
 * `codeChanges.affectedModules` independently.
 */
export const resolveScoutTestingScope = (
  codeChanges: CodeChanges | null,
  selectiveTesting: boolean,
  log: ToolingLog,
  repoRoot: string = REPO_ROOT
): ScoutTestingScope => {
  if (!selectiveTesting || !codeChanges) {
    return { kind: 'full', reason: 'selective-disabled' };
  }

  if (criticalScoutFilesTouched(codeChanges.changedFiles)) {
    log.warning('Selective testing: critical Scout files touched — running full Scout suite');
    return { kind: 'full', reason: 'critical-files' };
  }

  if (isScoutTestsOnlyDiff(codeChanges.changedFiles)) {
    const affectedConfigPaths = deriveScoutConfigsForFiles(codeChanges.changedFiles, repoRoot);
    log.info(
      `Selective testing: tests-only fast path — ${affectedConfigPaths.size} affected Playwright config(s)`
    );
    return { kind: 'tests-only', affectedConfigPaths };
  }

  const affectedModuleIds: ReadonlySet<string> = new Set(codeChanges.affectedModules);
  log.info(
    `Selective testing: dependency-tree mode — ${affectedModuleIds.size} affected module(s)`
  );
  return { kind: 'dependency-tree', affectedModuleIds };
};

/**
 * JSON shape produced by `scout resolve-testing-scope` and read by every
 * downstream step (configs CLI, lanes CLI).
 *
 * Field semantics:
 *   - `kind` / `reason` : the decision (mirrors ScoutTestingScope).
 *   - `affectedModules` : ALWAYS present (sorted, possibly empty). Used both as
 *                         the dependency-tree filter set AND for generic
 *                         "isAffected" labeling regardless of kind.
 *   - `affectedConfigs` : present only when `kind === 'tests-only'`; the exact
 *                         set of Playwright configs to run.
 */
export interface SerializedScoutTestingScope {
  kind: ScoutTestingScope['kind'];
  reason?: 'selective-disabled' | 'critical-files';
  affectedModules: readonly string[];
  affectedConfigs?: readonly string[];
}

/**
 * Convert a `ScoutTestingScope` into the JSON shape shared across pipeline
 * steps. `affectedModules` is always included (even for `full` / `tests-only`
 * scopes) so consumers can label items as "affected" regardless of kind.
 */
export const serializeScoutTestingScope = (
  scope: ScoutTestingScope,
  affectedModules: ReadonlySet<string>
): SerializedScoutTestingScope => {
  const sortedModules = Array.from(affectedModules).sort();
  switch (scope.kind) {
    case 'full':
      return {
        kind: 'full',
        reason: scope.reason,
        affectedModules: sortedModules,
      };
    case 'tests-only':
      return {
        kind: 'tests-only',
        affectedModules: sortedModules,
        affectedConfigs: Array.from(scope.affectedConfigPaths).sort(),
      };
    case 'dependency-tree':
      // By contract `scope.affectedModuleIds === affectedModules` in this
      // branch (set by `resolveScoutTestingScope`), so reuse the pre-sorted
      // array instead of allocating + sorting a fresh copy.
      return {
        kind: 'dependency-tree',
        affectedModules: sortedModules,
      };
  }
};

/**
 * Write the serialised scope to `outputPath`, creating the parent directory
 * if needed. Called by `scout resolve-testing-scope`.
 */
export const writeScoutTestingScope = (
  scope: ScoutTestingScope,
  affectedModules: ReadonlySet<string>,
  outputPath: string
): void => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(serializeScoutTestingScope(scope, affectedModules), null, 2)}\n`
  );
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isSerializedScoutTestingScope = (value: unknown): value is SerializedScoutTestingScope => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'full' &&
    candidate.kind !== 'tests-only' &&
    candidate.kind !== 'dependency-tree'
  ) {
    return false;
  }
  if (!isStringArray(candidate.affectedModules)) return false;
  if (candidate.affectedConfigs !== undefined && !isStringArray(candidate.affectedConfigs)) {
    return false;
  }
  return true;
};

/**
 * Read and validate a testing-scope JSON file produced by `scout
 * resolve-testing-scope`. Throws on missing/invalid input — downstream
 * consumers must not silently fall back to a wrong mode.
 */
export const readScoutTestingScope = (filePath: string): SerializedScoutTestingScope => {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createFailError(`Failed to read testing-scope file '${filePath}': ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createFailError(`Testing-scope file is not valid JSON ('${filePath}'): ${message}`);
  }

  if (!isSerializedScoutTestingScope(parsed)) {
    throw createFailError(
      `Testing-scope file '${filePath}' must contain { kind: 'full'|'tests-only'|'dependency-tree', affectedModules: string[], affectedConfigs?: string[] }`
    );
  }

  return parsed;
};
