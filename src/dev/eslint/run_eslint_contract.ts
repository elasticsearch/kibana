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
import {
  buildValidationCliArgs,
  describeValidationNoTargetsScope,
  formatReproductionCommand,
  readValidationRunFlags,
  resolveValidationBaseContext,
  type ValidationBaseContext,
  VALIDATION_RUN_HELP,
  VALIDATION_RUN_STRING_FLAGS,
} from '@kbn/dev-validation-runner';
import { getRepoFiles } from '@kbn/get-repo-files';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';

import { File } from '../file';
import { LINT_LABEL } from './constants';
import { lintFiles } from './lint_files';
import { pickFilesToLint } from './pick_files_to_lint';

export interface ExecuteEslintValidationOptions {
  baseContext: ValidationBaseContext;
  log: ToolingLog;
  fix?: boolean;
}

const isFullEslintRun = (baseContext: ValidationBaseContext) => {
  return (
    baseContext.mode === 'contract' &&
    (baseContext.runContext.kind === 'full' || baseContext.contract.testMode === 'all')
  );
};

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
  if (baseContext.mode === 'direct_target') {
    throw createFailError(
      'scripts/eslint only supports validation-contract execution. Remove explicit file paths and use --profile/--scope instead.'
    );
  }

  const resolvedBase =
    baseContext.runContext.kind === 'affected' ? baseContext.runContext.resolvedBase : undefined;
  const shouldRunFullRepo = isFullEslintRun(baseContext);
  const cliArgs = buildValidationCliArgs({
    contract: baseContext.contract,
    resolvedBase,
    forceFullProfile: shouldRunFullRepo,
  });
  log.info(`Running \`${formatReproductionCommand('eslint', cliArgs.logArgs)}\``);

  if (baseContext.runContext.kind === 'skip') {
    log.info(
      `No changed files found ${describeValidationNoTargetsScope(baseContext)}; skipping eslint.`
    );
    return null;
  }

  let changedFiles: string[];
  if (shouldRunFullRepo) {
    changedFiles = (await getRepoFiles()).map((file) => file.repoRel);
  } else if (baseContext.runContext.kind === 'affected') {
    changedFiles = baseContext.runContext.changedFiles;
  } else {
    changedFiles = [];
  }

  if (changedFiles.length === 0) {
    log.info(
      `No changed files found ${describeValidationNoTargetsScope(baseContext)}; skipping eslint.`
    );
    return null;
  }

  const filesToLint = await pickFilesToLint(
    log,
    changedFiles.map((pathValue) => new File(Path.resolve(REPO_ROOT, pathValue)))
  );

  if (filesToLint.length === 0) {
    log.info(
      `No JS/TS files selected for eslint ${describeValidationNoTargetsScope(
        baseContext
      )}; skipping eslint.`
    );
    return null;
  }

  log.info(
    `Selected ${filesToLint.length} lintable file(s) from ${changedFiles.length} candidate file(s).`
  );

  const result = await lintFiles(log, filesToLint, { fix });
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
