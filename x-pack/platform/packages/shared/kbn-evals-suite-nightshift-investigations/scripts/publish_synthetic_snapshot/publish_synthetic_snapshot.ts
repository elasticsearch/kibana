/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { BulkRequest, BulkResponse } from '@elastic/elasticsearch/lib/api/types';
import { createFlagError } from '@kbn/dev-cli-errors';
import type { RunContext } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
import { publishEsSnapshot } from '../../src/seed_data/publish_es_snapshot';
import {
  SYNTHETIC_SMOKE_DATA_STREAM,
  SYNTHETIC_SMOKE_DOCUMENT_COUNT,
  SYNTHETIC_SMOKE_SEED,
  SYNTHETIC_SMOKE_WINDOW_MS,
} from '../../src/seed_data/sources';
import { createEsClient } from '../lib/es_client';

const BULK_BATCH_SIZE = 1_000;
const SYNTHETIC_HOST_COUNT = 3;
const SERVICE_NAME = 'nightshift-synthetic';

interface SyntheticDocument {
  '@timestamp': string;
  message: string;
  'log.level': string;
  'service.name': string;
  'host.name': string;
}

const buildDocument = (
  index: number,
  documentCount: number,
  capturedAt: number
): SyntheticDocument => {
  // Oldest document sits a full window back, newest lands on `capturedAt`, which replay will
  // later shift to whatever "now" is in the eval cluster.
  const offsetMs = ((documentCount - 1 - index) * SYNTHETIC_SMOKE_WINDOW_MS) / documentCount;

  return {
    '@timestamp': new Date(capturedAt - offsetMs).toISOString(),
    message: `Synthetic eval document ${index + 1} of ${documentCount}`,
    'log.level': index % 10 === 0 ? 'error' : 'info',
    'service.name': SERVICE_NAME,
    'host.name': `synthetic-host-${index % SYNTHETIC_HOST_COUNT}`,
  };
};

const assertBulkSucceeded = ({ errors, items }: BulkResponse): void => {
  if (!errors) {
    return;
  }

  const firstFailure = items.find((item) => item.create?.error)?.create?.error;

  throw new Error(
    `Indexing into ${SYNTHETIC_SMOKE_DATA_STREAM} failed: ${
      firstFailure?.reason ?? 'no reason reported'
    }`
  );
};

const deleteLocalDataStream = async ({
  esClient,
  log,
}: {
  esClient: Client;
  log: ToolingLog;
}): Promise<void> => {
  try {
    await esClient.indices.deleteDataStream({ name: SYNTHETIC_SMOKE_DATA_STREAM });
    log.debug(`Deleted local data stream ${SYNTHETIC_SMOKE_DATA_STREAM}`);
  } catch (error) {
    if ((error as { meta?: { statusCode?: number } })?.meta?.statusCode !== 404) {
      throw error;
    }
  }
};

/**
 * Writes the synthetic documents the snapshot is made of.
 *
 * `logs-*-*` is matched by Elasticsearch's built-in `logs` index template, so writing with
 * `op_type: create` is enough to get a real data stream — no Fleet, no Kibana, no template setup.
 * That matters because replay derives its destination from the backing index names.
 */
const seedSyntheticDocuments = async ({
  esClient,
  log,
  documentCount,
}: {
  esClient: Client;
  log: ToolingLog;
  documentCount: number;
}): Promise<void> => {
  // Start from nothing so the document count in the snapshot is exactly what was asked for.
  await deleteLocalDataStream({ esClient, log });

  log.info(`Indexing ${documentCount} synthetic documents into ${SYNTHETIC_SMOKE_DATA_STREAM}`);

  const capturedAt = Date.now();

  for (let offset = 0; offset < documentCount; offset += BULK_BATCH_SIZE) {
    const batchSize = Math.min(BULK_BATCH_SIZE, documentCount - offset);

    const operations: BulkRequest['operations'] = Array.from(
      { length: batchSize },
      (_, indexInBatch) => [
        { create: {} },
        buildDocument(offset + indexInBatch, documentCount, capturedAt),
      ]
    ).flat();

    const response = await esClient.bulk({ index: SYNTHETIC_SMOKE_DATA_STREAM, operations });
    assertBulkSucceeded(response);
  }

  await esClient.indices.refresh({ index: SYNTHETIC_SMOKE_DATA_STREAM });
};

/**
 * Publishes the synthetic snapshot the smoke eval restores.
 *
 * Only the document generation is specific to this seed data. Connecting to a cluster and writing
 * a snapshot to the location a seed source declares are shared with any future publisher.
 */
export const publishSyntheticSnapshot = async ({ log, flagsReader }: RunContext): Promise<void> => {
  const documentCount = flagsReader.number('document-count') ?? SYNTHETIC_SMOKE_DOCUMENT_COUNT;

  if (!Number.isInteger(documentCount) || documentCount < 1) {
    throw createFlagError(`--document-count must be a positive integer, got "${documentCount}"`);
  }

  const esClient = await createEsClient({
    esUrl: flagsReader.string('es-url'),
    kibanaUrl: flagsReader.string('kibana-url'),
    log,
  });
  const keepLocalData = flagsReader.boolean('keep-local-data');

  try {
    await seedSyntheticDocuments({ esClient, log, documentCount });

    const capturedIndices = await publishEsSnapshot({
      source: SYNTHETIC_SMOKE_SEED,
      indices: [SYNTHETIC_SMOKE_DATA_STREAM],
      esClient,
      log,
      replaceExisting: flagsReader.boolean('replace'),
    });

    log.info(
      `Captured ${capturedIndices.length} backing index/indices, ${documentCount} documents`
    );
  } finally {
    // Also on the failure path: a half-published run should not leave seeded documents in
    // whichever cluster the caller pointed this at, which is usually their dev cluster.
    if (keepLocalData) {
      log.info(`Leaving ${SYNTHETIC_SMOKE_DATA_STREAM} in place as requested`);
    } else {
      await deleteLocalDataStream({ esClient, log });
    }
  }
};
