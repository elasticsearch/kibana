/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { join, dirname } from 'path';
import { bin } from 'oxlint/package.json';

export const LINT_LABEL = 'oxlint';
export const LINT_LOG_PREFIX = `[${LINT_LABEL}]`;
export const OXLINT_CONFIG_PATH = '.oxlintrc.json';

export const oxlintBinPath = join(dirname(require.resolve('oxlint/package.json')), bin.oxlint);
