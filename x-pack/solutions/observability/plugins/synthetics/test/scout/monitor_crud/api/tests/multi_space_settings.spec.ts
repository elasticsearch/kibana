/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, KIBANA_HEADERS, SYNTHETICS_API_URLS } from '../../../common/fixtures';

const SO_TYPE = 'synthetics-settings-multi-space';
const SECOND_SPACE_ID = 'ccs-second-space';
const SECOND_SPACE_NAME = 'CCS Test Space';
const ALL_SPACES = '*';

interface MultiSpaceSettingsResponse {
  useAllRemoteClusters: boolean;
  selectedRemoteClusters: string[];
  spaces: string[];
}

interface FindResponse {
  total: number;
  saved_objects: Array<{ id: string; namespaces?: string[] }>;
}

const settingsUrl = (spaceId?: string) =>
  `${spaceId ? `s/${spaceId}/` : ''}${SYNTHETICS_API_URLS.MULTI_SPACE_SETTINGS.replace(/^\//, '')}`;

// `kbnClient.savedObjects.clean` is space-scoped, so an SO that lives only in `*`
// or in a non-default space can slip through. Find globally and force-delete each
// hit instead.
const cleanSettings = async (kbnClient: KbnClient) => {
  const { data } = await kbnClient.request<FindResponse>({
    method: 'GET',
    path: '/api/saved_objects/_find',
    query: { type: SO_TYPE, per_page: 100, namespaces: ALL_SPACES },
  });
  await Promise.all(
    data.saved_objects.map(({ id, namespaces }) => {
      // A multi-namespace SO visible only outside the current space is rejected by the
      // delete preflight check before `force` is honored, so scope the request to one of
      // the SO's own spaces (any non-`*` namespace) for the delete to resolve.
      const namespace = namespaces?.find((ns) => ns !== ALL_SPACES);
      const spacePrefix = namespace && namespace !== 'default' ? `s/${namespace}/` : '';
      return kbnClient
        .request({
          method: 'DELETE',
          path: `${spacePrefix}api/saved_objects/${SO_TYPE}/${id}`,
          query: { force: true },
        })
        .catch(() => {});
    })
  );
};

const findSettingsAcrossSpaces = async (kbnClient: KbnClient): Promise<FindResponse> => {
  const { data } = await kbnClient.request<FindResponse>({
    method: 'GET',
    path: '/api/saved_objects/_find',
    query: { type: SO_TYPE, per_page: 100, namespaces: ALL_SPACES },
  });
  return data;
};

apiTest.describe(
  'Synthetics multi-space settings',
  // Only stateful: the endpoints are gated by `!isServerless && isCCSEnabled`,
  // so they return 404 on serverless regardless of the flag.
  { tag: tags.stateful.classic },
  () => {
    let editorHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ samlAuth, kbnClient }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('editor');
      editorHeaders = { ...KIBANA_HEADERS, ...cookieHeader };
      await kbnClient.spaces
        .create({ id: SECOND_SPACE_ID, name: SECOND_SPACE_NAME })
        .catch(() => {});
    });

    apiTest.beforeEach(async ({ kbnClient }) => {
      await cleanSettings(kbnClient);
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await cleanSettings(kbnClient);
      await kbnClient.spaces.delete(SECOND_SPACE_ID).catch(() => {});
    });

    apiTest(
      '[GET] returns defaults anchored to the current space when no SO exists',
      async ({ apiClient }) => {
        const res = await apiClient.get(settingsUrl(), {
          headers: editorHeaders,
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        expect(res.body as MultiSpaceSettingsResponse).toMatchObject({
          useAllRemoteClusters: false,
          selectedRemoteClusters: [],
          spaces: ['default'],
        });
      }
    );

    apiTest(
      '[PUT] creates exactly one SO and persists the requested attributes',
      async ({ apiClient, kbnClient }) => {
        const putRes = await apiClient.put(settingsUrl(), {
          headers: editorHeaders,
          body: {
            useAllRemoteClusters: true,
            selectedRemoteClusters: ['cluster_a'],
            spaces: ['default'],
          },
          responseType: 'json',
        });

        expect(putRes).toHaveStatusCode(200);
        expect(putRes.body as MultiSpaceSettingsResponse).toMatchObject({
          useAllRemoteClusters: true,
          selectedRemoteClusters: ['cluster_a'],
          spaces: ['default'],
        });

        const find = await findSettingsAcrossSpaces(kbnClient);
        expect(find.total).toBe(1);
      }
    );

    apiTest(
      '[PUT] remains a singleton even when the saves come from different spaces',
      async ({ apiClient, kbnClient }) => {
        const fromDefault = await apiClient.put(settingsUrl(), {
          headers: editorHeaders,
          body: {
            useAllRemoteClusters: true,
            selectedRemoteClusters: [],
            spaces: ['default'],
          },
          responseType: 'json',
        });
        expect(fromDefault).toHaveStatusCode(200);

        const fromOther = await apiClient.put(settingsUrl(SECOND_SPACE_ID), {
          headers: editorHeaders,
          body: {
            useAllRemoteClusters: false,
            selectedRemoteClusters: ['cluster_x'],
            spaces: [SECOND_SPACE_ID],
          },
          responseType: 'json',
        });
        expect(fromOther).toHaveStatusCode(200);

        const find = await findSettingsAcrossSpaces(kbnClient);
        expect(find.total).toBe(1);
      }
    );

    apiTest(
      '[GET] returns the SO from another space when shared via ALL_SPACES',
      async ({ apiClient }) => {
        await apiClient.put(settingsUrl(), {
          headers: editorHeaders,
          body: {
            useAllRemoteClusters: true,
            selectedRemoteClusters: ['cluster_a'],
            spaces: [ALL_SPACES],
          },
          responseType: 'json',
        });

        const inOther = await apiClient.get(settingsUrl(SECOND_SPACE_ID), {
          headers: editorHeaders,
          responseType: 'json',
        });

        expect(inOther).toHaveStatusCode(200);
        expect(inOther.body as MultiSpaceSettingsResponse).toMatchObject({
          useAllRemoteClusters: true,
          selectedRemoteClusters: ['cluster_a'],
          spaces: [ALL_SPACES],
        });
      }
    );

    apiTest('[PUT] removing a space hides the settings from that space', async ({ apiClient }) => {
      // Start shared with every space
      await apiClient.put(settingsUrl(), {
        headers: editorHeaders,
        body: {
          useAllRemoteClusters: true,
          selectedRemoteClusters: ['cluster_a'],
          spaces: [ALL_SPACES],
        },
        responseType: 'json',
      });

      // Pin to `default` only
      const pinned = await apiClient.put(settingsUrl(), {
        headers: editorHeaders,
        body: {
          useAllRemoteClusters: true,
          selectedRemoteClusters: ['cluster_a'],
          spaces: ['default'],
        },
        responseType: 'json',
      });
      expect(pinned).toHaveStatusCode(200);
      expect(pinned.body as MultiSpaceSettingsResponse).toMatchObject({
        spaces: ['default'],
      });

      // The second space should now see defaults
      const inOther = await apiClient.get(settingsUrl(SECOND_SPACE_ID), {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(inOther.body as MultiSpaceSettingsResponse).toMatchObject({
        useAllRemoteClusters: false,
        selectedRemoteClusters: [],
        spaces: [SECOND_SPACE_ID],
      });
    });

    apiTest(
      '[PUT] from a space that does not own the SO still updates the singleton',
      async ({ apiClient }) => {
        // Seed in the second space only
        await apiClient.put(settingsUrl(SECOND_SPACE_ID), {
          headers: editorHeaders,
          body: {
            useAllRemoteClusters: true,
            selectedRemoteClusters: ['cluster_a'],
            spaces: [SECOND_SPACE_ID],
          },
          responseType: 'json',
        });

        // Save from default: the SO isn't visible here, but the repository must
        // still update it via a namespace-scoped client (asScopedToNamespace).
        const fromDefault = await apiClient.put(settingsUrl(), {
          headers: editorHeaders,
          body: {
            useAllRemoteClusters: false,
            selectedRemoteClusters: ['cluster_b'],
            spaces: ['default'],
          },
          responseType: 'json',
        });
        expect(fromDefault).toHaveStatusCode(200);
        expect(fromDefault.body as MultiSpaceSettingsResponse).toMatchObject({
          useAllRemoteClusters: false,
          selectedRemoteClusters: ['cluster_b'],
          spaces: ['default'],
        });
      }
    );

    apiTest('[PUT] collapses ALL_SPACES with specific spaces into [*]', async ({ apiClient }) => {
      const res = await apiClient.put(settingsUrl(), {
        headers: editorHeaders,
        body: {
          useAllRemoteClusters: true,
          selectedRemoteClusters: [],
          spaces: [ALL_SPACES, 'default'],
        },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      expect((res.body as MultiSpaceSettingsResponse).spaces).toStrictEqual([ALL_SPACES]);
    });

    apiTest(
      '[PUT] is forbidden for a role without uptime-write',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asInteractiveUser('viewer');
        const viewerHeaders = { ...KIBANA_HEADERS, ...cookieHeader };

        const res = await apiClient.put(settingsUrl(), {
          headers: viewerHeaders,
          body: {
            useAllRemoteClusters: true,
            selectedRemoteClusters: [],
            spaces: ['default'],
          },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(403);
      }
    );
  }
);
