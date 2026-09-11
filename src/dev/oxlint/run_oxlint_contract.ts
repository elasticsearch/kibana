/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ValidationBaseContext } from '@kbn/dev-validation-runner';
import type { ToolingLog } from '@kbn/tooling-log';

import { resolveLintTargets } from '../lint_targets';
import { lintFiles } from './lint_files';
import { pickFilesToLint } from './pick_files_to_lint';

export interface ExecuteOxlintValidationOptions {
  baseContext: ValidationBaseContext;
  log: ToolingLog;
  fix?: boolean;
}

export interface OxlintValidationResult {
  fileCount: number;
  failedFiles: string[];
  warningCount: number;
}

/**
 * Resolves the oxlint file scope from the shared validation contract and runs
 * linting on the selected files.
 */
export const executeOxlintValidation = async ({
  baseContext,
  log,
  fix = false,
}: ExecuteOxlintValidationOptions): Promise<OxlintValidationResult | null> => {
  const targets = await resolveLintTargets({
    baseContext,
    log,
    runner: 'lint',
    pickFilesToLint,
  });

  if (!targets) {
    return null;
  }

  const result = await lintFiles(log, targets.files, { fix, fullRepo: targets.fullRepo });
  return {
    fileCount: result.lintedFileCount,
    failedFiles: result.failedFiles,
    warningCount: result.warningCount,
  };
};
