/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import { ESLint } from 'eslint';

import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';
import type { File } from '../file';
import { LINT_LOG_PREFIX } from './constants';

export interface LintFilesResult {
  fixedFiles: string[];
  failedFiles: string[];
  lintedFileCount: number;
  warningCount: number;
}

// Mirrors ESLint CLI's `--quiet` behavior: only autofix errors, never warnings.
const errorOnlyFixPredicate = (message: { severity: number }) => message.severity === 2;

/**
 * Lints a list of files with eslint. Reports are written to the log.
 * Returns a result with `failedFiles` populated when errors are found.
 */
export async function lintFiles(
  log: ToolingLog,
  files: File[],
  { fix }: { fix?: boolean } = {}
): Promise<LintFilesResult> {
  const eslint = new ESLint({
    cache: true,
    cwd: REPO_ROOT,
    fix: fix ? errorOnlyFixPredicate : false,
  });

  const paths = files.map((file) => file.getRelativePath());
  const reports = await eslint.lintFiles(paths);

  if (fix) {
    await ESLint.outputFixes(reports);
  }

  const fixedFiles = fix
    ? reports
        .filter((report) => report.output !== undefined)
        .map((report) => report.filePath)
        .map((filePath) => Path.relative(REPO_ROOT, filePath))
        .sort((left, right) => left.localeCompare(right))
    : [];

  let foundError = false;
  let foundWarning = false;
  let warningCount = 0;
  const failedFiles: string[] = [];
  for (const report of reports) {
    if (report.errorCount !== 0) {
      foundError = true;
      failedFiles.push(Path.relative(REPO_ROOT, report.filePath));
    }

    if (report.warningCount !== 0) {
      warningCount += report.warningCount;
      foundWarning = true;
    }
  }

  if (foundError || foundWarning) {
    const formatter = await eslint.loadFormatter();
    const msg = await formatter.format(reports);
    log[foundError ? 'error' : 'warning'](msg);

    if (foundError) {
      log.error(`${LINT_LOG_PREFIX} errors in ${failedFiles.length} file(s)`);
    }
  }

  if (!foundError) {
    log.success(`${LINT_LOG_PREFIX} %d files linted successfully`, files.length);
  }

  if (fixedFiles.length > 0) {
    log.info(`${LINT_LOG_PREFIX} auto-fixed %d file(s):`, fixedFiles.length);
    for (const fixedFile of fixedFiles) {
      log.info('  %s', fixedFile);
    }
  }

  return {
    fixedFiles,
    failedFiles,
    lintedFileCount: files.length,
    warningCount,
  };
}
