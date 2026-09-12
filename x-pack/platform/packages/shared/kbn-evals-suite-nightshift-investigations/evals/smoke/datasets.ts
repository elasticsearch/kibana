/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Dataset } from '../../src/datasets';
import { selectDatasets } from '../../src/datasets';
import { SYNTHETIC_SMOKE_DOCUMENT_COUNT, SYNTHETIC_SMOKE_SEED } from '../../src/seed_data';
import type { SmokeExample } from './types';

const SYNTHETIC_SMOKE_ID = 'synthetic-smoke';

/**
 * Replay pins the newest `@timestamp` to "now", so this allowance only has to cover restore and
 * reindex time on a slow CI worker. Capture-time timestamps are days or weeks old and fail it.
 */
const MAXIMUM_DOCUMENT_AGE_MS = 30 * 60_000;

/**
 * Throwaway logs that prove snapshot restore, task execution, evaluator scoring and score
 * ingestion work end to end. The document contents are deliberately meaningless: this dataset
 * exists to exercise those mechanics, not to represent an incident.
 */
const syntheticSmokeDataset: Dataset<SmokeExample> = {
  id: SYNTHETIC_SMOKE_ID,
  name: 'Nightshift investigations: synthetic smoke',
  description:
    'Synthetic logs restored from GCS, used to verify that the eval suite can seed data, run a ' +
    'task against it and ingest scores.',
  maturity: 'raw',
  seedSource: SYNTHETIC_SMOKE_SEED,
  examples: () => [
    {
      input: { dataset_id: SYNTHETIC_SMOKE_ID },
      output: {
        minimum_document_count: SYNTHETIC_SMOKE_DOCUMENT_COUNT,
        maximum_document_age_ms: MAXIMUM_DOCUMENT_AGE_MS,
      },
    },
  ],
};

const DATASETS: ReadonlyArray<Dataset<SmokeExample>> = [syntheticSmokeDataset];

/** Eval datasets to run in this process, narrowed by `NIGHTSHIFT_DATASETS`. */
export const getSmokeDatasets = (): Array<Dataset<SmokeExample>> => selectDatasets(DATASETS);
