/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

interface ResultEdge {
  _source?: { space_id?: string; agent?: { id?: string } };
  fields?: Record<string, unknown>;
}

// The action_results endpoint returns its envelope at the top level (not under
// a `data` key like the scheduled-results endpoint).
interface ActionResultsRows {
  edges: ResultEdge[];
  aggregations?: { totalResponded?: number };
}

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const es = getService('es');
  const osqueryPublicApiVersion = '2023-10-31';

  // Live-query action responses are written by osquerybeat to the
  // osquery_manager action.responses data stream. The search strategy only
  // queries this data stream when it actually exists (newDataStreamIndexExists),
  // so the test must create it as a real data stream rather than a plain index.
  const responsesIndex = 'logs-osquery_manager.action.responses-default';
  const indexTemplateName = 'osquery-action-results-space-scoping-it';
  const actionId = `action-space-scoping-it-${Date.now()}`;

  const spaceAAgent = 'action-space-scoping-it-agent-a';
  const spaceBAgent = 'action-space-scoping-it-agent-b';
  const otherSpaceId = 'action-space-scoping-it-b';

  // Install a higher-priority data stream template with the field types the
  // action_results query/aggregation rely on, then (re)create the data stream.
  // The real osquery_manager package template is not installed in this env.
  const recreateResponsesIndex = async () => {
    await es.indices.deleteDataStream({ name: responsesIndex }, { ignore: [404] });
    await es.indices.putIndexTemplate({
      name: indexTemplateName,
      index_patterns: [responsesIndex],
      data_stream: {},
      priority: 600,
      template: {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            'event.ingested': { type: 'date' },
            action_id: { type: 'keyword' },
            space_id: { type: 'keyword' },
            agent_id: { type: 'keyword' },
            agent: { properties: { id: { type: 'keyword' } } },
            elastic_agent: { properties: { id: { type: 'keyword' } } },
            started_at: { type: 'date' },
            completed_at: { type: 'date' },
            error: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 1024 } } },
            action_response: {
              properties: { osquery: { properties: { count: { type: 'long' } } } },
            },
          },
        },
      },
    });
    await es.indices.createDataStream({ name: responsesIndex });
  };

  const seedResponses = async () => {
    const timestamp = new Date().toISOString();
    const base = {
      '@timestamp': timestamp,
      'event.ingested': timestamp,
      started_at: timestamp,
      completed_at: timestamp,
      action_id: actionId,
      action_response: { osquery: { count: 1 } },
    };

    const documents = [
      {
        ...base,
        space_id: 'default',
        agent_id: spaceAAgent,
        agent: { id: spaceAAgent },
        elastic_agent: { id: spaceAAgent },
      },
      {
        ...base,
        space_id: otherSpaceId,
        agent_id: spaceBAgent,
        agent: { id: spaceBAgent },
        elastic_agent: { id: spaceBAgent },
      },
    ];

    for (const document of documents) {
      // Data streams only accept the `create` op type.
      await es.index({ index: responsesIndex, op_type: 'create', refresh: 'wait_for', document });
    }
  };

  const deleteResponses = async () => {
    await es.indices.deleteDataStream({ name: responsesIndex }, { ignore: [404] });
    await es.indices.deleteIndexTemplate({ name: indexTemplateName }, { ignore: [404] });
  };

  describe('Action results space scoping', () => {
    before(async () => {
      await recreateResponsesIndex();
      await seedResponses();
    });
    after(deleteResponses);

    it('returns only active-space responses (hits + aggregation)', async () => {
      const { body } = await supertest
        .get(`/api/osquery/action_results/${actionId}?page=0&pageSize=100&kuery=`)
        .set('kbn-xsrf', 'true')
        .set('elastic-api-version', osqueryPublicApiVersion)
        .expect(200);

      const { edges, aggregations } = body as ActionResultsRows;
      const spaceIds = (edges ?? []).map(
        (edge) => edge._source?.space_id ?? (edge.fields?.space_id as string[] | undefined)?.[0]
      );

      // The default-space response is returned; the other-space one is filtered out.
      expect(spaceIds).not.to.contain(otherSpaceId);
      expect(JSON.stringify(body)).not.to.contain(spaceBAgent);
      expect(JSON.stringify(body)).not.to.contain(otherSpaceId);
      expect(JSON.stringify(body)).to.contain(spaceAAgent);

      // The aggregation is space-scoped too, so its counts match the
      // space-scoped hits (only the single default-space response is counted).
      expect(aggregations?.totalResponded).to.eql(1);
    });
  });
}
