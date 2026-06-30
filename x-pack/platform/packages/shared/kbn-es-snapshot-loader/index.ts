/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { restoreSnapshot } from './src/restore';
export { replaySnapshot, TEMP_INDEX_PREFIX } from './src/replay';
export { createSnapshot } from './src/create';
export {
  type RestoreConfig,
  type ReplayConfig,
  type CreateConfig,
  type LoadResult,
  type CreateResult,
} from './src/types';
export {
  createUrlRepository,
  createGcsRepository,
  createFsRepository,
  type RepositoryType,
  type RepositoryStrategy,
  type GcsRepositoryConfig,
  type FsRepositoryConfig,
} from './src/repository';
export { extractDataStreamName } from './src/utils';
