/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { File } from '../file';
import { LINT_LOG_PREFIX } from './constants';

/**
 * Filters a list of files to only include files oxlint should lint. Ignore
 * patterns from `.oxlintrc.json` and `.eslintignore` are applied by oxlint itself.
 */
export async function pickFilesToLint(log: ToolingLog, files: File[]) {
  const filesToLint = [];

  for (const file of files) {
    if (!file.isJs() && !file.isTypescript()) continue;

    log.debug(`${LINT_LOG_PREFIX} linting %j`, file);
    filesToLint.push(file);
  }

  return filesToLint;
}
