/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import { formatKibanaNamespace } from '../../../../../common/formatters';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  PUBLIC_API_VERSION,
  SYNTHETICS_API_URLS,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import {
  deleteMonitors,
  omitMonitorKeys,
  parseMonitorResponse,
} from '../../../common/fixtures/monitors';
import { getPackagePolicyForMonitor } from '../../../common/fixtures/fleet';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';
import { browserMonitorFixture } from '../../../common/fixtures/data/browser_monitor';

interface ServiceLocation {
  id: string;
  isInvalid?: boolean;
  isServiceManaged?: boolean;
  spaces?: string[];
}

/**
 * Ported from FTR `apis/synthetics/add_monitor_private_location.ts`
 * (`PrivateLocationAddMonitor`).
 *
 * The FTR suite created the private location in the first `it` and reused it
 * across the later (order-dependent) `it`s. Scout creates the shared private
 * location once in `beforeAll` (so each test is self-contained) in both the
 * default space and a dedicated test space, matching the FTR `addsNewSpace`
 * setup that `handles spaces` relies on.
 *
 * `@local-stateful-classic` only: the FTR original was tagged `skipCloud`.
 */
apiTest.describe('PrivateLocationAddMonitor', { tag: tags.local.stateful.classic }, () => {
  let editorHeaders: Record<string, string>;
  let privateLocation: ScoutPrivateLocation;
  let spaceId: string;

  apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    const { apiKeyHeader } = await requestAuth.getApiKey('editor');
    editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });

    spaceId = `test-space-${uuidv4()}`;
    await kbnClient.spaces.create({ id: spaceId, name: `test-space-name ${uuidv4()}` });
    privateLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation([
      spaceId,
      'default',
    ]);
  });

  apiTest.afterAll(async ({ apiServices, kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    if (spaceId) {
      await kbnClient.spaces.delete(spaceId).catch(() => {});
    }
  });

  apiTest('lists the added private location as a valid service location', async ({ apiClient }) => {
    const res = await apiClient.get(SYNTHETICS_API_URLS.SERVICE_LOCATIONS.replace(/^\//, ''), {
      headers: editorHeaders,
      responseType: 'json',
    });
    expect(res).toHaveStatusCode(200);
    const locations = (res.body as { locations: ServiceLocation[] }).locations;
    const added = locations.find((location) => location.id === privateLocation.id);
    expect(added).toBeDefined();
    expect(added?.isInvalid).toBe(false);
    // The location was created in both the default space and the test space; the
    // service-locations response reflects both (FTR asserted the exact
    // `spaces: ['default', SPACE_ID]` membership on the listed location).
    expect(added?.spaces).toContain('default');
    expect(added?.spaces).toContain(spaceId);
    // A service-managed (public) location is still listed alongside private ones.
    expect(locations.some((location) => location.isServiceManaged)).toBe(true);
  });

  apiTest('rejects browser timeout below 30s in private locations', async ({ apiClient }) => {
    const monitor = {
      ...browserMonitorFixture,
      name: `Browser timeout too low ${uuidv4()}`,
      timeout: '29',
      locations: [privateLocation],
    };
    const res = await apiClient.post('api/synthetics/monitors', {
      headers: { ...editorHeaders, 'elastic-api-version': PUBLIC_API_VERSION },
      body: monitor,
      responseType: 'json',
    });
    expect(res).toHaveStatusCode(400);
    const body = res.body as { message: string; attributes: { details: string } };
    expect(body.message).toBe('Browser monitor timeout for private locations is invalid');
    expect(body.attributes.details).toContain('Timeout of 29 seconds is too low');
  });

  apiTest('allows browser timeout at 30s in private locations', async ({ apiClient }) => {
    const monitor = {
      ...browserMonitorFixture,
      name: `Browser timeout ok ${uuidv4()}`,
      timeout: '30',
      locations: [privateLocation],
    };
    const res = await apiClient.post('api/synthetics/monitors', {
      headers: { ...editorHeaders, 'elastic-api-version': PUBLIC_API_VERSION },
      body: monitor,
      responseType: 'json',
    });
    expect(res).toHaveStatusCode(200);
    await deleteMonitors(apiClient, editorHeaders, [(res.body as { id: string }).id]);
  });

  apiTest('handles spaces', async ({ apiClient }) => {
    const monitor = {
      ...httpMonitorFixture,
      name: `Test monitor ${uuidv4()}`,
      namespace: 'default',
      locations: [privateLocation],
      // `httpMonitorFixture` hard-codes `spaces: ['default']`; posting that to a
      // non-default space is rejected by server validation (the monitor's spaces
      // must include the current space). An empty array lets the server assign the
      // current space, mirroring `create_monitor.spec.ts`.
      spaces: [],
    };

    const res = await apiClient.post(`s/${spaceId}/api/synthetics/monitors`, {
      headers: { ...editorHeaders, 'elastic-api-version': PUBLIC_API_VERSION },
      body: monitor,
      responseType: 'json',
    });
    expect(res).toHaveStatusCode(200);
    const created = res.body as {
      id: string;
      namespace: string;
      spaces: string[];
      created_at: string;
      updated_at: string;
    };
    expect(created.namespace).toBe(formatKibanaNamespace(spaceId));
    expect(created.spaces).toStrictEqual([spaceId]);

    // Server-generated timestamps are present and parseable (FTR asserted both).
    expect(Number.isNaN(Date.parse(created.created_at))).toBe(false);
    expect(Number.isNaN(Date.parse(created.updated_at))).toBe(false);

    // Full body parity: the created monitor round-trips to the submitted config
    // with the Kibana-space namespace applied and scoped to the test space.
    expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
      omitMonitorKeys({
        ...monitor,
        namespace: formatKibanaNamespace(spaceId),
        spaces: [spaceId],
      })
    );

    // The Fleet package policy is generated with the current spaceless id
    // (`${monitorId}-${locationId}`) and named `${monitorName}-${locationLabel}`.
    const packagePolicy = await getPackagePolicyForMonitor(
      apiClient,
      editorHeaders,
      created.id,
      privateLocation.id,
      { spaceId }
    );
    expect(packagePolicy).toBeDefined();
    expect(packagePolicy?.policy_id).toBe(privateLocation.agentPolicyId);
    expect(packagePolicy?.name).toBe(`${monitor.name}-${privateLocation.label}`);
    expect(packagePolicy?.namespace).toBe(formatKibanaNamespace(spaceId));
    expect((packagePolicy as { spaceIds?: string[] })?.spaceIds).toContain(spaceId);

    await deleteMonitors(apiClient, editorHeaders, [created.id], { spaceId });
  });
});
