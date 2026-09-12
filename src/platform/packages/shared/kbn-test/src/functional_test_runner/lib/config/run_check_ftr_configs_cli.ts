/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import execa from 'execa';
import { readFileSync } from 'fs';
import Path from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import { run } from '@kbn/dev-cli-runner';
import { createFailError } from '@kbn/dev-cli-errors';

import { getAllFtrConfigsAndManifests } from './ftr_configs_manifest';

const THIS_PATH =
  'src/platform/packages/shared/kbn-test/src/functional_test_runner/lib/config/run_check_ftr_configs_cli.ts';

const IGNORED_FOLDERS = ['.buildkite/'];

const IGNORED_PATHS = [
  THIS_PATH,
  'src/platform/packages/shared/kbn-test/src/jest/run_check_jest_configs_cli.ts',
  'x-pack/solutions/observability/plugins/observability_onboarding/e2e/playwright/playwright.config.ts',
  'x-pack/solutions/security/test/cloud_security_posture_functional/config.base.ts',
  'x-pack/solutions/observability/plugins/apm/test/scenarios/agent_config.ts',
];

export async function runCheckFtrConfigsCli() {
  run(
    async ({ log }) => {
      const { ftrConfigEntries, manifestPaths } = getAllFtrConfigsAndManifests();
      const duplicateEntries = Array.from(ftrConfigEntries.entries()).filter(
        ([, paths]) => paths.length > 1
      );

      if (duplicateEntries.length > 0) {
        const errorMessage = duplicateEntries
          .map(
            ([config, paths]) =>
              `Config path: ${Path.relative(REPO_ROOT, config)}\nFound in manifests:\n${paths.join(
                '\n'
              )}`
          )
          .join('\n\n');
        throw createFailError(
          `Duplicate FTR config entries detected. Please remove the duplicates:\n\n${errorMessage}`
        );
      }

      const { stdout } = await execa('git', [
        'ls-tree',
        '--full-tree',
        '--name-only',
        '-r',
        'HEAD',
      ]);

      const files = stdout
        .trim()
        .split('\n')
        .map((file) => Path.resolve(REPO_ROOT, file));

      const loadingConfigs = [];

      const possibleConfigs = files.filter((file) => {
        if (IGNORED_PATHS.map((rel) => Path.resolve(REPO_ROOT, rel)).includes(file)) {
          return false;
        }

        if (IGNORED_FOLDERS.some((folder) => file.startsWith(Path.resolve(REPO_ROOT, folder)))) {
          return false;
        }

        // playwright config files
        if (file.match(/\/*playwright*.config.ts$/)) {
          return false;
        }

        if (!file.match(/(test|e2e).*config[^\/]*\.(t|j)s$/)) {
          return false;
        }

        if (file.match(/\/__(fixtures|tests)__\//)) {
          return false;
        }

        if (file.match(/\.test\.(t|j)s$/)) {
          return false;
        }

        if (file.match(/\/common\/config.(t|j)s$/)) {
          return false;
        }

        if (file.match(/jest(\.integration)?\.config\.(t|j)s$/)) {
          return false;
        }

        // No FTR configs in /packages/
        if (file.match(/\/packages\//)) {
          return false;
        }

        // No FTR configs in /scripts/
        if (file.match(/\/scripts\//)) {
          return false;
        }

        // No FTR configs in mock files
        if (file.match(/(mock|mocks).ts$/)) {
          return false;
        }

        const fileContent = readFileSync(file).toString();

        if (
          // explicitly define 'testRunner' or 'testFiles'
          fileContent.match(/(testRunner)|(testFiles)/) ||
          // export default createTestConfig
          fileContent.match(/export\s+default\s+createTestConfig/) ||
          // export default async function ({ readConfigFile }: FtrConfigProviderContext)
          // async function config({ readConfigFile }: FtrConfigProviderContext)
          // export default async function (ftrConfigProviderContext: FtrConfigProviderContext)
          fileContent.match(
            /(?:export\s+default\s+)?async\s+function(?:\s+\w+)?\s*\(\s*(?:\{\s*readConfigFile\s*\}|\w+)\s*(?::\s*FtrConfigProviderContext\s*)?\)/
          )
        ) {
          // test config
          return true;
        }

        if (file.match(/config.ts$/) && fileContent.match(/export\s+default\s+configs\./)) {
          return true;
        }

        if (fileContent.match(/(describe)|(defineCypressConfig)|(cy\.)/)) {
          // test file or Cypress config
          return false;
        }

        // FTR config file should have default export
        try {
          loadingConfigs.push(file);
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const exports = require(file);
          const defaultExport = exports.__esModule ? exports.default : exports;
          return !!defaultExport;
        } catch (err) {
          log.debug(`Failed to load file: ${err.message}`);
          return false;
        }
      });

      if (loadingConfigs.length) {
        log.info(`${loadingConfigs.length} files were loaded as FTR configs for validation`);
      }

      const allFtrConfigs = Array.from(ftrConfigEntries.keys());
      const invalid = possibleConfigs.filter((path) => !allFtrConfigs.includes(path));
      if (invalid.length) {
        const invalidList =
          ' - ' + invalid.map((path) => Path.relative(REPO_ROOT, path)).join('\n - ');
        log.error(
          `The following files look like FTR configs which are not listed in one of manifest files:\n${invalidList}\n
Make sure to add your new FTR config to the correct manifest file.\n
Stateful tests:\n${(manifestPaths.stateful as string[]).join('\n')}\n
Serverless tests:\n${(manifestPaths.serverless as string[]).join('\n')}
          `
        );
        throw createFailError(
          `Please add the listed paths to the correct manifest files. If it's not an FTR config, you can add it to the IGNORED_PATHS in ${THIS_PATH} or contact #kibana-operations`
        );
      }
    },
    {
      description:
        'Check that all FTR configs are listed in manifest files and there are no duplicates',
    }
  );
}
