/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

interface ResultEdge {
  _source?: { space_id?: string; osquery?: { result?: Record<string, unknown> } };
  fields?: Record<string, unknown>;
}

interface ScheduledResultsRows {
  data: { edges: ResultEdge[]; rawResponse?: { hits?: { hits?: ResultEdge[] } } };
}

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const es = getService('es');
  const osqueryPublicApiVersion = '2023-10-31';

  const probeIndex = 'logs-osquery_manager.result_space_scoping_it';
  const indexTemplateName = 'osquery-results-space-scoping-it';
  const scheduleId = `space-scoping-it-${Date.now()}`;
  const executionCount = 7;

  const defaultMarker = 'SPACE_A_MARKER';
  const otherMarker = 'SPACE_B_MARKER';
  const otherSpaceId = 'space-scoping-it-b';

  const recreateProbeIndex = async () => {
    await es.indices.delete({ index: probeIndex }, { ignore: [404] });
    await es.indices.putIndexTemplate({
      name: indexTemplateName,
      // Match the probe index explicitly; higher priority than the generic
      // `logs-*-*` template so the field types the queries rely on are correct.
      index_patterns: [probeIndex],
      priority: 600,
      template: {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            'event.ingested': { type: 'date' },
            schedule_id: { type: 'keyword' },
            space_id: { type: 'keyword' },
            elastic_agent: { properties: { id: { type: 'keyword' } } },
            agent: { properties: { id: { type: 'keyword' } } },
            osquery_meta: { properties: { schedule_execution_count: { type: 'long' } } },
            osquery: { properties: { result: { type: 'object', enabled: true } } },
          },
        },
      },
    });
    await es.indices.create({ index: probeIndex });
  };

  const seedResults = async () => {
    const timestamp = new Date().toISOString();
    const base = {
      '@timestamp': timestamp,
      'event.ingested': timestamp,
      schedule_id: scheduleId,
      osquery_meta: { schedule_execution_count: executionCount },
    };

    const documents = [
      {
        ...base,
        space_id: 'default',
        elastic_agent: { id: 'space-scoping-it-agent-a' },
        agent: { id: 'space-scoping-it-agent-a' },
        osquery: { result: { marker: defaultMarker } },
      },
      {
        ...base,
        space_id: otherSpaceId,
        elastic_agent: { id: 'space-scoping-it-agent-b' },
        agent: { id: 'space-scoping-it-agent-b' },
        osquery: { result: { marker: otherMarker } },
      },
    ];

    for (const document of documents) {
      await es.index({ index: probeIndex, refresh: 'wait_for', document });
    }
  };

  const deleteResults = async () => {
    await es.indices.delete({ index: probeIndex }, { ignore: [404] });
    await es.indices.deleteIndexTemplate({ name: indexTemplateName }, { ignore: [404] });
  };

  describe('Scheduled query results space scoping', () => {
    before(async () => {
      await recreateProbeIndex();
      await seedResults();
    });
    after(deleteResults);

    it('results endpoint returns only rows from the active space', async () => {
      const { body } = await supertest
        .get(
          `/api/osquery/scheduled_results/${scheduleId}/${executionCount}/results?page=0&pageSize=100`
        )
        .set('kbn-xsrf', 'true')
        .set('elastic-api-version', osqueryPublicApiVersion)
        .expect(200);

      const { data } = body as ScheduledResultsRows;
      const edges = data.edges ?? data.rawResponse?.hits?.hits ?? [];
      const spaceIds = edges.map(
        (edge) => edge._source?.space_id ?? (edge.fields?.space_id as string[] | undefined)?.[0]
      );

      // The default-space row is returned; the other-space row is filtered out.
      expect(spaceIds).not.to.contain(otherSpaceId);
      expect(JSON.stringify(body)).not.to.contain(otherMarker);
      expect(JSON.stringify(body)).to.contain(defaultMarker);
    });

    it('export endpoint streams only rows from the active space', async () => {
      const response = await supertest
        .post(
          `/api/osquery/scheduled_results/${scheduleId}/${executionCount}/_export?format=ndjson`
        )
        .set('kbn-xsrf', 'true')
        .set('elastic-api-version', osqueryPublicApiVersion)
        .send({})
        .expect(200);

      // supertest returns the streamed body as text/buffer for file downloads.
      const exported = response.text ?? String(response.body);

      // The export is scoped to the active space, so the other-space row is absent.
      expect(exported).not.to.contain(otherMarker);
      expect(exported).not.to.contain(otherSpaceId);
    });
  });
}
