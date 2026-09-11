/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import execa from 'execa';

import { createFailError } from '@kbn/dev-cli-errors';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';
import type { File } from '../file';
import { LINT_LOG_PREFIX, OXLINT_CONFIG_PATH, oxlintBinPath } from './constants';

export interface LintFilesOptions {
  fix?: boolean;
  /**
   * Lint the whole repository (oxlint's own traversal) instead of passing `files` explicitly.
   * Keeps cross-file rules seeing the full module graph and avoids ARG_MAX limits.
   */
  fullRepo?: boolean;
}

export interface LintFilesResult {
  failedFiles: string[];
  lintedFileCount: number;
  warningCount: number;
}

interface OxlintDiagnostic {
  message: string;
  code: string;
  severity: 'error' | 'warning' | 'advice';
  filename: string;
  labels?: Array<{ span: { line: number; column: number } }>;
}

interface OxlintJsonReport {
  diagnostics: OxlintDiagnostic[];
  number_of_files: number;
}

// ARG_MAX on macOS is 1MB; explicit path lists are batched to stay well under it.
const MAX_PATHS_PER_RUN = 4000;

interface OxlintRun {
  report: OxlintJsonReport;
  exitCode: number;
  stderr: string;
}

async function runOxlint(args: string[]): Promise<OxlintRun> {
  const { stdout, stderr, exitCode } = await execa(
    process.execPath,
    [oxlintBinPath, '--config', OXLINT_CONFIG_PATH, '--format', 'json', ...args],
    { cwd: REPO_ROOT, reject: false, maxBuffer: 256 * 1024 * 1024 }
  );

  try {
    return { report: JSON.parse(stdout), exitCode, stderr };
  } catch {
    throw createFailError(`${LINT_LOG_PREFIX} exited with ${exitCode}:\n${stderr || stdout}`);
  }
}

/**
 * Lints files with oxlint. Reports are written to the log.
 * Returns a result with `failedFiles` populated when errors are found.
 */
export async function lintFiles(
  log: ToolingLog,
  files: File[],
  { fix, fullRepo }: LintFilesOptions = {}
): Promise<LintFilesResult> {
  const fixArgs = fix ? ['--fix'] : [];
  const runs: OxlintRun[] = [];
  if (fullRepo) {
    runs.push(await runOxlint(fixArgs));
  } else {
    const paths = files.map((file) => file.getRelativePath());
    for (let i = 0; i < paths.length; i += MAX_PATHS_PER_RUN) {
      runs.push(await runOxlint([...fixArgs, ...paths.slice(i, i + MAX_PATHS_PER_RUN)]));
    }
  }

  const diagnostics = runs.flatMap((run) => run.report.diagnostics);
  const lintedFileCount = runs.reduce((sum, run) => sum + run.report.number_of_files, 0);
  const exitCode = runs.find((run) => run.exitCode !== 0)?.exitCode ?? 0;
  const stderr = runs.map((run) => run.stderr).join('');
  const failedFiles = [
    ...new Set(diagnostics.filter((d) => d.severity === 'error').map((d) => d.filename)),
  ].sort((left, right) => left.localeCompare(right));
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  // oxlint exits 1 for lint errors; anything else without error diagnostics is a tool failure.
  if (exitCode !== 0 && failedFiles.length === 0) {
    throw createFailError(`${LINT_LOG_PREFIX} exited with ${exitCode}:\n${stderr}`);
  }

  if (diagnostics.length > 0) {
    const msg = diagnostics
      .map((d) => {
        const span = d.labels?.[0]?.span;
        const location = span ? `${d.filename}:${span.line}:${span.column}` : d.filename;
        return `${location}  ${d.severity}  ${d.message}  ${d.code}`;
      })
      .join('\n');
    log[failedFiles.length > 0 ? 'error' : 'warning'](msg);
  }

  if (failedFiles.length > 0) {
    log.error(`${LINT_LOG_PREFIX} errors in ${failedFiles.length} file(s)`);
  } else {
    log.success(`${LINT_LOG_PREFIX} %d files linted successfully`, lintedFileCount);
  }

  return {
    failedFiles,
    lintedFileCount,
    warningCount,
  };
}
