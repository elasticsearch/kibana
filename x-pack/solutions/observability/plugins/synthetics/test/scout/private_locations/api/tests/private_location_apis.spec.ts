/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture, KbnClient, KibanaRole } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import {
  legacyPrivateLocationsSavedObjectId,
  legacyPrivateLocationsSavedObjectName,
  privateLocationSavedObjectName,
} from '../../../../../common/saved_objects/private_locations';
import { apiTest, mergeSyntheticsApiHeaders, PUBLIC_API_VERSION } from '../../../common/fixtures';

interface PrivateLocationInput {
  label: string;
  agentPolicyId: string;
  geo: { lat: number; lon: number };
  spaces?: string[];
}

interface ListedPrivateLocation {
  id: string;
  label: string;
  spaces?: string[];
}

/** Kibana-only role with the uptime feature but *without* the
 *  `can_manage_private_locations` sub-feature — mirrors the FTR
 *  `addsNewSpace(['minimal_all'])` user. */
const UPTIME_MINIMAL_ALL_ROLE: KibanaRole = {
  elasticsearch: { cluster: [] },
  kibana: [{ base: [], feature: { uptime: ['minimal_all'], slo: ['all'] }, spaces: ['*'] }],
};

/** Same as above plus `can_manage_private_locations` — mirrors
 *  `addsNewSpace(['minimal_all', 'can_manage_private_locations'])`. */
const UPTIME_CAN_MANAGE_ROLE: KibanaRole = {
  elasticsearch: { cluster: [] },
  kibana: [
    {
      base: [],
      feature: { uptime: ['minimal_all', 'can_manage_private_locations'], slo: ['all'] },
      spaces: ['*'],
    },
  ],
};

const privateLocationsPath = (spaceId?: string) =>
  spaceId ? `s/${spaceId}/api/synthetics/private_locations` : 'api/synthetics/private_locations';

const postPrivateLocation = (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  location: PrivateLocationInput,
  opts: { spaceId?: string } = {}
) =>
  apiClient.post(privateLocationsPath(opts.spaceId), {
    headers: { ...headers, 'elastic-api-version': PUBLIC_API_VERSION },
    body: location,
    responseType: 'json',
  });

const listPrivateLocations = async (
  apiClient: ApiClientFixture,
  headers: Record<string, string>
): Promise<ListedPrivateLocation[]> => {
  const res = await apiClient.get(privateLocationsPath(), {
    headers: { ...headers, 'elastic-api-version': PUBLIC_API_VERSION },
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(200);
  return res.body as ListedPrivateLocation[];
};

let locationCounter = 0;
const getLocation = (agentPolicyId: string, spaces?: string[]): PrivateLocationInput => ({
  label: `Test private location ${++locationCounter}`,
  agentPolicyId,
  geo: { lat: 0, lon: 0 },
  ...(spaces ? { spaces } : {}),
});

/**
 * Seed two Fleet agent policies and the *legacy* private-locations singleton
 * saved object pointing at them. Mirrors the FTR
 * `PrivateLocationTestService.addLegacyPrivateLocations`; the synthetics plugin
 * migrates this singleton to the new per-location SO type on the next read.
 */
const addLegacyPrivateLocations = async (
  kbnClient: KbnClient,
  addFleetPolicy: (name: string, spaceIds?: string[]) => Promise<{ id: string }>
) => {
  const fleetPolicy = await addFleetPolicy(`Legacy fleet policy 1 ${uuidv4()}`);
  const fleetPolicy2 = await addFleetPolicy(`Legacy fleet policy 2 ${uuidv4()}`);

  const locations = [
    {
      id: fleetPolicy.id,
      agentPolicyId: fleetPolicy.id,
      name: 'Test private location 1',
      lat: 0,
      lon: 0,
    },
    {
      id: fleetPolicy2.id,
      agentPolicyId: fleetPolicy2.id,
      name: 'Test private location 2',
      lat: 0,
      lon: 0,
    },
  ];

  await kbnClient.savedObjects.create({
    type: legacyPrivateLocationsSavedObjectName,
    id: legacyPrivateLocationsSavedObjectId,
    overwrite: true,
    attributes: { locations },
  });

  return locations;
};

apiTest.describe('PrivateLocationAPI', { tag: tags.stateful.classic }, () => {
  let adminHeaders: Record<string, string>;
  let minimalAllHeaders: Record<string, string>;
  let canManageHeaders: Record<string, string>;
  const createdSpaces: string[] = [];

  apiTest.beforeAll(async ({ apiServices, requestAuth, kbnClient }) => {
    await kbnClient.savedObjects.clean({
      types: [legacyPrivateLocationsSavedObjectName, privateLocationSavedObjectName],
    });
    await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();

    // Seed the legacy private-locations singleton (FTR `adds a test legacy
    // private location`); the plugin migrates it to the new per-location SO
    // type on the next read.
    const legacyLocations = await addLegacyPrivateLocations(
      kbnClient,
      apiServices.syntheticsPrivateLocations.addFleetPolicy
    );
    expect(legacyLocations).toHaveLength(2);

    const { apiKeyHeader: adminKey } = await requestAuth.getApiKeyForAdmin();
    adminHeaders = mergeSyntheticsApiHeaders(adminKey, { Accept: 'application/json' });
    const { apiKeyHeader: minimalKey } = await requestAuth.getApiKeyForCustomRole(
      UPTIME_MINIMAL_ALL_ROLE
    );
    minimalAllHeaders = mergeSyntheticsApiHeaders(minimalKey, { Accept: 'application/json' });
    const { apiKeyHeader: canManageKey } = await requestAuth.getApiKeyForCustomRole(
      UPTIME_CAN_MANAGE_ROLE
    );
    canManageHeaders = mergeSyntheticsApiHeaders(canManageKey, { Accept: 'application/json' });
  });

  apiTest.afterAll(async ({ apiServices, kbnClient }) => {
    await kbnClient.savedObjects.clean({
      types: [legacyPrivateLocationsSavedObjectName, privateLocationSavedObjectName],
    });
    await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    for (const spaceId of createdSpaces) {
      await kbnClient.spaces.delete(spaceId).catch(() => {});
    }
  });

  const newSpace = async (kbnClient: KbnClient): Promise<string> => {
    const spaceId = `test-space-${uuidv4()}`;
    await kbnClient.spaces.create({ id: spaceId, name: `test-space-name ${uuidv4()}` });
    createdSpaces.push(spaceId);
    return spaceId;
  };

  apiTest('adds a test private location', async ({ apiClient, apiServices }) => {
    const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
      `Fleet policy ${uuidv4()}`
    );
    const res = await postPrivateLocation(apiClient, adminHeaders, getLocation(agentPolicyId));
    expect(res).toHaveStatusCode(200);
  });

  apiTest(
    'lists all locations and migrates the legacy singleton to the new saved object type',
    async ({ apiClient, kbnClient }) => {
      // The two seeded legacy locations plus the one created above; reading the
      // list triggers the legacy -> new SO migration.
      const locations = await listPrivateLocations(apiClient, adminHeaders);
      expect(locations).toHaveLength(3);

      const newData = await kbnClient.savedObjects.find({ type: privateLocationSavedObjectName });
      expect(newData.saved_objects).toHaveLength(3);

      // The legacy singleton is removed once it has been migrated to the new type.
      const legacyData = await kbnClient.savedObjects.find({
        type: legacyPrivateLocationsSavedObjectName,
      });
      expect(legacyData.saved_objects).toHaveLength(0);
    }
  );

  apiTest(
    'cannot create private location if privileges are missing',
    async ({ apiClient, apiServices }) => {
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`
      );
      const res = await postPrivateLocation(
        apiClient,
        minimalAllHeaders,
        getLocation(agentPolicyId)
      );
      expect(res).toHaveStatusCode(403);
    }
  );

  apiTest(
    'can create private location if privileges are added',
    async ({ apiClient, apiServices }) => {
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`
      );
      const res = await postPrivateLocation(
        apiClient,
        canManageHeaders,
        getLocation(agentPolicyId)
      );
      expect(res).toHaveStatusCode(200);
    }
  );

  apiTest('can delete private location if privileges are added', async ({ apiClient }) => {
    const locations = await listPrivateLocations(apiClient, canManageHeaders);
    for (const location of locations) {
      const res = await apiClient.delete(`${privateLocationsPath()}/${location.id}`, {
        headers: { ...canManageHeaders, 'elastic-api-version': PUBLIC_API_VERSION },
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
    }
  });

  apiTest(
    'can create private location in multiple spaces',
    async ({ apiClient, apiServices, kbnClient }) => {
      const spaceId = await newSpace(kbnClient);
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`,
        ['default', spaceId]
      );
      const res = await postPrivateLocation(
        apiClient,
        adminHeaders,
        getLocation(agentPolicyId, [spaceId, 'default'])
      );
      expect(res).toHaveStatusCode(200);
    }
  );

  apiTest(
    'creates private location in agent policy spaces if no spaces are defined for the location',
    async ({ apiClient, apiServices, kbnClient }) => {
      const spaceId = await newSpace(kbnClient);
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`,
        ['default', spaceId]
      );
      const res = await postPrivateLocation(apiClient, adminHeaders, getLocation(agentPolicyId));
      expect(res).toHaveStatusCode(200);
      expect((res.body as ListedPrivateLocation).spaces).toStrictEqual(['default', spaceId]);
    }
  );

  apiTest(
    'creates private location in agent policy spaces if locations spaces is an empty array',
    async ({ apiClient, apiServices, kbnClient }) => {
      const spaceId = await newSpace(kbnClient);
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`,
        ['default', spaceId]
      );
      const res = await postPrivateLocation(
        apiClient,
        adminHeaders,
        getLocation(agentPolicyId, [])
      );
      expect(res).toHaveStatusCode(200);
      expect((res.body as ListedPrivateLocation).spaces).toStrictEqual(['default', spaceId]);
    }
  );

  apiTest(
    'validation errors works in multiple spaces as well',
    async ({ apiClient, apiServices, kbnClient }) => {
      const spaceId = await newSpace(kbnClient);
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`,
        ['default', spaceId]
      );
      const location = getLocation(agentPolicyId, [spaceId, 'default']);
      const res = await postPrivateLocation(apiClient, adminHeaders, location);
      expect(res).toHaveStatusCode(200);

      const res1 = await postPrivateLocation(apiClient, canManageHeaders, {
        ...location,
        spaces: [spaceId],
      });
      expect(res1).toHaveStatusCode(400);
    }
  );

  apiTest(
    'cannot create private location in multiple spaces if the agent policy does not belong to those spaces',
    async ({ apiClient, apiServices, kbnClient }) => {
      const spaceId = await newSpace(kbnClient);
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`
      );
      const res = await postPrivateLocation(
        apiClient,
        adminHeaders,
        getLocation(agentPolicyId, [spaceId, 'default'])
      );
      expect(res).toHaveStatusCode(400);
      expect((res.body as { message: string }).message).toBe(
        `Invalid spaces. Private location spaces [${spaceId}, default] must be fully contained within agent policy ${agentPolicyId} spaces [default].`
      );
    }
  );

  apiTest(
    'can create private location in any space if agent policy has "*" space id',
    async ({ apiClient, apiServices, kbnClient }) => {
      const spaceId = await newSpace(kbnClient);
      const { id: agentPolicyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet policy ${uuidv4()}`,
        ['*']
      );
      const res = await postPrivateLocation(
        apiClient,
        adminHeaders,
        getLocation(agentPolicyId, [spaceId])
      );
      expect(res).toHaveStatusCode(200);
    }
  );
});
