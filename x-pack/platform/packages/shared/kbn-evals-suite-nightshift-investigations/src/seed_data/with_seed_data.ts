/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate } from '../evaluate';
import { clearSeedData, seedDataset } from './seed';
import type { SeedableDataset, SeededData } from './types';

/**
 * Seeds an eval dataset's data for the surrounding `describe` block and clears it afterwards.
 *
 * Registering both hooks here is what keeps specs from each growing their own copy of the
 * seed-and-clean-up dance, and means cleanup cannot be left out of a new spec by accident.
 * Call it at describe scope; the accessor it returns is only valid from `beforeAll` onwards.
 *
 * ```ts
 * evaluate.describe(dataset.id, () => {
 *   const seedData = withSeedData(dataset);
 *   evaluate('...', async () => { ... seedData().indices ... });
 * });
 * ```
 */
export const withSeedData = (dataset: SeedableDataset): (() => SeededData) => {
  let seeded: SeededData | undefined;

  evaluate.beforeAll(async ({ esClient, log }) => {
    seeded = await seedDataset(dataset, { esClient, log });
  });

  evaluate.afterAll(async ({ esClient, log }) => {
    if (!seeded) {
      return;
    }

    await clearSeedData(seeded, { esClient, log });
    seeded = undefined;
  });

  return () => {
    if (!seeded) {
      throw new Error(
        `No seed data for dataset "${dataset.id}". Call withSeedData() at describe scope, and ` +
          `its accessor only from tests or hooks that run after beforeAll.`
      );
    }

    return seeded;
  };
};
