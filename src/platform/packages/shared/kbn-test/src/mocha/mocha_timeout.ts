/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Mocha's own `Runnable.constants.TIMEOUT` (see `createTimeoutError()` in mocha's `lib/errors.js`),
// not exported on the public `mocha` API. Every Mocha timeout carries it, whatever the message says.
const MOCHA_TIMEOUT_ERROR_CODE = 'ERR_MOCHA_TIMEOUT';

export const isMochaTimeoutError = (error: unknown): boolean =>
  (error as { code?: string } | undefined)?.code === MOCHA_TIMEOUT_ERROR_CODE;
