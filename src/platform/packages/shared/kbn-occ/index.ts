/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export {
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  OCC_CONFLICT_STATUS_CODE,
} from './src/constants';
export { delayMs } from './src/delay';
export { OccConflictError, isElasticsearchWriteConflict, isOccConflictError } from './src/errors';
export { OccWriter } from './src/occ_writer';
export type {
  OccCreateParams,
  OccDocument,
  OccMetadata,
  OccReadModifyWriteParams,
  OccWriteParams,
  OccWriteResult,
  OccWriterDeps,
} from './src/types';
