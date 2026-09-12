/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { replayEsSnapshot } from './es_snapshot';
import type { SeedableDataset, SeededData, SeedingDeps } from './types';

/**
 * Puts an eval dataset's seed data in the eval cluster.
 *
 * The switch is the suite's single extension point for seeding: a new `SeedSource` member gets a
 * branch here and nothing else changes.
 */
export const seedDataset = async (
  dataset: SeedableDataset,
  deps: SeedingDeps
): Promise<SeededData> => {
  const { id, seedSource } = dataset;

  switch (seedSource.kind) {
    case 'es-snapshot':
      return { datasetId: id, indices: await replayEsSnapshot({ source: seedSource, ...deps }) };
  }
};

/**
 * Empties the data streams seeding wrote to.
 *
 * Failures are logged rather than thrown: leftover documents are a nuisance for the next run,
 * whereas a teardown that throws masks the result of the run that just finished.
 */
export const clearSeedData = async (
  { datasetId, indices }: SeededData,
  { esClient, log }: SeedingDeps
): Promise<void> => {
  if (indices.length === 0) {
    return;
  }

  log.debug(`Clearing ${indices.length} data stream(s) seeded for "${datasetId}"`);

  await Promise.all(
    indices.map(async (index) => {
      try {
        await esClient.deleteByQuery({ index, query: { match_all: {} }, refresh: true });
      } catch (error) {
        log.warning(
          `Could not clear [${index}] after "${datasetId}"; documents may remain: ${
            (error as Error).message
          }`
        );
      }
    })
  );
};
