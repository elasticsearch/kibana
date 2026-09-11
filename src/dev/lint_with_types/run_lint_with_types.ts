/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fs from 'fs';

import execa from 'execa';
import { run } from '@kbn/dev-cli-runner';
import { createFailError } from '@kbn/dev-cli-errors';
import { REPO_ROOT } from '@kbn/repo-info';
import { getRepoRels } from '@kbn/repo-packages';
import { TS_PROJECTS } from '@kbn/ts-projects';

import { generateOxlintConfig } from './generate_oxlint_config';

/**
 * Written to the repo root because oxlint resolves override globs relative to
 * the config file. Deleted once linting finishes.
 */
const CONFIG_PATH = Path.resolve(REPO_ROOT, '.oxlintrc.with_types.json');

export function runLintWithTypes() {
  run(
    async ({ log, flags }) => {
      const projectFilter =
        flags.project && typeof flags.project === 'string'
          ? Path.resolve(flags.project)
          : undefined;

      const projects = TS_PROJECTS.filter((project) => {
        if (project.isTypeCheckDisabled()) {
          log.verbose(`[${project.name}] skipping project with type checking disabled`);
          return false;
        }
        return true;
      });

      const target = projectFilter && projects.find((project) => project.path === projectFilter);
      if (projectFilter && !target) {
        throw createFailError(`[${projectFilter}] is not a valid tsconfig project`);
      }

      const files = await getRepoRels(REPO_ROOT, ['*.ts', '*.tsx']);
      const config = generateOxlintConfig(
        projects.map((project) => ({
          repoRelDir: project.repoRelDir,
          include: project.config.include ?? [],
          exclude: project.config.exclude ?? [],
        })),
        Array.from(files)
      );
      Fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      log.info(
        `Linting ${target ? target.name : `${projects.length} projects`} with ${
          config.overrides.length
        } rule scopes`
      );

      try {
        const proc = await execa(
          'oxlint',
          [
            '--type-aware',
            ...['--config', Path.relative(REPO_ROOT, CONFIG_PATH)],
            '--disable-nested-config',
            ...['--ignore-path', '.eslintignore'],
            ...(flags.fix ? ['--fix'] : []),
            target ? Path.relative(REPO_ROOT, target.directory) : '.',
          ],
          {
            cwd: REPO_ROOT,
            preferLocal: true,
            localDir: REPO_ROOT,
            stdio: 'inherit',
            reject: false,
          }
        );

        if (proc.exitCode !== 0) {
          throw createFailError(
            `Type-aware linting failed, run the following command locally to try auto-fixing it:\n\n` +
              `    node scripts/lint_with_types --fix${
                target ? ` --project ${target.repoRel}` : ''
              }`
          );
        }
      } finally {
        Fs.rmSync(CONFIG_PATH, { force: true });
      }

      log.success(`All projects validated successfully!`);
      if (flags.fix) {
        log.info(`
❗️ After staging your changes, don't forget to run eslint/prettier on them with:

    node scripts/precommit_hook --fix
`);
      }
    },
    {
      description:
        'Run oxlint type-aware rules (tsgolint) across every TS project, scoping rules per project like the previous per-project ESLint run',
      flags: {
        string: ['project'],
        boolean: ['fix'],
        help: `
          --project          Only lint a specific ts project (path to its tsconfig.json)
          --fix              Apply auto-fixes
        `,
      },
    }
  );
}
