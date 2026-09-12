/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * For eval-side consumers. `withSeedData` pulls in the Playwright fixture, so CLIs under
 * `scripts/` should import the module they need directly rather than going through here.
 */

export { clearSeedData, seedDataset } from './seed';
export {
  SYNTHETIC_SMOKE_DATA_STREAM,
  SYNTHETIC_SMOKE_DOCUMENT_COUNT,
  SYNTHETIC_SMOKE_SEED,
  SYNTHETIC_SMOKE_WINDOW_MS,
} from './sources';
export { withSeedData } from './with_seed_data';
export type {
  EsSnapshotSeedSource,
  SeedableDataset,
  SeededData,
  SeedingDeps,
  SeedSource,
} from './types';
