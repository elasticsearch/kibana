/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import type { BaseFlameGraph } from '@kbn/profiling-utils';
import { apiTest } from '../../common/fixtures';
import {
  esArchiversPath,
  internalApiHeaders,
  profilingApiEndpoints,
} from '../../common/fixtures/constants';

// The time window must match the profiling es_archiver data (2023-03-17). It is
// intentionally NOT `PROFILING_TEST_DATES` (the 2023-04-18 window used by the UI suite):
// the exact scalar values asserted below are tied to this window and data set.
const TIME_FROM = new Date('2023-03-17T01:00:00.000Z').getTime();
const TIME_TO = new Date('2023-03-17T01:00:30.000Z').getTime();

// Parallel arrays in BaseFlameGraph: each has one entry per node, so length === Size.
const PARALLEL_ARRAY_KEYS: Array<keyof BaseFlameGraph> = [
  'AddressOrLine',
  'FileID',
  'FrameType',
  'Inline',
  'ExeFilename',
  'FunctionName',
  'FunctionOffset',
  'SourceFilename',
  'SourceLine',
  'CountInclusive',
  'CountExclusive',
];

apiTest.describe('Profiling flamegraph API with data', { tag: tags.stateful.classic }, () => {
  apiTest.beforeAll(async ({ profilingHelper, profilingSetup }) => {
    const status = await profilingSetup.checkStatus();

    if (!status.has_setup) {
      await profilingHelper.installPolicies();
      await profilingSetup.setupResources();
    }

    if (!status.has_data) {
      await profilingSetup.loadData(esArchiversPath);
    }

    const updated = await profilingSetup.checkStatus();
    expect(updated.has_setup).toBe(true);
    expect(updated.has_data).toBe(true);
  });

  apiTest('returns correct result', async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');

    const query = new URLSearchParams({
      timeFrom: String(TIME_FROM),
      timeTo: String(TIME_TO),
      kuery: '',
    });

    const response = await apiClient.get(`${profilingApiEndpoints.flamechart}?${query}`, {
      headers: { ...cookieHeader, ...internalApiHeaders },
      responseType: 'json',
    });

    expect(response.statusCode).toBe(200);

    const flamegraph = response.body as BaseFlameGraph;

    // Scalars from the FTR flamegraph snapshot.
    expect(flamegraph.SamplingRate).toBe(1);
    expect(flamegraph.Size).toBe(6864);
    expect(flamegraph.TotalSeconds).toBe(30);

    // The FTR test snapshotted each parallel array (82k lines total). Scout has no jest
    // snapshot equivalent, so we assert the structural invariant instead: every parallel
    // array has exactly `Size` entries.
    for (const key of PARALLEL_ARRAY_KEYS) {
      const column = flamegraph[key];
      expect(Array.isArray(column)).toBe(true);
      expect(column as unknown[]).toHaveLength(flamegraph.Size);
    }
  });
});
