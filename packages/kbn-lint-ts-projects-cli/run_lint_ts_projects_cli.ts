/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import { run } from '@kbn/dev-cli-runner';
import { createFailError } from '@kbn/dev-cli-errors';
import type { RepoPath } from '@kbn/repo-path';
import { getRepoFiles } from '@kbn/get-repo-files';
import type { SomeDevLog } from '@kbn/some-dev-log';
import { PackageFileMap, TsProjectFileMap } from '@kbn/repo-file-maps';
import { getPackages } from '@kbn/repo-packages';
import { REPO_ROOT } from '@kbn/repo-info';
import type { TsProject } from '@kbn/ts-projects';
import { TS_PROJECTS } from '@kbn/ts-projects';
import { runLintRules, TsProjectLintTarget } from '@kbn/repo-linter';

import { RULES } from './rules';

// Resolve a single user input (package id/name, or a path to a package or directory)
// to every ts project it refers to. A directory input matches that project and all
// projects nested under it, so passing a parent path lints everything beneath it.
function resolveTargets(input: string, allTargets: TsProjectLintTarget[]) {
  const abs = Path.resolve(input);

  const matches = allTargets.filter(
    ({ tsProject }) =>
      tsProject.name === input ||
      tsProject.repoRel === input ||
      tsProject.repoRelDir === input ||
      tsProject.path === abs ||
      tsProject.directory === abs ||
      tsProject.directory.startsWith(abs + '/') ||
      tsProject.pkg?.normalizedRepoRelativeDir === input ||
      tsProject.pkg?.directory === abs
  );
  if (matches.length) {
    return matches;
  }

  // Fallback: input points inside a project (e.g. a file path) but isn't itself a
  // project root — lint the closest enclosing project.
  const enclosing = allTargets
    .filter(({ tsProject }) => abs.startsWith(tsProject.directory + '/'))
    .sort((a, b) => b.tsProject.directory.length - a.tsProject.directory.length);

  return enclosing.length ? [enclosing[0]] : [];
}

function validateProjectOwnership(
  allTargets: TsProjectLintTarget[],
  allFiles: Iterable<RepoPath>,
  fileMap: TsProjectFileMap,
  log: SomeDevLog
) {
  let failed = false;

  const isInMultipleTsProjects = new Map<string, Set<TsProject>>();
  const pathsToTsProject = new Map<string, TsProject>();
  for (const proj of allTargets) {
    for (const path of fileMap.getFiles(proj.tsProject)) {
      const existing = pathsToTsProject.get(path.repoRel);
      if (!existing) {
        pathsToTsProject.set(path.repoRel, proj.tsProject);
        continue;
      }

      if (path.isTypeScriptAmbient()) {
        continue;
      }

      const multi = isInMultipleTsProjects.get(path.repoRel);
      if (multi) {
        multi.add(proj.tsProject);
      } else {
        isInMultipleTsProjects.set(path.repoRel, new Set([existing, proj.tsProject]));
      }
    }
  }

  if (isInMultipleTsProjects.size) {
    failed = true;
    const details = Array.from(isInMultipleTsProjects)
      .map(
        ([repoRel, list]) =>
          ` - ${repoRel}:\n${Array.from(list)
            .map((p) => `   - ${p.repoRel}`)
            .join('\n')}`
      )
      .join('\n');

    log.error(
      `The following files belong to multiple tsconfig.json files listed in packages/kbn-ts-projects/projects.ts\n${details}`
    );
  }

  const isNotInTsProject: RepoPath[] = [];
  for (const path of allFiles) {
    if (!path.isTypeScript()) {
      continue;
    }

    const proj = pathsToTsProject.get(path.repoRel);
    if (proj === undefined && !path.repoRel.includes('__fixtures__')) {
      isNotInTsProject.push(path);
    }
  }

  if (isNotInTsProject.length) {
    failed = true;
    log.error(
      `The following files do not belong to a tsconfig.json file\n${isNotInTsProject
        .map((file) => ` - ${file.repoRel}`)
        .join('\n')}`
    );
  }

  return failed;
}

run(
  async ({ log, flagsReader }) => {
    const filter = flagsReader.getPositionals();
    const packages = getPackages(REPO_ROOT);
    const allTargets = Array.from(TS_PROJECTS, (p) => new TsProjectLintTarget(p));

    const toLint = Array.from(
      new Set(
        !filter.length
          ? allTargets
          : filter.flatMap((input) => {
              const targets = resolveTargets(input, allTargets);

              if (!targets.length) {
                throw createFailError(
                  `unable to find a package matching [${input}]. Supply either a package id/name or path to a package`
                );
              }

              return targets;
            })
      )
    ).sort((a, b) => a.repoRel.localeCompare(b.repoRel));

    const skipRefs =
      flagsReader.boolean('refs-check') === false || flagsReader.boolean('no-refs-check') === true;

    const allFiles = await getRepoFiles();
    const fileMap = new TsProjectFileMap(new PackageFileMap(packages, allFiles), TS_PROJECTS);
    const { lintingErrorCount } = await runLintRules(
      log,
      toLint,
      RULES.filter((r) => r.name !== 'referenceUsedPkgs' || skipRefs === false),
      {
        fix: flagsReader.boolean('fix'),
        getFiles: (target) => fileMap.getFiles(target.tsProject),
      }
    );

    const failed =
      lintingErrorCount > 0 ||
      (filter.length > 0 ? false : validateProjectOwnership(allTargets, allFiles, fileMap, log));

    if (failed) {
      throw createFailError('see above errors');
    } else {
      log.success('All TS projects linted successfully');
    }
  },
  {
    usage: `node scripts/lint_ts_projects [...packages]`,
    flags: {
      boolean: ['fix', 'refs-check', 'no-refs-check'],
      alias: { f: 'fix', R: 'no-refs-check' },
      default: { 'refs-check': true },
      help: `
        --no-lint          Disables linting rules, only validating that every file is a member of just one project
        --fix              Automatically fix some issues in tsconfig.json files
        -R, --no-refs-check  Disables the reference checking rules, making the linting much faster, but less accruate
      `,
    },
    description:
      'Validate packages using a set of rules that evolve over time. The vast majority of violations can be auto-fixed, so running with `--fix` is recommended.',
  }
);
