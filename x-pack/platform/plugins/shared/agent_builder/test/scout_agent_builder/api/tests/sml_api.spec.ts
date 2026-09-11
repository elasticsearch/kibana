/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { Client } from '@elastic/elasticsearch';
import { tags } from '@kbn/scout';
import type { ApiClientFixture } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { createLlmProxy } from '@kbn/ftr-llm-proxy';
import type {
  SmlAutocompleteHttpResponse,
  SmlSearchHttpResponse,
} from '@kbn/agent-builder-sml-plugin/common/http_api/sml';
import type { SmlDocument } from '@kbn/agent-builder-sml-plugin/server';
import { smlIndexName } from '@kbn/agent-builder-sml-plugin/server';
import type { SmlAttachHttpResponse } from '../../../../common/http_api/sml';
import {
  createGenAiConnectorForProxy,
  deleteConnectorById,
} from '../../../scout_agent_builder_shared/lib/connector_kbn';
import { createSystemIndicesEsClient } from '../../../scout_agent_builder_shared/lib/system_indices_es_client';
import { setupAgentDirectAnswer } from '../../../scout_agent_builder_shared/lib/proxy_scenario';
import { apiTest } from '../fixtures';
import {
  API_AGENT_BUILDER,
  COMMON_HEADERS,
  INTERNAL_AGENT_BUILDER,
  INTERNAL_AGENT_BUILDER_SML,
} from '../fixtures/constants';
import { postConverse } from '../fixtures/converse_http';

const SML_FIXTURE_NOW = '2024-06-01T12:00:00.000Z';

/** An SML document as written to the index: bookkeeping lives under the flattened `attributes`. */
const indexedDocument = ({
  id,
  type,
  title,
  originUri,
  content,
}: {
  id: string;
  type: string;
  title: string;
  originUri: string;
  content: string;
}): SmlDocument => ({
  type,
  title,
  content,
  permissions: { kibana: { privileges: [] } },
  attributes: {
    id,
    origin: { uri: originUri },
    created_at: SML_FIXTURE_NOW,
    updated_at: SML_FIXTURE_NOW,
    ingestion_method: 'crawled',
  },
});

apiTest.describe('Agent Builder — SML internal API', { tag: [...tags.stateful.classic] }, () => {
  let adminInteractiveCookieHeader: Record<string, string>;
  let sysEsClient: Client;

  // Shared search-test entry: indexed once and reused by hit, wildcard,
  // and compact-shape assertions so the index is never empty
  const searchRunId = randomUUID();
  const searchEntryId = `sml-autocomplete-${searchRunId}`;
  const searchOriginId = `sml-origin-${searchRunId}`;
  const searchIndexedTitle = `sml autocomplete pacific bluefin ${searchRunId}`;

  const longTitleEntryId = `sml-multitoken-long-${searchRunId}`;
  const shortTitleEntryId = `sml-multitoken-short-${searchRunId}`;

  // "sales" is not a registered SML type, so the slash here is part of the title.
  const slashTitleEntryId = `sml-slash-title-${searchRunId}`;
  const slashTitle = `sales/marketing overview ${searchRunId}`;

  const capitalizedTypeEntryId = `sml-capitalized-type-${searchRunId}`;

  apiTest.beforeAll(async ({ samlAuth, esClient, config }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
    adminInteractiveCookieHeader = cookieHeader;
    sysEsClient = await createSystemIndicesEsClient(esClient, config);
    // Created bare — the Elasticsearch-managed `ai-index-idx-managed` template owns the mappings.
    const exists = await sysEsClient.indices.exists({ index: smlIndexName });
    if (!exists) {
      await sysEsClient.indices.create({ index: smlIndexName });
    }

    await sysEsClient.index({
      index: smlIndexName,
      id: searchEntryId,
      document: indexedDocument({
        id: searchEntryId,
        type: 'visualization',
        title: searchIndexedTitle,
        originUri: `visualization://${searchOriginId}`,
        content: 'pacific bluefin tuna content for sml scout',
      }),
    });

    await sysEsClient.index({
      index: smlIndexName,
      id: slashTitleEntryId,
      document: indexedDocument({
        id: slashTitleEntryId,
        type: 'dashboard',
        title: slashTitle,
        originUri: `dashboard://${slashTitleEntryId}`,
        content: 'sales and marketing overview for sml scout',
      }),
    });

    await sysEsClient.index({
      index: smlIndexName,
      id: longTitleEntryId,
      document: indexedDocument({
        id: longTitleEntryId,
        type: 'visualization',
        title: `yellowfin tuna migration patterns across the pacific ${searchRunId}`,
        originUri: `visualization://${longTitleEntryId}`,
        content: 'yellowfin long title for sml scout ranking',
      }),
    });

    await sysEsClient.index({
      index: smlIndexName,
      id: shortTitleEntryId,
      document: indexedDocument({
        id: shortTitleEntryId,
        type: 'visualization',
        title: `yellowfin ${searchRunId}`,
        originUri: `visualization://${shortTitleEntryId}`,
        content: 'yellowfin short title for sml scout ranking',
      }),
    });

    await sysEsClient.index({
      index: smlIndexName,
      id: capitalizedTypeEntryId,
      document: indexedDocument({
        id: capitalizedTypeEntryId,
        type: 'Workflow',
        title: `capitalized type entry ${searchRunId}`,
        originUri: `workflow://${capitalizedTypeEntryId}`,
        content: 'capitalized type for sml scout',
      }),
    });

    await sysEsClient.indices.refresh({ index: smlIndexName });
  });

  apiTest.afterAll(async () => {
    for (const id of [
      searchEntryId,
      longTitleEntryId,
      shortTitleEntryId,
      slashTitleEntryId,
      capitalizedTypeEntryId,
    ]) {
      try {
        await sysEsClient.delete({ index: smlIndexName, id, refresh: true });
      } catch {
        // ignore — already cleaned up
      }
    }
  });

  const ih = () => ({
    ...COMMON_HEADERS,
    ...adminInteractiveCookieHeader,
  });

  apiTest('POST /internal/agent_builder_sml/sml/_search autocomplete', async ({ apiClient }) => {
    const response = await apiClient.post(`${INTERNAL_AGENT_BUILDER_SML}/sml/_search`, {
      headers: ih(),
      body: { query: 'pacif', size: 20 },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(200);
    const body = response.body as SmlSearchHttpResponse;
    const match = body.results.find((r) => r.id === searchEntryId);
    expect(match).toBeDefined();
    expect(match?.title).toContain('pacific');
    expect(match?.origin?.uri).toBe(`visualization://${searchOriginId}`);
    expect(match?.type).toBe('visualization');
  });

  apiTest(
    'POST /internal/agent_builder_sml/sml/_search wildcard returns item fields',
    async ({ apiClient }) => {
      const response = await apiClient.post(`${INTERNAL_AGENT_BUILDER_SML}/sml/_search`, {
        headers: ih(),
        body: { query: '*', size: 10 },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      const body = response.body as SmlSearchHttpResponse;
      expect(Array.isArray(body.results)).toBe(true);
      for (const item of body.results) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.origin?.uri).toBe('string');
        expect(typeof item.type).toBe('string');
        expect(typeof item.title).toBe('string');
      }
    }
  );

  apiTest(
    'POST /internal/agent_builder_sml/sml/_search rejects empty query',
    async ({ apiClient }) => {
      const response = await apiClient.post(`${INTERNAL_AGENT_BUILDER_SML}/sml/_search`, {
        headers: ih(),
        body: { query: '' },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(400);
    }
  );

  const autocomplete = async (apiClient: ApiClientFixture, query: string) => {
    const response = await apiClient.post(`${INTERNAL_AGENT_BUILDER_SML}/sml/_autocomplete`, {
      headers: ih(),
      body: { query, size: 20 },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(200);
    return (response.body as SmlAutocompleteHttpResponse).results;
  };

  apiTest(
    'POST /internal/agent_builder_sml/sml/_autocomplete prefix-matches a title',
    async ({ apiClient }) => {
      const results = await autocomplete(apiClient, 'pacif');
      const match = results.find((r) => r.id === searchEntryId);
      expect(match).toBeDefined();
      expect(match?.type).toBe('visualization');
      expect(match?.origin?.uri).toBe(`visualization://${searchOriginId}`);
    }
  );

  apiTest(
    'POST /internal/agent_builder_sml/sml/_autocomplete prefix-matches a bare type',
    async ({ apiClient }) => {
      const results = await autocomplete(apiClient, 'visualiz');
      expect(results.some((r) => r.id === searchEntryId)).toBe(true);
    }
  );

  apiTest(
    'POST /internal/agent_builder_sml/sml/_autocomplete matches each half of a "type/title" query',
    async ({ apiClient }) => {
      const results = await autocomplete(apiClient, 'visualization/pacif');
      expect(results.some((r) => r.id === searchEntryId)).toBe(true);

      // The type half must actually constrain: no type starts with "connect"
      // other than connector, so the visualization entry must drop out.
      const wrongType = await autocomplete(apiClient, 'connector/pacif');
      expect(wrongType.some((r) => r.id === searchEntryId)).toBe(false);
    }
  );

  apiTest(
    'POST /internal/agent_builder_sml/sml/_autocomplete matches a type stored as "Workflow"',
    async ({ apiClient }) => {
      const results = await autocomplete(apiClient, 'workflo');
      expect(results.some((r) => r.id === capitalizedTypeEntryId)).toBe(true);
    }
  );

  apiTest(
    'POST /internal/agent_builder_sml/sml/_autocomplete finds a title that contains a slash',
    async ({ apiClient }) => {
      // "sales" names no registered type, so this must be matched against the
      // title rather than filtered to a type that cannot exist.
      const results = await autocomplete(apiClient, 'sales/mark');
      expect(results.some((r) => r.id === slashTitleEntryId)).toBe(true);
    }
  );

  apiTest(
    'POST /internal/agent_builder_sml/sml/_autocomplete requires every token of a multi-token prefix',
    async ({ apiClient }) => {
      // Both titles start with "yellowfin", so a single token matches both.
      const oneToken = await autocomplete(apiClient, 'yellowf');
      const oneTokenIds = oneToken.map((r) => r.id);
      expect(oneTokenIds).toContain(shortTitleEntryId);
      expect(oneTokenIds).toContain(longTitleEntryId);

      // Adding a second token narrows to the only title containing it, with the
      // trailing token still matched as a prefix ("migr" -> "migration").
      const twoTokens = await autocomplete(apiClient, 'yellowfin migr');
      const twoTokenIds = twoTokens.map((r) => r.id);
      expect(twoTokenIds).toContain(longTitleEntryId);
      expect(twoTokenIds).not.toContain(shortTitleEntryId);
    }
  );

  apiTest(
    'POST /internal/agent_builder/sml/_attach returns 404 when conversation missing',
    async ({ apiClient }) => {
      const response = await apiClient.post(`${INTERNAL_AGENT_BUILDER}/sml/_attach`, {
        headers: ih(),
        body: {
          conversation_id: 'non-existent-conversation-id-for-sml-attach-scout',
          entry_ids: ['irrelevant-entry-id-for-sml-attach-scout'],
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(404);
      expect(
        typeof response.body === 'object' &&
          response.body !== null &&
          'message' in (response.body as object)
      ).toBe(true);
    }
  );

  apiTest(
    'POST /internal/agent_builder/sml/_attach attaches entry and persists attachment refs',
    async ({ apiClient, asAdmin, log, kbnClient }) => {
      const runId = randomUUID();
      const entryId = `sml-scout-attach-${runId}`;
      const indexedTitle = `sml scout attach ${runId}`;
      const llmProxy = await createLlmProxy(log);
      const { id: connectorId } = await createGenAiConnectorForProxy(kbnClient, llmProxy);

      await sysEsClient.index({
        index: smlIndexName,
        id: entryId,
        refresh: 'wait_for',
        document: indexedDocument({
          id: entryId,
          type: 'connector',
          title: indexedTitle,
          originUri: `connector://${connectorId}`,
          content: `attach content for ${runId}`,
        }),
      });

      await setupAgentDirectAnswer({
        proxy: llmProxy,
        title: `SML attach title ${runId}`,
        response: 'SML attach response',
      });
      const converseRes = await postConverse(
        asAdmin,
        {},
        {
          input: 'Create round for SML attach',
          attachments: [{ type: 'text', data: { content: `existing text attachment ${runId}` } }],
          connector_id: connectorId,
        },
        'local'
      );
      expect(converseRes).toHaveStatusCode(200);
      const conversationId = (converseRes.body as { conversation_id: string }).conversation_id;
      await llmProxy.waitForAllInterceptorsToHaveBeenCalled();

      const attachResponse = await apiClient.post(`${INTERNAL_AGENT_BUILDER}/sml/_attach`, {
        headers: ih(),
        body: { conversation_id: conversationId, entry_ids: [entryId] },
        responseType: 'json',
      });
      expect(attachResponse).toHaveStatusCode(200);
      const attachBody = attachResponse.body as SmlAttachHttpResponse;
      expect(attachBody.results).toHaveLength(1);
      expect(attachBody.results[0].success).toBe(true);

      const conversation = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationId)}`,
        { responseType: 'json' }
      );
      expect(conversation).toHaveStatusCode(200);
      const conv = conversation.body as {
        attachments?: Array<{ type: string; id: string }>;
        rounds: Array<{ input: { attachment_refs?: Array<{ attachment_id: string }> } }>;
      };
      const attachments = conv.attachments ?? [];
      expect(attachments[0].type).toBe('text');
      expect(attachments[1].type).toBe('connector');
      const lastRound = conv.rounds[conv.rounds.length - 1];
      expect(lastRound.input.attachment_refs?.[0].attachment_id).toBe(attachments[0].id);
      expect(lastRound.input.attachment_refs?.[1].attachment_id).toBe(attachments[1].id);

      await asAdmin.delete(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationId)}`
      );
      llmProxy.close();
      await deleteConnectorById(kbnClient, connectorId);
      try {
        await sysEsClient.delete({ index: smlIndexName, id: entryId, refresh: true });
      } catch {
        // ignore — document may have been cleaned up by SML auto-indexing
      }
    }
  );
});
