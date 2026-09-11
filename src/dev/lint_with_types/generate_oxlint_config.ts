/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Minimatch } from 'minimatch';

import {
  BASE_RULES,
  NO_FLOATING_PROMISES_RULE,
  NO_FLOATING_PROMISES_GLOBS,
  NO_FLOATING_PROMISES_EXEMPT_GLOBS,
} from './rules';

export interface LintProject {
  /** repo-relative directory containing the tsconfig.json, `.` for the repo root */
  repoRelDir: string;
  /** tsconfig `include` entries, relative to `repoRelDir` */
  include: readonly string[];
  /** tsconfig `exclude` entries, relative to `repoRelDir` */
  exclude: readonly string[];
}

export interface OxlintOverride {
  files: string[];
  rules: Record<string, unknown>;
}

export interface OxlintConfig {
  $schema: string;
  plugins: string[];
  categories: Record<string, 'off'>;
  options: { typeAware: true };
  rules: Record<string, unknown>;
  overrides: OxlintOverride[];
  ignorePatterns: string[];
}

const NO_FLOATING_PROMISES = 'typescript/no-floating-promises';

/** oxlint has no `--ext`; everything but .ts/.tsx is excluded so only TS sources are linted */
const NON_TS_IGNORE_PATTERNS = ['**/*.{js,jsx,mjs,cjs,mts,cts,json,vue,svelte,astro}'];

// Mirror tsc's `skipLibCheck: true`: oxlint's parser reports TypeScript grammar errors (e.g.
// TS1016) that ESLint's parser does not, and declaration files are never type-checked either.
const DECLARATION_IGNORE_PATTERNS = ['**/*.d.ts'];

const HAS_MAGIC = /[*?[{]/;
const compile = (glob: string) => new Minimatch(glob, { dot: true });

/**
 * A tsconfig `include` entry as ESLint interpreted it when passed as a CLI
 * argument: a glob if it contains glob characters, otherwise a file or a
 * directory whose contents are all linted.
 */
const includeMatcher = (include: string): ((rel: string) => boolean) => {
  if (include.startsWith('../')) {
    // files outside the project directory can never match a project-relative rule glob
    return () => false;
  }
  if (HAS_MAGIC.test(include)) {
    const mm = compile(include);
    return (rel) => mm.match(rel);
  }
  const dir = include.replace(/\/$/, '');
  return (rel) => rel === dir || rel.startsWith(`${dir}/`);
};

/**
 * A tsconfig `exclude` entry as ESLint interpreted it via `--ignore-pattern`:
 * gitignore semantics, so a pattern without a slash matches at any depth.
 */
const excludeMatcher = (exclude: string): ((rel: string) => boolean) => {
  if (exclude.includes('/')) {
    const mm = compile(exclude);
    return (rel) => mm.match(rel);
  }
  const file = compile(`**/${exclude}`);
  const dir = compile(`**/${exclude}/**`);
  return (rel) => file.match(rel) || dir.match(rel);
};

const RULE_GLOBS = NO_FLOATING_PROMISES_GLOBS.map((glob) => ({ glob, mm: compile(glob) }));
const EXEMPT_GLOBS = NO_FLOATING_PROMISES_EXEMPT_GLOBS.map((glob) => ({ glob, mm: compile(glob) }));

const depth = (repoRelDir: string) => (repoRelDir === '.' ? 0 : repoRelDir.split('/').length);

/** index of the first element >= prefix in a sorted array */
const lowerBound = (sorted: readonly string[], prefix: string) => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sorted[mid] < prefix) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
};

/**
 * Builds a repo-root oxlint config equivalent to running ESLint once per TS
 * project with the project-relative `no-floating-promises` globs.
 *
 * Under ESLint a file is checked by a project P iff P's `include` covers it and
 * P's `exclude` does not, and the rule applies iff a rule glob matches the path
 * relative to P. oxlint's `overrides` are root-relative and last-match-wins, so
 * one block pair is emitted per project, parents before children:
 * `<P>/<glob>` → error, then `<P>/<exclude>` and nested projects P does not
 * cover → off. Deeper projects follow and win for the files they own.
 */
export function generateOxlintConfig(
  projects: readonly LintProject[],
  repoRelFiles: readonly string[]
): OxlintConfig {
  const files = [...repoRelFiles].sort();
  const sortedProjects = [...projects].sort(
    (a, b) => depth(a.repoRelDir) - depth(b.repoRelDir) || a.repoRelDir.localeCompare(b.repoRelDir)
  );
  const projectDirs = sortedProjects.map((p) => p.repoRelDir);

  const overrides: OxlintOverride[] = [];
  const covered = new Set<string>();

  for (const project of sortedProjects) {
    const prefix = project.repoRelDir === '.' ? '' : `${project.repoRelDir}/`;
    const included = project.include.map(includeMatcher);
    const excluded = project.exclude.map(excludeMatcher);

    const on = new Set<string>();
    const off = new Set<string>();
    const coveredDirs = new Set<string>();

    for (let i = lowerBound(files, prefix); i < files.length; i++) {
      const file = files[i];
      if (!file.startsWith(prefix)) {
        break;
      }
      const rel = file.slice(prefix.length);
      if (!included.some((m) => m(rel)) || excluded.some((m) => m(rel))) {
        continue;
      }
      covered.add(file);
      coveredDirs.add(
        rel.includes('/') ? prefix + rel.slice(0, rel.lastIndexOf('/')) : prefix.slice(0, -1)
      );
      for (const { glob, mm } of RULE_GLOBS) {
        if (mm.match(rel)) {
          on.add(prefix + glob);
        }
      }
      for (const { glob, mm } of EXEMPT_GLOBS) {
        if (mm.match(rel)) {
          off.add(prefix + glob);
        }
      }
    }

    if (!on.size) {
      continue;
    }

    overrides.push({
      files: [...on].sort(),
      rules: { [NO_FLOATING_PROMISES]: NO_FLOATING_PROMISES_RULE },
    });

    const uncoveredNested = projectDirs
      .filter(
        (dir) =>
          dir !== project.repoRelDir &&
          dir.startsWith(prefix) &&
          ![...coveredDirs].some((d) => d === dir || d.startsWith(`${dir}/`))
      )
      .map((dir) => `${dir}/**/*`);

    const offFiles = [...off, ...project.exclude.map((g) => prefix + g), ...uncoveredNested].sort();
    if (offFiles.length) {
      overrides.push({ files: offFiles, rules: { [NO_FLOATING_PROMISES]: 'off' } });
    }
  }

  return {
    $schema: './node_modules/oxlint/configuration_schema.json',
    plugins: ['typescript'],
    categories: { correctness: 'off' },
    options: { typeAware: true },
    rules: { ...BASE_RULES },
    overrides,
    ignorePatterns: [
      ...NON_TS_IGNORE_PATTERNS,
      ...DECLARATION_IGNORE_PATTERNS,
      // files no active project covers were never linted by the per-project ESLint run
      ...files.filter((file) => !covered.has(file)),
    ],
  };
}
