/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';

/** Seed data held as an Elasticsearch snapshot in a GCS bucket. */
export interface EsSnapshotSeedSource {
  kind: 'es-snapshot';
  bucket: string;
  /** Path within the bucket that holds the snapshot repository. */
  basePath: string;
  snapshotName: string;
  /** Data stream patterns to replay, for example `['logs-nightshift.synthetic-*']`. */
  patterns: readonly string[];
}

/**
 * Where an eval dataset's seed data comes from.
 *
 * Supporting another mechanism means adding a member here and a branch to `seedDataset`.
 */
export type SeedSource = EsSnapshotSeedSource;

/**
 * What seeding needs from an eval dataset: an id to label its work with, and a source.
 *
 * Declared structurally rather than as `Pick<Dataset, ...>` so this module never has to know
 * about examples or ground truth.
 */
export interface SeedableDataset {
  id: string;
  seedSource: SeedSource;
}

export interface SeedingDeps {
  esClient: Client;
  log: ToolingLog;
}

export interface SeededData {
  datasetId: string;
  /** Data streams the documents landed in. Tasks read from these, cleanup empties them. */
  indices: readonly string[];
}
