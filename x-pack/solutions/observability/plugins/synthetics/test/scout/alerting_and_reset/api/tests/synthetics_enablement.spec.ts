/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, KIBANA_HEADERS, SYNTHETICS_API_URLS } from '../../../common/fixtures';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/synthetics_enablement.ts`.
 *
 * Drives *internal* enablement routes, so it uses cookie-based auth
 * (`samlAuth.asInteractiveUser` + `cookieHeader`) — matching the FTR
 * `roleScopedSupertest(..., { useCookieHeader: true })` usage.
 *
 * The api-key privilege shape differs between stateful (`read_ilm` present)
 * and serverless (no `read_ilm`). We assert a common subset with
 * `expect.arrayContaining(...)` instead of an exact match so a single spec
 * runs in both targets, sacrificing a small amount of FTR parity (exact
 * cluster-privilege list) for a simpler test surface.
 *
 * `isServiceAllowed` is deliberately excluded from response assertions:
 * its value depends on `xpack.uptime.service.manifestUrl` + service
 * credentials in the Kibana config, which differs between Scout stateful
 * (no manifestUrl → `true`) and Scout serverless (manifestUrl set but no
 * credentials → `false`). The FTR suite had `skipMKI` for the same reason.
 *
 * IMPORTANT: Admin and editor sessions are created ONCE in `beforeAll` and
 * reused across all tests, matching the FTR pattern. This ensures the same
 * user identity is used for PUT-enablement and API key queries.
 */

const COMMON_SYNTHETICS_WRITER_CLUSTER_PRIVS = ['monitor', 'read_pipeline'];
const SYNTHETICS_WRITER_INDICES = [
  {
    allow_restricted_indices: false,
    names: ['synthetics-*'],
    privileges: ['view_index_metadata', 'create_doc', 'auto_configure', 'read'],
  },
];

const ENABLED_RESPONSE_ADMIN = {
  areApiKeysEnabled: true,
  canManageApiKeys: true,
  canEnable: true,
  isEnabled: true,
  isValidApiKey: true,
};

const DISABLED_RESPONSE_EDITOR = {
  areApiKeysEnabled: true,
  canManageApiKeys: false,
  canEnable: false,
  isEnabled: false,
  isValidApiKey: false,
};

const ENABLED_RESPONSE_EDITOR = {
  areApiKeysEnabled: true,
  canManageApiKeys: false,
  canEnable: false,
  isEnabled: true,
  isValidApiKey: true,
};

/** Index privileges granted to the synthetics service writer role (`getServiceApiKeyPrivileges(false).indices`). */
const SYNTHETICS_SERVICE_WRITER_INDICES = [
  {
    names: ['synthetics-*'],
    privileges: ['view_index_metadata', 'create_doc', 'auto_configure', 'read'],
  },
];
/** Saved object that stores the synthetics service api key — from `server/saved_objects/service_api_key.ts`. */
const SYNTHETICS_API_KEY_SO_ID = 'ba997842-b0cf-4429-aa9d-578d9bf0d391';
const SYNTHETICS_API_KEY_SO_TYPE = 'uptime-synthetics-api-key';
/** Name the synthetics service uses for its managed api key; the api-key query filters on it. */
const SYNTHETICS_API_KEY_NAME = 'synthetics-api-key (required for Synthetics App)';

apiTest.describe(
  'SyntheticsEnablement',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    interface ApiKey {
      id: string;
      name: string;
      invalidated: boolean;
      role_descriptors: {
        synthetics_writer: {
          cluster: string[];
          indices: Array<Record<string, unknown>>;
        };
      };
    }

    let adminHeaders: Record<string, string>;
    let editorHeaders: Record<string, string>;

    const getApiKeys = async (apiClient: ApiClientFixture): Promise<ApiKey[]> => {
      const res = await apiClient.post('internal/security/api_key/_query', {
        headers: adminHeaders,
        body: {
          query: {
            bool: {
              filter: [
                {
                  term: { name: 'synthetics-api-key (required for Synthetics App)' },
                },
              ],
            },
          },
          sort: { field: 'creation', direction: 'desc' },
          size: 25,
          filters: {},
        },
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      const body = res.body as { apiKeys?: ApiKey[] };
      return (body.apiKeys ?? []).filter(
        (apiKey) => apiKey.name.includes('synthetics-api-key') && apiKey.invalidated === false
      );
    };

    const putEnablement = (
      apiClient: ApiClientFixture,
      headers: Record<string, string>,
      spacePrefix = ''
    ) =>
      apiClient.put(
        `${spacePrefix}${SYNTHETICS_API_URLS.SYNTHETICS_ENABLEMENT}`.replace(/^\//, ''),
        { headers, responseType: 'json' }
      );

    const deleteEnablement = (
      apiClient: ApiClientFixture,
      headers: Record<string, string>,
      spacePrefix = ''
    ) =>
      apiClient.delete(
        `${spacePrefix}${SYNTHETICS_API_URLS.SYNTHETICS_ENABLEMENT}`.replace(/^\//, ''),
        { headers, responseType: 'json' }
      );

    const expectSyntheticsWriterPrivileges = (apiKey: ApiKey) => {
      for (const priv of COMMON_SYNTHETICS_WRITER_CLUSTER_PRIVS) {
        expect(apiKey.role_descriptors.synthetics_writer.cluster).toContain(priv);
      }
      expect(apiKey.role_descriptors.synthetics_writer.indices).toStrictEqual(
        SYNTHETICS_WRITER_INDICES
      );
    };

    // Create admin and editor sessions ONCE, matching FTR's `before` that creates
    // `supertestWithAdminScope` and `supertestWithEditorScope` as reusable instances.
    // This ensures the same user identity is used for enablement and API key queries.
    apiTest.beforeAll(async ({ samlAuth }) => {
      const { cookieHeader: adminCookie } = await samlAuth.asInteractiveUser('admin');
      adminHeaders = { ...KIBANA_HEADERS, ...adminCookie };
      const { cookieHeader: editorCookie } = await samlAuth.asInteractiveUser('editor');
      editorHeaders = { ...KIBANA_HEADERS, ...editorCookie };
    });

    // Match FTR pattern: only delete enablement when API keys exist.
    apiTest.beforeEach(async ({ apiClient }) => {
      const apiKeys = await getApiKeys(apiClient);
      if (apiKeys.length) {
        expect(await deleteEnablement(apiClient, adminHeaders)).toHaveStatusCode(200);
      }
    });

    let spaceToCleanUp: string | null = null;

    apiTest.afterAll(async ({ kbnClient }) => {
      if (spaceToCleanUp) {
        await kbnClient.spaces.delete(spaceToCleanUp).catch(() => {});
        spaceToCleanUp = null;
      }
    });

    apiTest('[PUT] returns response when user cannot manage api keys', async ({ apiClient }) => {
      const res = await putEnablement(apiClient, editorHeaders);
      expect(res).toHaveStatusCode(200);
      expect(res.body).toMatchObject(DISABLED_RESPONSE_EDITOR);
    });

    apiTest('[PUT] returns response for an admin with privilege', async ({ apiClient }) => {
      const res = await putEnablement(apiClient, adminHeaders);
      expect(res).toHaveStatusCode(200);
      expect(res.body).toMatchObject(ENABLED_RESPONSE_ADMIN);
      const validApiKeys = await getApiKeys(apiClient);
      expect(validApiKeys).toHaveLength(1);
      expectSyntheticsWriterPrivileges(validApiKeys[0]);
    });

    apiTest('[PUT] does not create excess api keys', async ({ apiClient }) => {
      const first = await putEnablement(apiClient, adminHeaders);
      expect(first).toHaveStatusCode(200);
      const afterFirst = await getApiKeys(apiClient);
      expect(afterFirst).toHaveLength(1);
      expectSyntheticsWriterPrivileges(afterFirst[0]);

      const second = await putEnablement(apiClient, adminHeaders);
      expect(second).toHaveStatusCode(200);
      const afterSecond = await getApiKeys(apiClient);
      expect(afterSecond).toHaveLength(1);
      expectSyntheticsWriterPrivileges(afterSecond[0]);
    });

    apiTest('[PUT] auto re-enables api key when invalidated', async ({ apiClient }) => {
      const enable = await putEnablement(apiClient, adminHeaders);
      expect(enable).toHaveStatusCode(200);

      const valid = await getApiKeys(apiClient);
      expect(valid).toHaveLength(1);
      expectSyntheticsWriterPrivileges(valid[0]);

      const invalidate = await apiClient.post('internal/security/api_key/invalidate', {
        headers: adminHeaders,
        body: {
          apiKeys: valid.map(({ id, name }) => ({ id, name })),
          isAdmin: true,
        },
        responseType: 'json',
      });
      expect(invalidate).toHaveStatusCode(200);
      expect(await getApiKeys(apiClient)).toHaveLength(0);

      const reEnable = await putEnablement(apiClient, adminHeaders);
      expect(reEnable).toHaveStatusCode(200);

      const recreated = await getApiKeys(apiClient);
      expect(recreated).toHaveLength(1);
      expectSyntheticsWriterPrivileges(recreated[0]);
    });

    apiTest(
      '[PUT] returns response for an uptime all user without admin privileges',
      async ({ apiClient }) => {
        const res = await putEnablement(apiClient, editorHeaders);
        expect(res).toHaveStatusCode(200);
        expect(res.body).toMatchObject(DISABLED_RESPONSE_EDITOR);
      }
    );

    // A user with `uptime: all` plus any one of the api-key management cluster
    // privileges can *manage* api keys (`canManageApiKeys: true`) but still
    // cannot *enable* synthetics — that requires the full synthetics-writer
    // cluster privileges. These cases use a per-test custom role + cookie
    // session because the FTR original ran them as bespoke ES users.
    (['manage_security', 'manage_api_key', 'manage_own_api_key'] as const).forEach((privilege) => {
      apiTest(
        `[PUT] returns response when user can manage api keys via ${privilege}`,
        async ({ apiClient, samlAuth }) => {
          const { cookieHeader } = await samlAuth.asInteractiveUser({
            elasticsearch: {
              cluster: [privilege],
              indices: SYNTHETICS_SERVICE_WRITER_INDICES,
            },
            kibana: [{ base: [], feature: { uptime: ['all'] }, spaces: ['*'] }],
          });
          const res = await putEnablement(apiClient, { ...KIBANA_HEADERS, ...cookieHeader });
          expect(res).toHaveStatusCode(200);
          expect(res.body).toMatchObject({
            areApiKeysEnabled: true,
            canManageApiKeys: true,
            canEnable: false,
            isEnabled: false,
            isValidApiKey: false,
          });
        }
      );
    });

    // A user with the full synthetics-writer ES privileges plus `uptime: all`
    // but WITHOUT any api-key management cluster privilege can still *enable*
    // synthetics, reporting `canManageApiKeys: false`. Ported from the FTR
    // `returns response for an admin with privilege` case (which used a bespoke
    // ES role without `manage_*`). The created key's privileges are asserted via
    // the cross-target-safe `expectSyntheticsWriterPrivileges` helper rather than
    // an exact `role_descriptors` match, consistent with the rest of this suite.
    apiTest(
      '[PUT] enables synthetics for a writer user without api-key management privileges',
      async ({ apiClient, samlAuth, config }) => {
        // `canEnable` requires the user to hold the synthetics-writer cluster
        // privileges for the *current* target. Mirror `getServiceApiKeyPrivileges`:
        // `read_ilm` is required on stateful but rejected by ES on serverless.
        const writerCluster = config.serverless
          ? COMMON_SYNTHETICS_WRITER_CLUSTER_PRIVS
          : [...COMMON_SYNTHETICS_WRITER_CLUSTER_PRIVS, 'read_ilm'];
        const { cookieHeader } = await samlAuth.asInteractiveUser({
          elasticsearch: {
            cluster: writerCluster,
            indices: SYNTHETICS_SERVICE_WRITER_INDICES,
          },
          kibana: [{ base: [], feature: { uptime: ['all'] }, spaces: ['*'] }],
        });
        const res = await putEnablement(apiClient, { ...KIBANA_HEADERS, ...cookieHeader });
        expect(res).toHaveStatusCode(200);
        expect(res.body).toMatchObject({
          areApiKeysEnabled: true,
          canManageApiKeys: false,
          canEnable: true,
          isEnabled: true,
          isValidApiKey: true,
        });
        const validApiKeys = await getApiKeys(apiClient);
        expect(validApiKeys).toHaveLength(1);
        expectSyntheticsWriterPrivileges(validApiKeys[0]);
      }
    );

    apiTest(
      '[PUT] auto re-enables the api key when the existing key has invalid permissions',
      async ({ apiClient, esClient, kbnClient }) => {
        // Seed an existing service api key with *incomplete* index privileges
        // (missing `read`), simulating a key created before privileges changed,
        // and point the service saved object at it.
        const invalidKey = await esClient.security.createApiKey({
          name: SYNTHETICS_API_KEY_NAME,
          expiration: '1d',
          role_descriptors: {
            'role-a': {
              // The key is *invalid* purely because the index privileges below omit
              // `read`; cluster privileges are irrelevant here. Use the common
              // serverless-safe subset (no `read_ilm`, which ES rejects on serverless).
              cluster: COMMON_SYNTHETICS_WRITER_CLUSTER_PRIVS,
              indices: [
                {
                  names: ['synthetics-*'],
                  privileges: ['view_index_metadata', 'create_doc', 'auto_configure'],
                },
              ],
            },
          },
        });
        await kbnClient.savedObjects.create({
          id: SYNTHETICS_API_KEY_SO_ID,
          type: SYNTHETICS_API_KEY_SO_TYPE,
          overwrite: true,
          attributes: {
            id: invalidKey.id,
            name: SYNTHETICS_API_KEY_NAME,
            apiKey: invalidKey.api_key,
          },
        });

        const before = await getApiKeys(apiClient);
        expect(before).toHaveLength(1);
        expect(
          (before[0].role_descriptors as Record<string, unknown>).synthetics_writer
        ).toBeUndefined();

        const res = await putEnablement(apiClient, adminHeaders);
        expect(res).toHaveStatusCode(200);
        expect(res.body).toMatchObject(ENABLED_RESPONSE_ADMIN);

        // The invalid key is invalidated and a fresh key with the correct
        // synthetics-writer privileges is created in its place.
        const after = await getApiKeys(apiClient);
        expect(after).toHaveLength(1);
        expectSyntheticsWriterPrivileges(after[0]);
      }
    );

    apiTest('[DELETE] is idempotent when already disabled', async ({ apiClient }) => {
      const res = await deleteEnablement(apiClient, adminHeaders);
      expect(res).toHaveStatusCode(200);
    });

    apiTest('[DELETE] is idempotent across consecutive deletes', async ({ apiClient }) => {
      expect(await putEnablement(apiClient, adminHeaders)).toHaveStatusCode(200);
      const firstDelete = await deleteEnablement(apiClient, adminHeaders);
      expect(firstDelete).toHaveStatusCode(200);
      const secondDelete = await deleteEnablement(apiClient, adminHeaders);
      expect(secondDelete).toHaveStatusCode(200);
    });

    apiTest('[DELETE] with an admin', async ({ apiClient }) => {
      expect(await putEnablement(apiClient, adminHeaders)).toHaveStatusCode(200);
      const del = await deleteEnablement(apiClient, adminHeaders);
      expect(del).toHaveStatusCode(200);
      const reEnable = await putEnablement(apiClient, adminHeaders);
      expect(reEnable).toHaveStatusCode(200);
      expect(reEnable.body).toMatchObject(ENABLED_RESPONSE_ADMIN);
    });

    apiTest('[DELETE] with an uptime user', async ({ apiClient }) => {
      expect(await putEnablement(apiClient, adminHeaders)).toHaveStatusCode(200);
      expect(await deleteEnablement(apiClient, editorHeaders)).toHaveStatusCode(403);

      const editorPut = await putEnablement(apiClient, editorHeaders);
      expect(editorPut).toHaveStatusCode(200);
      expect(editorPut.body).toMatchObject(ENABLED_RESPONSE_EDITOR);
    });

    apiTest('[DELETE] is space agnostic', async ({ apiClient, kbnClient }) => {
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name-${uuidv4()}`;
      spaceToCleanUp = SPACE_ID;
      await kbnClient.spaces.create({ id: SPACE_ID, name: SPACE_NAME });

      const enableInSpace = await putEnablement(apiClient, adminHeaders, `/s/${SPACE_ID}`);
      expect(enableInSpace).toHaveStatusCode(200);
      expect(enableInSpace.body).toMatchObject(ENABLED_RESPONSE_ADMIN);

      expect(await putEnablement(apiClient, adminHeaders, `/s/${SPACE_ID}`)).toHaveStatusCode(200);
      expect(await deleteEnablement(apiClient, adminHeaders)).toHaveStatusCode(200);
      expect(await putEnablement(apiClient, adminHeaders)).toHaveStatusCode(200);

      expect(await putEnablement(apiClient, adminHeaders)).toHaveStatusCode(200);
      expect(await deleteEnablement(apiClient, adminHeaders, `/s/${SPACE_ID}`)).toHaveStatusCode(
        200
      );
      const enableDefault = await putEnablement(apiClient, adminHeaders);
      expect(enableDefault).toHaveStatusCode(200);
      expect(enableDefault.body).toMatchObject(ENABLED_RESPONSE_ADMIN);
    });
  }
);
