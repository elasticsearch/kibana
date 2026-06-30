/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest } from '../../common/fixtures';
import {
  esArchiversPath,
  internalApiHeaders,
  profilingApiEndpoints,
} from '../../common/fixtures/constants';

// The profiling data routes require the `profiling` Kibana privilege
// (`security.authz.requiredPrivileges: ['profiling']`). These tests verify that a user
// without it is forbidden and a viewer is allowed, across all profiling read endpoints.
//
// The queries use the 2023-03-17 window that matches the loaded es_archiver data (the same
// window as the functions/flamegraph specs). The FTR original used an empty "now" window,
// but that relied on cloud-specific provisioning of `profiling-events-all`; on self-managed
// stateful the topN routes need a real events index to answer with 200. The assertion under
// test is authorization (403 vs 200), so exercising it against real data is equivalent and
// more robust across deployments.
//
// Time-unit caveat: the profiling routes are inconsistent. `functions`/`flamechart` divide
// the params by 1000 (so they expect milliseconds), while the `topn/*` routes pass them
// straight into an `epoch_second` range filter (so they expect seconds). Sending ms to the
// topN routes makes the lower bound resolve to year ~55175, which overflows the `date_nanos`
// events index on self-managed stateful and returns 500. So topN endpoints get seconds.
const TIME_FROM_MS = new Date('2023-03-17T01:00:00.000Z').getTime();
const TIME_TO_MS = new Date('2023-03-17T01:05:00.000Z').getTime();
const TIME_FROM_S = TIME_FROM_MS / 1000;
const TIME_TO_S = TIME_TO_MS / 1000;

const buildEndpoints = (): string[] => {
  // topN routes expect epoch seconds.
  const topNRange = new URLSearchParams({
    timeFrom: String(TIME_FROM_S),
    timeTo: String(TIME_TO_S),
    kuery: '',
  });
  // functions/flamechart routes expect epoch milliseconds.
  const flameRange = new URLSearchParams({
    timeFrom: String(TIME_FROM_MS),
    timeTo: String(TIME_TO_MS),
    kuery: '',
  });
  const functionsRange = new URLSearchParams({
    timeFrom: String(TIME_FROM_MS),
    timeTo: String(TIME_TO_MS),
    kuery: '',
    startIndex: '1',
    endIndex: '5',
  });

  return [
    `${profilingApiEndpoints.topNContainers}?${topNRange}`,
    `${profilingApiEndpoints.topNDeployments}?${topNRange}`,
    `${profilingApiEndpoints.topNHosts}?${topNRange}`,
    `${profilingApiEndpoints.topNTraces}?${topNRange}`,
    `${profilingApiEndpoints.topNThreads}?${topNRange}`,
    `${profilingApiEndpoints.topNFunctions}?${functionsRange}`,
    `${profilingApiEndpoints.flamechart}?${flameRange}`,
    profilingApiEndpoints.setupInstructions,
  ];
};

apiTest.describe('Profiling feature controls', { tag: tags.stateful.classic }, () => {
  apiTest.beforeAll(async ({ profilingHelper, profilingSetup }) => {
    const status = await profilingSetup.checkStatus();
    if (!status.has_setup) {
      await profilingHelper.installPolicies();
      await profilingSetup.setupResources();
    }
    if (!status.has_data) {
      await profilingSetup.loadData(esArchiversPath);
    }
  });

  apiTest(
    'returns forbidden for users with no access to profiling APIs',
    async ({ apiClient, samlAuth }) => {
      // A user with an unrelated feature privilege but no `profiling` access. We use an
      // interactive session (cookie) rather than `getApiKeyForCustomRole` because API-key
      // privilege resolution can differ and resolve 200 for the same role shape.
      const { cookieHeader } = await samlAuth.asInteractiveUser({
        elasticsearch: { cluster: [], indices: [] },
        kibana: [{ base: [], feature: { dashboard: ['read'] }, spaces: ['*'] }],
      });

      for (const endpoint of buildEndpoints()) {
        const response = await apiClient.get(endpoint, {
          headers: { ...cookieHeader, ...internalApiHeaders },
          responseType: 'json',
        });
        expect(response.statusCode, `Expected 403 for ${endpoint}`).toBe(403);
      }
    }
  );

  apiTest('returns ok for users with access to profiling APIs', async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('viewer');

    for (const endpoint of buildEndpoints()) {
      const response = await apiClient.get(endpoint, {
        headers: { ...cookieHeader, ...internalApiHeaders },
        responseType: 'json',
      });
      expect(response.statusCode, `Expected 200 for ${endpoint}`).toBe(200);
    }
  });
});
