/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { Client } from '@elastic/elasticsearch';
import { tags } from '@kbn/scout';
import type { ApiClientFixture, KbnClient, KibanaRole, RoleApiCredentials } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { SmlSearchHttpResponse } from '@kbn/agent-builder-sml-plugin/common/http_api/sml';
import { AGENT_BUILDER_SML_FEATURE_ID } from '@kbn/agent-builder-sml-plugin/common/features';
import type { SmlDocument } from '@kbn/agent-builder-sml-plugin/server';
import { smlIndexName } from '@kbn/agent-builder-sml-plugin/server';
import { createSystemIndicesEsClient } from '../../../scout_agent_builder_shared/lib/system_indices_es_client';
import { apiTest } from '../fixtures';
import { COMMON_HEADERS, INTERNAL_AGENT_BUILDER_SML } from '../fixtures/constants';

/*
 * Kept in sync by hand with
 * `x-pack/platform/test/agent_builder_sml/plugins/sml_test_types/common/constants.ts`.
 * The fixture plugin is loaded by path (`--plugin-path` in the `agent_builder` Scout config set),
 * not imported, so there is no package edge to hang a shared constant on. A drift shows up as the
 * readiness poll below timing out rather than as a silent pass.
 */
const SML_TEST_PUBLIC_KI_TYPE = 'sml_test_public';
const SML_TEST_GATED_KI_TYPE = 'sml_test_gated';
const SML_TEST_GATED_FEATURE_ID = 'smlTestGatedType';
const SML_TEST_SEARCH_TOKEN = 'smltestfixturetoken';
const SML_TEST_SPACE_ID = 'default';

const SML_TEST_MALFORMED_KI_TYPE = 'sml_test_malformed';
const MALFORMED_ENTRY_ID = `sml-test-malformed-${randomUUID().slice(0, 8)}`;

const SML_CRAWLER_TASK_TYPE = 'agent_builder_sml:sml_crawler';
const CRAWL_POLL_TIMEOUT_MS = 90_000;
const CRAWL_POLL_INTERVAL_MS = 1_000;

/*
 * Per-run id, because the space outlives a failed attempt within a single run. Scout sets
 * `retries: 1` on a step's first CI attempt and a retry re-runs `beforeAll` in a fresh worker
 * against the *same* Kibana, so with a fixed literal any setup failure after `spaces.create` turns
 * the retry into a 409 — replacing the original error with a misleading one. The documented local
 * loop has the same shape, where one `scout start-server` stack serves many `run-tests` runs.
 * `kbnClient.spaces` has no `createIfNeeded`, so uniqueness is the cleanest guarantee.
 */
const OTHER_SPACE_ID = `sml-type-permissions-other-${randomUUID().slice(0, 8)}`;

/** Enough to call the SML search route, and nothing else. Holds no `ai_index:*` action. */
const SML_READ_ONLY_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: [] },
  kibana: [
    {
      base: [],
      feature: { [AGENT_BUILDER_SML_FEATURE_ID]: ['read'] },
      spaces: ['*'],
    },
  ],
};

/** The same, plus the one feature that grants `ai_index:sml_test_gated/read`. */
const SML_READ_WITH_GATED_TYPE_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: [] },
  kibana: [
    {
      base: [],
      feature: {
        [AGENT_BUILDER_SML_FEATURE_ID]: ['read'],
        [SML_TEST_GATED_FEATURE_ID]: ['read'],
      },
      spaces: ['*'],
    },
  ],
};

interface RunSoonResponse {
  id: string;
  error?: string;
}

const runSmlCrawlerSoon = async (kbnClient: KbnClient, typeId: string): Promise<void> => {
  const taskId = `${SML_CRAWLER_TASK_TYPE}:${typeId}`;
  const response = await kbnClient.request<RunSoonResponse>({
    method: 'POST',
    path: `/internal/ftr/task_manager/${encodeURIComponent(taskId)}/run_soon`,
    headers: COMMON_HEADERS,
  });

  if (response.data.error && !/already running/i.test(response.data.error)) {
    throw new Error(`Failed to run_soon task '${taskId}': ${response.data.error}`);
  }
};

// Writes the fixture entry directly into the SML index at a chosen `count`, overwriting the same
// id. Names the gated action so the gated role is a real holder; the indexer never emits `count: 0`
// with names, so that combination is only reachable by writing it by hand.
const indexEntryWithCount = async (sysEsClient: Client, count: number): Promise<void> => {
  const document: SmlDocument = {
    type: SML_TEST_MALFORMED_KI_TYPE,
    title: `${SML_TEST_SEARCH_TOKEN} ${SML_TEST_MALFORMED_KI_TYPE}`,
    content: `${SML_TEST_SEARCH_TOKEN} malformed permission element fixture`,
    permissions: {
      kibana: {
        privileges: [
          { space: SML_TEST_SPACE_ID, name: [`ai_index:${SML_TEST_GATED_KI_TYPE}/read`], count },
        ],
      },
    },
    attributes: {
      id: MALFORMED_ENTRY_ID,
      origin: { uri: `${SML_TEST_MALFORMED_KI_TYPE}://${MALFORMED_ENTRY_ID}` },
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      ingestion_method: 'crawled',
    },
  };
  await sysEsClient.index({
    index: smlIndexName,
    id: MALFORMED_ENTRY_ID,
    refresh: 'wait_for',
    document,
  });
};

/*
 * Guards the `SmlTypeDefinition.getPermissions` contract: a type that omits the hook produces
 * entries readable by any caller *in the spaces they were indexed for*, and a type that implements
 * it stays gated.
 * No currently shipped SML type omits `getPermissions`, so this is driven by a fixture plugin
 * registering one such type (plus a gated twin as the control).
 */
apiTest.describe(
  'Agent Builder — SML type permission contract',
  { tag: [...tags.stateful.classic] },
  () => {
    let smlReadOnlyCredentials: RoleApiCredentials;
    let gatedTypeCredentials: RoleApiCredentials;
    let sysEsClient: Client;

    const searchSml = async (
      apiClient: ApiClientFixture,
      credentials: RoleApiCredentials,
      { spaceId }: { spaceId?: string } = {}
    ): Promise<string[]> => {
      const basePath = spaceId ? `/s/${spaceId}` : '';
      const response = await apiClient.post(
        `${basePath}${INTERNAL_AGENT_BUILDER_SML}/sml/_search`,
        {
          headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
          body: { query: SML_TEST_SEARCH_TOKEN, size: 20 },
          responseType: 'json',
        }
      );
      expect(response).toHaveStatusCode(200);
      return (response.body as SmlSearchHttpResponse).results.map((hit) => hit.type);
    };

    apiTest.beforeAll(async ({ requestAuth, kbnClient, apiClient, esClient, config }) => {
      // Scout's default test timeout is 60s and a beforeAll hook is billed against it, so the
      // readiness poll below cannot outlive its own budget: without this the hook is killed at 60s
      // and reports "Received: false" rather than whatever the crawl was actually doing.
      apiTest.setTimeout(CRAWL_POLL_TIMEOUT_MS + 30_000);

      sysEsClient = await createSystemIndicesEsClient(esClient, config);

      await kbnClient.spaces.create({
        id: OTHER_SPACE_ID,
        name: 'SML type permissions other space',
      });

      await Promise.all([
        runSmlCrawlerSoon(kbnClient, SML_TEST_PUBLIC_KI_TYPE),
        runSmlCrawlerSoon(kbnClient, SML_TEST_GATED_KI_TYPE),
      ]);

      smlReadOnlyCredentials = await requestAuth.getApiKeyForCustomRole(SML_READ_ONLY_ROLE);
      gatedTypeCredentials = await requestAuth.getApiKeyForCustomRole(
        SML_READ_WITH_GATED_TYPE_ROLE
      );

      // Readiness: the caller holding every relevant action must see both fixture entries.
      await expect
        .poll(
          async () => {
            const types = await searchSml(apiClient, gatedTypeCredentials);
            return (
              types.includes(SML_TEST_PUBLIC_KI_TYPE) && types.includes(SML_TEST_GATED_KI_TYPE)
            );
          },
          { timeout: CRAWL_POLL_TIMEOUT_MS, intervals: [CRAWL_POLL_INTERVAL_MS] }
        )
        .toBe(true);
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      try {
        await sysEsClient.delete(
          { index: smlIndexName, id: MALFORMED_ENTRY_ID, refresh: true },
          { ignore: [404] }
        );
      } finally {
        await kbnClient.spaces.delete(OTHER_SPACE_ID);
      }
    });

    apiTest(
      'entries of a type without a getPermissions hook are visible to a caller holding no ai_index action',
      async ({ apiClient }) => {
        const types = await searchSml(apiClient, smlReadOnlyCredentials);
        expect(types).toContain(SML_TEST_PUBLIC_KI_TYPE);
      }
    );

    apiTest(
      'entries of a type with a getPermissions hook are hidden from a caller lacking its action',
      async ({ apiClient }) => {
        const types = await searchSml(apiClient, smlReadOnlyCredentials);
        expect(types).not.toContain(SML_TEST_GATED_KI_TYPE);
      }
    );

    apiTest('granting the gating feature makes the gated type visible', async ({ apiClient }) => {
      const types = await searchSml(apiClient, gatedTypeCredentials);
      expect(types).toContain(SML_TEST_GATED_KI_TYPE);
    });

    apiTest(
      'a hook-less type is public within its own spaces only, not across spaces',
      async ({ apiClient }) => {
        // The fixture indexes both entries for `default` alone.
        const types = await searchSml(apiClient, gatedTypeCredentials, { spaceId: OTHER_SPACE_ID });
        expect(types).not.toContain(SML_TEST_PUBLIC_KI_TYPE);
        expect(types).not.toContain(SML_TEST_GATED_KI_TYPE);
      }
    );

    apiTest(
      'a count-0 element naming an action is hidden from every caller, though its count-1 form is visible to the holder',
      async ({ apiClient }) => {
        // Positive control: at count 1 the holder must see it, proving it is a reachable candidate.
        await indexEntryWithCount(sysEsClient, 1);
        const holderAtCountOne = await searchSml(apiClient, gatedTypeCredentials);
        expect(holderAtCountOne).toContain(SML_TEST_MALFORMED_KI_TYPE);

        // Same id at malformed count 0 must flip closed for holder and non-holder alike.
        await indexEntryWithCount(sysEsClient, 0);
        const holderAtCountZero = await searchSml(apiClient, gatedTypeCredentials);
        expect(holderAtCountZero).not.toContain(SML_TEST_MALFORMED_KI_TYPE);
        const readOnlyAtCountZero = await searchSml(apiClient, smlReadOnlyCredentials);
        expect(readOnlyAtCountZero).not.toContain(SML_TEST_MALFORMED_KI_TYPE);

        // A genuinely public entry still shows, so the guard has not swallowed legitimate docs.
        expect(readOnlyAtCountZero).toContain(SML_TEST_PUBLIC_KI_TYPE);
      }
    );
  }
);
