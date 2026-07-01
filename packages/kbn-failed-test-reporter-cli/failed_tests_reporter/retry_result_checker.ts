/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import { createFlagError } from '@kbn/dev-cli-errors';
import { run } from '@kbn/dev-cli-runner';
import globby from 'globby';
import normalize from 'normalize-path';

import { makeTestCaseIter, readTestReport } from './test_report';

type ResultType = 'failures' | 'passes';

export async function collectTestNames(junitDir: string, type: ResultType): Promise<Set<string>> {
  const xmlPaths = await globby(normalize(Path.resolve(junitDir, '*.xml')), { absolute: true });
  const names = new Set<string>();
  for (const xmlPath of xmlPaths) {
    const report = await readTestReport(xmlPath);
    for (const testCase of makeTestCaseIter(report)) {
      const isFailed = Boolean(testCase.failure);
      const isSkipped = Boolean(testCase.skipped);
      if (type === 'failures' ? isFailed : !isFailed && !isSkipped) {
        names.add(testCase.$.name.trim());
      }
    }
  }
  return names;
}

export function runRetryResultCheckerCli() {
  run(
    async ({ flags }) => {
      const [command] = flags._;

      if (command === 'collect-results') {
        const junitDir = flags['junit-dir'];
        const type = flags.type;

        if (typeof junitDir !== 'string' || !junitDir) {
          throw createFlagError('--junit-dir is required');
        }
        if (type !== 'failures' && type !== 'passes') {
          throw createFlagError('--type must be "failures" or "passes"');
        }

        const names = await collectTestNames(junitDir, type);
        if (names.size > 0) {
          process.stdout.write([...names].join('\n') + '\n');
        }
        return;
      }

      throw createFlagError(`Unknown command: ${command}. Valid commands: collect-results`);
    },
    {
      description: `
        Utilities for evaluating FTR retry results.

        Commands:
          collect-results --junit-dir <dir> --type failures|passes
            Prints test names (one per line) of the requested type found in *.xml
            files under <dir>. Used to capture attempt-1 failures and attempt-2
            passes for smart-retry evaluation.
      `,
      flags: {
        string: ['junit-dir', 'type'],
        help: `
          --junit-dir   Directory containing JUnit XML files
          --type        "failures" or "passes"
        `,
      },
    }
  );
}
