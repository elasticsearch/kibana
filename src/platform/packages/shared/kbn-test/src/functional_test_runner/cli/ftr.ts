/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import { inspect } from 'util';

import { run } from '@kbn/dev-cli-runner';
import { createFlagError } from '@kbn/dev-cli-errors';
import { ToolingLog } from '@kbn/tooling-log';
import { getTimeReporter } from '@kbn/ci-stats-reporter';
import exitHook from 'exit-hook';

import { readConfigFile, EsVersion } from '../lib';
import { FunctionalTestRunner } from '../functional_test_runner';
import { applyFipsOverrides, fipsIsEnabled } from '../../functional_tests/lib/fips';

export function runFtrCli() {
  const runStartTime = Date.now();
  const toolingLog = new ToolingLog({
    level: 'info',
    writeTo: process.stdout,
  });
  const reportTime = getTimeReporter(toolingLog, 'scripts/functional_test_runner');
  run(
    async ({ flagsReader, log }) => {
      const esVersionInput = flagsReader.string('es-version');

      const configPaths = [
        ...(flagsReader.arrayOfStrings('config') ?? []),
        ...(flagsReader.arrayOfStrings('journey') ?? []),
      ].map((rel) => Path.resolve(rel));
      if (configPaths.length !== 1) {
        throw createFlagError(`Expected there to be exactly one --config/--journey flag`);
      }

      const bail = flagsReader.boolean('bail');
      const retry = flagsReader.requiredNumber('retry');
      if (bail && retry) {
        throw createFlagError('--retry cannot be used with --bail');
      }

      const esVersion = esVersionInput ? new EsVersion(esVersionInput) : EsVersion.getDefault();
      const settingOverrides = {
        mochaOpts: {
          bail,
          dryRun: flagsReader.boolean('dry-run'),
          grep: flagsReader.string('grep'),
          invert: flagsReader.boolean('invert'),
        },
        kbnTestServer: {
          installDir: flagsReader.path('kibana-install-dir'),
        },
        suiteFiles: {
          include: flagsReader.arrayOfPaths('include') ?? [],
          exclude: flagsReader.arrayOfPaths('exclude') ?? [],
        },
        suiteTags: {
          include: flagsReader.arrayOfStrings('include-tag') ?? [],
          exclude: flagsReader.arrayOfStrings('exclude-tag') ?? [],
        },
        updateBaselines: flagsReader.boolean('updateBaselines') || flagsReader.boolean('u'),
        updateSnapshots: flagsReader.boolean('updateSnapshots') || flagsReader.boolean('u'),
      };

      const config = await readConfigFile(
        log,
        esVersion,
        configPaths[0],
        settingOverrides,
        fipsIsEnabled() ? applyFipsOverrides : undefined
      );

      const functionalTestRunner = new FunctionalTestRunner(log, config, esVersion);

      if (flagsReader.boolean('throttle')) {
        process.env.TEST_THROTTLE_NETWORK = '1';
      }

      if (flagsReader.boolean('headless')) {
        process.env.TEST_BROWSER_HEADLESS = '1';
      }

      let teardownRun = false;
      const teardown = async (err?: Error) => {
        if (teardownRun) return;

        teardownRun = true;
        if (err) {
          await reportTime(runStartTime, 'total', {
            success: false,
            err: err.message,
            ...Object.fromEntries(flagsReader.getUsed().entries()),
          });
          log.indent(-log.getIndent());
          log.error(err);
          process.exitCode = 1;
        } else {
          await reportTime(runStartTime, 'total', {
            success: true,
            ...Object.fromEntries(flagsReader.getUsed().entries()),
          });
        }

        process.exit();
      };

      process.on('unhandledRejection', (err) =>
        teardown(
          err instanceof Error ? err : new Error(`non-Error type rejection value: ${inspect(err)}`)
        )
      );
      exitHook(teardown);

      try {
        if (flagsReader.boolean('test-stats')) {
          process.stderr.write(
            JSON.stringify(await functionalTestRunner.getTestStats(), null, 2) + '\n'
          );
        } else {
          const failureCount = await functionalTestRunner.run(undefined, retry);
          process.exitCode = failureCount ? 1 : 0;
        }
      } catch (err) {
        await teardown(err);
      } finally {
        await teardown();
      }
    },
    {
      log: {
        defaultLevel: 'debug',
      },
      flags: {
        string: [
          'config',
          'journey',
          'grep',
          'include',
          'exclude',
          'include-tag',
          'exclude-tag',
          'kibana-install-dir',
          'es-version',
          'retry',
        ],
        boolean: [
          'bail',
          'invert',
          'test-stats',
          'updateBaselines',
          'updateSnapshots',
          'u',
          'throttle',
          'headless',
          'dry-run',
          'pauseOnError',
        ],
        default: {
          retry: '0',
        },
        help: `
          --config=path      path to a config file (either this or --journey is required)
          --journey=path     path to a journey file (either this or --config is required)
          --bail             stop tests after the first failure
          --grep <pattern>   pattern used to select which tests to run
          --invert           invert grep to exclude tests
          --es-version       the elasticsearch version, formatted as "x.y.z"
          --include=file     a test file to be included, pass multiple times for multiple files
          --exclude=file     a test file to be excluded, pass multiple times for multiple files
          --include-tag=tag  a tag to be included, pass multiple times for multiple tags. Only
                               suites which have one of the passed include-tag tags will be executed.
                               When combined with the --exclude-tag flag both conditions must be met
                               for a suite to run.
          --exclude-tag=tag  a tag to be excluded, pass multiple times for multiple tags. Any suite
                               which has any of the exclude-tags will be excluded. When combined with
                               the --include-tag flag both conditions must be met for a suite to run.
          --test-stats       print the number of tests (included and excluded) to STDERR
          --updateBaselines  replace baseline screenshots with whatever is generated from the test
          --updateSnapshots  replace inline and file snapshots with whatever is generated from the test
          -u                 replace both baseline screenshots and snapshots
          --kibana-install-dir  directory where the Kibana install being tested resides
          --throttle         enable network throttling in Chrome browser
          --headless         run browser in headless mode
          --dry-run          report tests without executing them
          --pauseOnError     pause test runner on error
          --retry            retry failed test files N times after the initial run, cannot be used with --bail
        `,
      },
    }
  );
}
