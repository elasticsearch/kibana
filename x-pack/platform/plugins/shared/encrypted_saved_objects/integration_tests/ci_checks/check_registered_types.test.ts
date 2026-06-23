/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sortBy } from 'lodash';

import type { Root } from '@kbn/core-root-server-internal';
import type { ISavedObjectTypeRegistry } from '@kbn/core-saved-objects-server';
import {
  createRootWithCorePlugins,
  createTestServers,
  type TestElasticsearchUtils,
} from '@kbn/core-test-helpers-kbn-server';
import { extractMigrationInfo } from '@kbn/core-test-helpers-so-type-serializer';

import type { EncryptedSavedObjectsService } from '../../server/crypto';
import * as EncryptedSavedObjectsModule from '../../server/saved_objects';

// This will only change if new ESOs are introduced. This number should never get smaller.
export const ESO_TYPES_COUNT = 24 as const;

describe('checking changes on all registered encrypted SO types', () => {
  let esServer: TestElasticsearchUtils;
  let root: Root;
  let typeRegistry: ISavedObjectTypeRegistry;
  let esoService: EncryptedSavedObjectsService;

  beforeAll(async () => {
    // the ESO service is passed to the setupSavedObjects function, so we can obtain it by spying on this call.
    // Normally this service is not accessible outside of the ESO plugin.
    const setupSavedObjectsSpy = jest.spyOn(EncryptedSavedObjectsModule, 'setupSavedObjects');

    const { startES } = createTestServers({
      adjustTimeout: (t: number) => jest.setTimeout(t),
    });

    esServer = await startES();
    root = createRootWithCorePlugins({}, { oss: false });
    await root.preboot();
    await root.setup();
    const coreStart = await root.start();
    typeRegistry = coreStart.savedObjects.getTypeRegistry();
    esoService = setupSavedObjectsSpy.mock.calls[0][0].service as EncryptedSavedObjectsService;
  });

  afterAll(async () => {
    if (root) {
      await root.shutdown();
    }
    if (esServer) {
      await esServer.stop();
    }
  });

  // This test is meant to fail when any change is made to ESO registrations (change or addition).
  // Just update the snapshot by running this test file via jest_integration with `-u` and push the update.
  // The intent is to trigger a code review from the Kibana Security team to review the ESO changes.
  // The number of types in the hashMap should never be reduced, it should only increase.
  it('detecting changes to encryption registration definitions', () => {
    const hashMap = esoService.getRegisteredTypeHashMap();

    expect(hashMap).toMatchInlineSnapshot(`
      Object {
        "action": "1246557bd7101a6f8f732c6fe2fcebb582b2dfb6154816c43cce224ceaee4239",
        "action_task_params": "06aa563283bdcd5c07ec433a7d0b8425019ad11d75595ee1431691667ecd2cec",
        "ad_hoc_run_params": "6539367aa4ae8340c62f123c3457c6b8d7873c92de68651c70d41028dfe7ed32",
        "alert": "878a3b83179bbf2ad9d3862fcba539b7066429869b14c120a1dc7a8d39f4a7fa",
        "anonymization-salt": "1e5ff6ba241b27bbfc6901898b0ece9327ba63fdaea1f2f6cba6344d4a425b43",
        "api_key_pending_invalidation": "4dafadadaaca2f2f3f6038ee8363b71b2d101371ca98c34d2b6aa2a96f7e71c5",
        "api_key_to_invalidate": "d7a3423a74032bb5ecce9a0975e8ea1d5d5171348f99173df54b2fa0dfd3de43",
        "cloud-connect-api-key": "8c0ae7a780c411145ae4aaf7a70235672c9ccfb56d011c322da3c4eeb258f32d",
        "connector_token": "e446f5ff0fbf516f63398e474f126332b4c31e316daa613c6cb8c863400110c5",
        "entity-discovery-api-key": "cd3b5230a513d2d3503583223e48362fbbbc7812aa4710579a62acfa5bbc30e6",
        "fleet-fleet-server-host": "3b8d0809aaf8a133596307bc29328207c7ceee1dc72233da75141ec47ad8d327",
        "fleet-message-signing-keys": "5cdcf6bf85247267f8876bda4226e871dbfefe01f050e898db7cbc267d57a275",
        "fleet-uninstall-tokens": "6e7d75921dcce46e566f175eab1b0e3825fe565f20cdb3c984e7037934d61e23",
        "ingest-download-sources": "b3740796eab0a91736e43bd22f7489cbf6f2ad0241ae370d1c8195b6a8d8ad52",
        "ingest-outputs": "d66716d5333484a25c57f7917bead5ac2576ec57a4b9eb61701b573f35ab62ad",
        "oauth_state": "b01289e5c133db9d4d802a2b838e43cce4a8399566dedb21de551da57c88894a",
        "privmon-api-key": "7d7b76b3bc5287a784518731ba66d4f761052177fc04b1a85e5605846ab9de42",
        "synthetics-monitor": "f1c060b7be3b30187c4adcb35d74f1fa8a4290bd7faf04fec869de2aa387e21b",
        "synthetics-monitor-multi-space": "39c4c6abd28c4173f77c1c89306e92b6b92492c0029274e10620a170be4d4a67",
        "synthetics-param": "747ba9d1b7addf5b131713abe7868bd767af6ce0cf8b6b0f335f4ef34b280c7e",
        "task": "d6cc30871dc78caf3f451de1275a3803879ec9935b4a2e34076dee56878c228f",
        "uptime-synthetics-api-key": "5ca81f180763e85397fa8c6508adcd60efd0f916e29bac6dcd5b4564f1db7375",
        "user_connector_token": "b443b022b46b79c0ff9fa674aecc64176a5fcbd09c2db2d9f050a6a88435732e",
        "watchlist-entity-source": "9e6445feba401a9b6d44c412d8fe9a069e051ea2483570c03ef17b5cf5e718d7",
      }
    `);
    expect(Object.keys(hashMap).length).toEqual(ESO_TYPES_COUNT);
  });

  // This test is meant to fail and require an update when a new model version is introduced to any ESO types.
  // Just update the snapshot by running this test file via jest_integration with `-u` and push the update.
  // There are tests in core which will catch when an SO type is changed, and help the Core team enforce when
  // a model version needs to be added. This purpose of this test is to ensure that new model versions for ESOs
  // are implemented to the security team's guidelines to adhere to all zero-downtime upgrade considerations.
  it('detecting new model versions in registered encrypted types', () => {
    const esoTypes = esoService.getRegisteredTypes();
    const soTypestoCheck = typeRegistry
      .getAllTypes()
      .filter((soType) => esoTypes.includes(soType.name));

    const modelVersionMap: string[] = sortBy(soTypestoCheck, 'name').flatMap((type, index) => {
      const typeMigrationInfo = sortBy(extractMigrationInfo(type).modelVersions, 'version')
        .reverse()
        .map((mv) => `${type.name}|${mv.version}`);

      return typeMigrationInfo;
    });

    expect(modelVersionMap).toMatchInlineSnapshot(`
      Array [
        "action|2",
        "action|1",
        "action_task_params|2",
        "action_task_params|1",
        "ad_hoc_run_params|3",
        "ad_hoc_run_params|2",
        "ad_hoc_run_params|1",
        "alert|9",
        "alert|8",
        "alert|7",
        "alert|6",
        "alert|5",
        "alert|4",
        "alert|3",
        "alert|2",
        "alert|13",
        "alert|12",
        "alert|11",
        "alert|10",
        "alert|1",
        "anonymization-salt|1",
        "api_key_pending_invalidation|2",
        "api_key_pending_invalidation|1",
        "api_key_to_invalidate|2",
        "api_key_to_invalidate|1",
        "cloud-connect-api-key|1",
        "connector_token|2",
        "connector_token|1",
        "fleet-fleet-server-host|2",
        "fleet-fleet-server-host|1",
        "fleet-uninstall-tokens|1",
        "ingest-download-sources|1",
        "ingest-outputs|9",
        "ingest-outputs|8",
        "ingest-outputs|7",
        "ingest-outputs|6",
        "ingest-outputs|5",
        "ingest-outputs|4",
        "ingest-outputs|3",
        "ingest-outputs|2",
        "ingest-outputs|10",
        "ingest-outputs|1",
        "oauth_state|1",
        "synthetics-monitor|2",
        "synthetics-monitor|1",
        "task|9",
        "task|8",
        "task|7",
        "task|6",
        "task|5",
        "task|4",
        "task|3",
        "task|2",
        "task|11",
        "task|10",
        "task|1",
        "user_connector_token|1",
        "watchlist-entity-source|3",
        "watchlist-entity-source|2",
        "watchlist-entity-source|1",
      ]
    `);
  });
});
