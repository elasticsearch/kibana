/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '@kbn/dev-cli-runner';
import { createFailError } from '@kbn/dev-cli-errors';
import {
  readValidationRunFlags,
  resolveValidationBaseContext,
  type ValidationBaseContext,
  VALIDATION_RUN_HELP,
  VALIDATION_RUN_STRING_FLAGS,
} from '@kbn/dev-validation-runner';
import type { ToolingLog } from '@kbn/tooling-log';

import { resolveLintTargets } from '../lint_targets';
import { LINT_LABEL } from './constants';
import { lintFiles } from './lint_files';
import { pickFilesToLint } from './pick_files_to_lint';

export interface ExecuteEslintValidationOptions {
  baseContext: ValidationBaseContext;
  log: ToolingLog;
  fix?: boolean;
}

export interface EslintValidationResult {
  fileCount: number;
  fixedFiles: string[];
  failedFiles: string[];
  warningCount: number;
}

/**
 * Resolves the ESLint file scope from the shared validation contract and runs
 * linting on the selected files.
 */
export const executeEslintValidation = async ({
  baseContext,
  log,
  fix = false,
}: ExecuteEslintValidationOptions): Promise<EslintValidationResult | null> => {
  const targets = await resolveLintTargets({
    baseContext,
    log,
    runner: 'eslint',
    pickFilesToLint,
  });

  if (!targets) {
    return null;
  }

  const result = await lintFiles(log, targets.files, { fix });
  return {
    fileCount: result.lintedFileCount,
    fixedFiles: result.fixedFiles,
    failedFiles: result.failedFiles,
    warningCount: result.warningCount,
  };
};

/** Runs the validation-contract-aware `scripts/eslint` CLI entrypoint. */
export const runEslintContract = () => {
  run(
    async ({ log, flags, flagsReader }) => {
      if (flags._.length > 0) {
        throw createFailError(
          'scripts/eslint only supports validation-contract execution. Remove explicit file paths and use --profile/--scope instead.'
        );
      }

      const validationFlags = readValidationRunFlags(flagsReader);
      const baseContext = await resolveValidationBaseContext({
        flags: validationFlags,
        runnerDescription: 'eslint',
        onWarning: (message) => log.warning(message),
      });

      const result = await executeEslintValidation({
        baseContext,
        log,
        fix: flagsReader.boolean('fix'),
      });

      if (result && result.failedFiles.length > 0) {
        throw createFailError(`${LINT_LABEL} errors`);
      }
    },
    {
      description: `
      Run ESLint using the shared validation contract to select scoped files.

      Examples:
        # quick local profile
        node scripts/eslint --profile quick

        # agent local profile
        node scripts/eslint --profile agent

        # PR-equivalent branch scope
        node scripts/eslint --profile pr

        # full repository lint
        node scripts/eslint --profile full
      `,
      flags: {
        string: [...VALIDATION_RUN_STRING_FLAGS],
        boolean: ['fix'],
        default: {
          fix: true,
        },
        help: [...VALIDATION_RUN_HELP, { flag: '--no-fix', description: 'Disable lint auto-fix' }],
      },
    }
  );
};
