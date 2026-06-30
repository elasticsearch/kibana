/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import type { TopNFunctions } from '@kbn/profiling-utils';
import { apiTest } from '../../common/fixtures';
import {
  esArchiversPath,
  internalApiHeaders,
  profilingApiEndpoints,
} from '../../common/fixtures/constants';

// The time window must match the profiling es_archiver data (2023-03-17). It is
// intentionally NOT `PROFILING_TEST_DATES` (the 2023-04-18 window used by the UI suite):
// the exact aggregate counts asserted below are tied to this window and data set.
const TIME_FROM = new Date('2023-03-17T01:00:00.000Z').getTime();
const TIME_TO = new Date('2023-03-17T01:05:00.000Z').getTime();

apiTest.describe('Profiling TopN functions API with data', { tag: tags.stateful.classic }, () => {
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
      startIndex: '0',
      endIndex: '5',
    });

    const response = await apiClient.get(`${profilingApiEndpoints.topNFunctions}?${query}`, {
      headers: { ...cookieHeader, ...internalApiHeaders },
      responseType: 'json',
    });

    expect(response.statusCode).toBe(200);

    const functions = response.body as TopNFunctions;
    expect(functions.TopN).toHaveLength(7047);
    expect(functions.TotalCount).toBe(80555);
    expect(functions.selfCPU).toBe(3534);
    expect(functions.totalCPU).toBe(80555);

    // Structural check on the top-ranked frame. This replaces the FTR full-object
    // `expectSnapshot(functions)` (204k lines) — Scout has no jest snapshot equivalent
    // and the byte-exact snapshot was unmaintainable. The aggregate counts above plus
    // this structural assertion preserve the data-correctness intent.
    expect(functions.TopN[0].Rank).toBe(1);
    expect(functions.TopN[0].Frame).toBeDefined();
  });
});
