/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import { getMonitor, listMonitors, saveMonitorInternal } from '../../../common/fixtures/monitors';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

const NEW_LOCATION_LABEL = 'Barcelona';
const NEW_TAGS = ['myAwesomeTag'];

/** Fleet package-policies query scoped to synthetics, mirroring the FTR call. */
const fleetPackagePoliciesPath = (spaceId?: string) =>
  `${
    spaceId ? `s/${spaceId}/` : ''
  }api/fleet/package_policies?page=1&perPage=2000&kuery=${encodeURIComponent(
    'ingest-package-policies.package.name: synthetics'
  )}`;

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/edit_private_location.ts`.
 *
 * The FTR suite chained 19 sequential `it`s that shared a single private
 * location and mutated its label across tests. Editing a private location label
 * propagates to every monitor and Fleet package policy that references it, so
 * to stay parallel-safe each Scout test provisions its own location/monitors
 * and the per-step assertions are folded into self-contained cases. The nested
 * multi-space `describe` is flattened into one combined test.
 */
apiTest.describe(
  'EditPrivateLocationAPI',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    const spacesToCleanUp: string[] = [];

    const privateLocationPath = (locationId: string, spaceId?: string) =>
      `${spaceId ? `s/${spaceId}/` : ''}api/synthetics/private_locations/${locationId}`;

    const editPrivateLocation = async (
      apiClient: ApiClientFixture,
      locationId: string,
      body: Record<string, unknown>,
      opts: { spaceId?: string; statusCode?: number } = {}
    ) => {
      const { spaceId, statusCode = 200 } = opts;
      const res = await apiClient.put(privateLocationPath(locationId, spaceId), {
        headers: editorHeaders,
        body,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(statusCode);
      return res;
    };

    const getPrivateLocation = async (apiClient: ApiClientFixture, locationId: string) => {
      const res = await apiClient.get(privateLocationPath(locationId), {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      return res.body as { label: string; tags?: string[]; id: string; agentPolicyId: string };
    };

    const createMonitor = async (
      apiClient: ApiClientFixture,
      monitor: Record<string, unknown>,
      spaceId?: string
    ) => {
      const res = await saveMonitorInternal(apiClient, editorHeaders, monitor, { spaceId });
      return res.body as { config_id: string };
    };

    const expectMonitorLocationLabel = async (
      apiClient: ApiClientFixture,
      monitorId: string,
      locationId: string,
      expectedLabel: string,
      spaceId?: string
    ) => {
      const { body } = await getMonitor(apiClient, editorHeaders, monitorId, {
        space: spaceId,
        internal: true,
      });
      const { locations } = body as { locations: Array<{ id: string; label: string }> };
      expect(locations).toHaveLength(1);
      expect(locations[0].id).toBe(locationId);
      expect(locations[0].label).toBe(expectedLabel);
    };

    apiTest.beforeAll(async ({ requestAuth, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      for (const spaceId of spacesToCleanUp) {
        await kbnClient.spaces.delete(spaceId).catch(() => {});
      }
      spacesToCleanUp.length = 0;
    });

    apiTest(
      'successfully edits a private location label with no monitors assigned',
      async ({ apiClient, apiServices }) => {
        const location = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
        const res = await editPrivateLocation(apiClient, location.id, {
          label: 'No monitors assigned',
        });
        expect((res.body as { label: string }).label).toBe('No monitors assigned');
      }
    );

    apiTest(
      'editing the label propagates to the assigned monitor and Fleet package policy',
      async ({ apiClient, apiServices }) => {
        const location = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
        const { config_id: monitorId } = await createMonitor(apiClient, {
          ...httpMonitorFixture,
          namespace: 'default',
          name: `Monitor ${uuidv4()}`,
          locations: [location],
        });

        const res = await editPrivateLocation(apiClient, location.id, {
          label: NEW_LOCATION_LABEL,
          tags: NEW_TAGS,
        });
        const edited = res.body as {
          label: string;
          tags: string[];
          id: string;
          agentPolicyId: string;
        };
        expect(edited.label).toBe(NEW_LOCATION_LABEL);
        expect(edited.tags).toStrictEqual(NEW_TAGS);
        expect(edited.id).toBe(location.id);
        expect(edited.agentPolicyId).toBe(location.agentPolicyId);

        // GET reflects the new label
        const fetched = await getPrivateLocation(apiClient, location.id);
        expect(fetched.label).toBe(NEW_LOCATION_LABEL);

        // the monitor's embedded location label is updated
        await expectMonitorLocationLabel(apiClient, monitorId, location.id, NEW_LOCATION_LABEL);

        // the Fleet package policy name reflects the new label
        const policiesRes = await apiClient.get(fleetPackagePoliciesPath(), {
          headers: editorHeaders,
          responseType: 'json',
        });
        expect(policiesRes).toHaveStatusCode(200);
        const { items } = policiesRes.body as { items: Array<{ id: string; name: string }> };
        const packagePolicy = items.find((p) => p.id === `${monitorId}-${location.agentPolicyId}`);
        expect(packagePolicy?.name).toContain(NEW_LOCATION_LABEL);
      }
    );

    apiTest('returns 404 when editing a non-existent private location', async ({ apiClient }) => {
      const nonExistentId = 'non-existent-id';
      const res = await editPrivateLocation(
        apiClient,
        nonExistentId,
        { label: NEW_LOCATION_LABEL },
        { statusCode: 404 }
      );
      expect((res.body as { message: string }).message).toContain(
        `Private location with id ${nonExistentId} does not exist.`
      );
    });

    apiTest('returns 400 when editing with an empty label', async ({ apiClient, apiServices }) => {
      const location = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
      const res = await editPrivateLocation(
        apiClient,
        location.id,
        { label: '' },
        { statusCode: 400 }
      );
      expect((res.body as { message: string }).message).toContain(
        '[request body.label]: value has length [0] but it must have a minimum length of [1].'
      );
    });

    apiTest(
      'editing the label in one space propagates across all spaces using the location',
      async ({ apiClient, apiServices, kbnClient }) => {
        const SPACE_ID = `test-space-${uuidv4()}`;
        const SPACE_NAME = `test-space-name ${uuidv4()}`;
        await kbnClient.spaces.create({ id: SPACE_ID, name: SPACE_NAME });
        spacesToCleanUp.push(SPACE_ID);

        const { id: policyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
          `Multi-space policy ${uuidv4()}`,
          ['default', SPACE_ID]
        );
        const [location] = await apiServices.syntheticsPrivateLocations.setTestLocations(
          [policyId],
          ['default', SPACE_ID]
        );

        // Minimal monitor bodies (no `spaces`) so each can be created in its own
        // space — the shared `httpMonitorFixture` pins `spaces: ['default']`,
        // which 400s when POSTing into a non-default space.
        const testSpaceMonitor = await createMonitor(
          apiClient,
          {
            type: 'http',
            urls: 'https://elastic.co',
            name: `Monitor in test space ${uuidv4()}`,
            locations: [location],
          },
          SPACE_ID
        );
        const testSpaceMonitorId = testSpaceMonitor.config_id;

        const defaultSpaceMonitor = await createMonitor(apiClient, {
          type: 'http',
          urls: 'https://elastic.co',
          name: `Monitor in default space ${uuidv4()}`,
          locations: [location],
        });
        const defaultSpaceMonitorId = defaultSpaceMonitor.config_id;

        // edit the label from the test space
        const updatedLabel = 'Updated Private Location Label';
        await editPrivateLocation(
          apiClient,
          location.id,
          { label: updatedLabel, tags: NEW_TAGS },
          { spaceId: SPACE_ID }
        );

        await expectMonitorLocationLabel(
          apiClient,
          defaultSpaceMonitorId,
          location.id,
          updatedLabel
        );
        await expectMonitorLocationLabel(
          apiClient,
          testSpaceMonitorId,
          location.id,
          updatedLabel,
          SPACE_ID
        );

        // find APIs in both spaces see the monitors
        const defaultList = await listMonitors(apiClient, editorHeaders);
        expect(
          (defaultList.body as { monitors: Array<{ id: string }> }).monitors.some(
            (m) => m.id === defaultSpaceMonitorId
          )
        ).toBe(true);

        const testSpaceList = await listMonitors(apiClient, editorHeaders, '', {
          spaceId: SPACE_ID,
        });
        expect(
          (testSpaceList.body as { monitors: Array<{ id: string }> }).monitors.some(
            (m) => m.id === testSpaceMonitorId
          )
        ).toBe(true);

        // edit the label again from the default space and re-verify both spaces
        const updatedLabelDefault = 'Updated Private Location Label Default Space';
        await editPrivateLocation(apiClient, location.id, {
          label: updatedLabelDefault,
          tags: NEW_TAGS,
        });

        await expectMonitorLocationLabel(
          apiClient,
          defaultSpaceMonitorId,
          location.id,
          updatedLabelDefault
        );
        await expectMonitorLocationLabel(
          apiClient,
          testSpaceMonitorId,
          location.id,
          updatedLabelDefault,
          SPACE_ID
        );
      }
    );
  }
);
