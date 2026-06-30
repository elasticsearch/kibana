/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import { v4 as uuidV4 } from 'uuid';
import { REPO_ROOT } from '@kbn/repo-info';
import type { FlagsReader, FlagOptions } from '@kbn/dev-cli-runner';
import { createFlagError } from '@kbn/dev-cli-errors';

import { EsVersion } from '../../functional_test_runner';

export type RunTestsOptions = ReturnType<typeof parseFlags>;

export const FLAG_OPTIONS: FlagOptions = {
  boolean: ['bail', 'logToFile', 'dry-run', 'updateBaselines', 'updateSnapshots', 'updateAll'],
  string: [
    'config',
    'journey',
    'esFrom',
    'esServerlessImage',
    'kibana-install-dir',
    'grep',
    'include-tag',
    'exclude-tag',
    'include',
    'exclude',
    'writeLogsToPath',
    'retry',
  ],
  alias: {
    updateAll: 'u',
  },
  default: {
    retry: '0',
  },
  help: `
    --config             Define a FTR config that should be executed. Can be specified multiple times
    --journey            Define a Journey that should be executed. Can be specified multiple times
    --esFrom             Build Elasticsearch from source or run snapshot or serverless. Default: $TEST_ES_FROM or "snapshot"
    --esServerlessImage  When 'esFrom' is "serverless", this argument will be interpreted either as a tag within the ES Serverless repo, OR a full docker image path.
    --include-tag        Tags that suites must include to be run, can be included multiple times
    --exclude-tag        Tags that suites must NOT include to be run, can be included multiple times
    --include            Files that must included to be run, can be included multiple times
    --exclude            Files that must NOT be included to be run, can be included multiple times
    --grep               Pattern to select which tests to run
    --kibana-install-dir Run Kibana from existing install directory instead of from source
    --bail               Stop the test run at the first failure
    --retry              Retry failed test files N times after the initial run, cannot be used with --bail
    --logToFile          Write the log output from Kibana/ES to files instead of to stdout
    --writeLogsToPath    Write the log output from Kibana/ES to files in specified path
    --dry-run            Report tests without executing them
    --updateBaselines    Replace baseline screenshots with whatever is generated from the test
    --updateSnapshots    Replace inline and file snapshots with whatever is generated from the test
    --updateAll, -u      Replace both baseline screenshots and snapshots
  `,
  examples: `
Run the latest verified, kibana-compatible ES Serverless image:
  node scripts/functional_tests --config ./config.ts --esFrom serverless --esServerlessImage docker.elastic.co/kibana-ci/elasticsearch-serverless:latest-verified

Run with a specific ES Serverless tag from the docker.elastic.co/elasticsearch-ci/elasticsearch-serverless repo:
  node scripts/functional_tests --config ./config.ts --esFrom serverless --esServerlessImage git-fec36430fba2
  `,
};

export function parseFlags(flags: FlagsReader) {
  const configs = [
    ...(flags.arrayOfPaths('config') ?? []),
    ...(flags.arrayOfPaths('journey') ?? []),
  ];

  if (!configs.length) {
    throw createFlagError('At least one --config or --journey flag is required');
  }

  const esVersionString = flags.string('es-version');

  const logsDir = flags.path('writeLogsToPath')
    ? Path.resolve(REPO_ROOT, flags.path('writeLogsToPath')!)
    : flags.boolean('logToFile')
    ? Path.resolve(REPO_ROOT, 'data/ftr_servers_logs', uuidV4())
    : undefined;

  const bail = flags.boolean('bail');
  const retry = flags.requiredNumber('retry');
  if (bail && retry) {
    throw createFlagError('--retry cannot be used with --bail');
  }

  return {
    configs,
    esVersion: esVersionString ? new EsVersion(esVersionString) : EsVersion.getDefault(),
    bail,
    retry,
    dryRun: flags.boolean('dry-run'),
    updateBaselines: flags.boolean('updateBaselines') || flags.boolean('updateAll'),
    updateSnapshots: flags.boolean('updateSnapshots') || flags.boolean('updateAll'),
    logsDir,
    esFrom: flags.enum('esFrom', ['snapshot', 'source', 'serverless']),
    esServerlessImage: flags.string('esServerlessImage'),
    installDir: flags.path('kibana-install-dir'),
    grep: flags.string('grep'),
    suiteTags: {
      include: flags.arrayOfStrings('include-tag') ?? [],
      exclude: flags.arrayOfStrings('exclude-tag') ?? [],
    },
    suiteFilters: {
      include: flags.arrayOfPaths('include') ?? [],
      exclude: flags.arrayOfPaths('exclude') ?? [],
    },
  };
}
