/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import { createFailError } from '@kbn/dev-cli-errors';
import {
  buildValidationCliArgs,
  describeValidationNoTargetsScope,
  formatReproductionCommand,
  type ValidationBaseContext,
} from '@kbn/dev-validation-runner';
import { getRepoFiles } from '@kbn/get-repo-files';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';

import { File } from './file';

export interface ResolveLintTargetsOptions {
  baseContext: ValidationBaseContext;
  log: ToolingLog;
  /** Linter name used in log messages and the reproduction command, e.g. `eslint`. */
  runner: string;
  pickFilesToLint: (log: ToolingLog, files: File[]) => Promise<File[]>;
}

export interface LintTargets {
  files: File[];
  /** True when the scope is the whole repository rather than a changed-file subset. */
  fullRepo: boolean;
}

/**
 * Resolves the lintable file scope from the shared validation contract.
 * Returns `null` when there is nothing to lint for the current scope.
 */
export const resolveLintTargets = async ({
  baseContext,
  log,
  runner,
  pickFilesToLint,
}: ResolveLintTargetsOptions): Promise<LintTargets | null> => {
  if (baseContext.mode === 'direct_target') {
    throw createFailError(
      `scripts/${runner} only supports validation-contract execution. Remove explicit file paths and use --profile/--scope instead.`
    );
  }

  const resolvedBase =
    baseContext.runContext.kind === 'affected' ? baseContext.runContext.resolvedBase : undefined;
  const shouldRunFullRepo =
    baseContext.mode === 'contract' &&
    (baseContext.runContext.kind === 'full' || baseContext.contract.testMode === 'all');
  const cliArgs = buildValidationCliArgs({
    contract: baseContext.contract,
    resolvedBase,
    forceFullProfile: shouldRunFullRepo,
  });
  log.info(`Running \`${formatReproductionCommand(runner, cliArgs.logArgs)}\``);

  if (baseContext.runContext.kind === 'skip') {
    log.info(
      `No changed files found ${describeValidationNoTargetsScope(baseContext)}; skipping ${runner}.`
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
      `No changed files found ${describeValidationNoTargetsScope(baseContext)}; skipping ${runner}.`
    );
    return null;
  }

  const filesToLint = await pickFilesToLint(
    log,
    changedFiles.map((pathValue) => new File(Path.resolve(REPO_ROOT, pathValue)))
  );

  if (filesToLint.length === 0) {
    log.info(
      `No JS/TS files selected for ${runner} ${describeValidationNoTargetsScope(
        baseContext
      )}; skipping ${runner}.`
    );
    return null;
  }

  log.info(
    `Selected ${filesToLint.length} lintable file(s) from ${changedFiles.length} candidate file(s).`
  );

  return { files: filesToLint, fullRepo: shouldRunFullRepo };
};
