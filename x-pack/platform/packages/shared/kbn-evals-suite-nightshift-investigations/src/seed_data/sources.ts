/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsSnapshotSeedSource } from './types';

/**
 * Seed data sources live here rather than inside an eval, because seed data outlives the eval
 * that first needed it: several evals can sit on the same snapshot, and the CLI that publishes
 * one has to agree with the eval that reads it. Declaring each source once is what makes that
 * agreement automatic.
 */

/**
 * Data stream the synthetic documents live in, both when captured and after replay.
 *
 * `logs-*-*` is matched by Elasticsearch's built-in `logs` index template, so the data stream is
 * created without Fleet or any Kibana setup.
 */
export const SYNTHETIC_SMOKE_DATA_STREAM = 'logs-nightshift.synthetic-default';

/** Documents `scripts/publish_nightshift_eval_snapshot.js` writes into the snapshot. */
export const SYNTHETIC_SMOKE_DOCUMENT_COUNT = 500;

/** Time span the seeded documents are spread across, ending at the moment of capture. */
export const SYNTHETIC_SMOKE_WINDOW_MS = 60 * 60_000;

/** Throwaway synthetic logs, used by the smoke eval and created by the publish CLI. */
export const SYNTHETIC_SMOKE_SEED: EsSnapshotSeedSource = {
  kind: 'es-snapshot',
  bucket: 'nightshift-datasets',
  basePath: 'investigation-engine/synthetic',
  snapshotName: 'synthetic-smoke',
  patterns: [SYNTHETIC_SMOKE_DATA_STREAM],
};
