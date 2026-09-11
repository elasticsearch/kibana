/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import {
  elasticsearchServiceMock,
  loggingSystemMock,
  httpServerMock,
} from '@kbn/core/server/mocks';
import { DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID } from '../../../common/threat_intel';
import { getThreatIntelReadiness, type ReadinessDeps } from './readiness';

const logger = loggingSystemMock.createLogger();

const semanticFieldMappings = {
  '.kibana-threat-reports': {
    mappings: {
      'content.title': {
        full_name: 'content.title',
        mapping: {
          title: { type: 'semantic_text', inference_id: '.default-embedding' },
        },
      },
      'content.body_text': {
        full_name: 'content.body_text',
        mapping: {
          body_text: { type: 'semantic_text', inference_id: '.default-embedding' },
        },
      },
    },
  },
};

const buildUsableStatsResponse = ({
  count = 3,
  lastIngest = '2024-06-01T00:00:00.000Z',
  lastEnrich = '2024-06-02T00:00:00.000Z',
}: {
  count?: number;
  lastIngest?: string | null;
  lastEnrich?: string | null;
} = {}) =>
  ({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: count, relation: 'eq' as const }, max_score: null, hits: [] },
    aggregations: {
      last_ingest: lastIngest
        ? { value: Date.parse(lastIngest), value_as_string: lastIngest }
        : { value: null },
      last_enrich: lastEnrich
        ? { value: Date.parse(lastEnrich), value_as_string: lastEnrich }
        : { value: null },
    },
  } as const);

const buildDefaultDeps = (
  overrides: Partial<ReadinessDeps> = {}
): ReadinessDeps & {
  esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
} => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.indices.exists.mockResolvedValue(true);
  esClient.indices.getFieldMapping.mockResolvedValue(semanticFieldMappings as never);
  esClient.inference.get.mockResolvedValue({} as never);
  esClient.search.mockResolvedValue(buildUsableStatsResponse() as never);

  const searchInferenceEndpoints = {
    endpoints: {
      getForFeature: jest.fn().mockResolvedValue({
        endpoints: [{ connectorId: 'enrich-connector' }],
      }),
    },
  };

  return {
    esClient,
    spaceId: 'default',
    logger,
    getBootstrapReady: jest.fn().mockResolvedValue(undefined),
    request: httpServerMock.createKibanaRequest() as KibanaRequest,
    getInference: jest.fn().mockReturnValue({}),
    getSearchInferenceEndpoints: jest.fn().mockReturnValue(searchInferenceEndpoints),
    ...overrides,
  } as ReadinessDeps & {
    esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  };
};

describe('getThreatIntelReadiness', () => {
  it('returns blocked when bootstrap is incomplete', async () => {
    const deps = buildDefaultDeps({
      getBootstrapReady: jest.fn().mockRejectedValue(new Error('still starting')),
    });

    const result = await getThreatIntelReadiness(deps);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        reasonCodes: ['bootstrap_incomplete'],
        usableReportCount: 0,
      })
    );
  });

  it('returns blocked when the reports index is missing', async () => {
    const deps = buildDefaultDeps();
    deps.esClient.indices.exists.mockResolvedValue(false);

    const result = await getThreatIntelReadiness(deps);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        reasonCodes: ['reports_index_missing'],
      })
    );
  });

  it('returns ready when dependencies and usable reports are present', async () => {
    const deps = buildDefaultDeps();

    const result = await getThreatIntelReadiness(deps);

    expect(result.status).toBe('ready');
  });

  it('returns empty reasonCodes when ready', async () => {
    const deps = buildDefaultDeps();

    const result = await getThreatIntelReadiness(deps);

    expect(result.reasonCodes).toEqual([]);
  });

  it('returns usableReportCount from the usable-bar count query', async () => {
    const deps = buildDefaultDeps();
    deps.esClient.search.mockResolvedValue(buildUsableStatsResponse({ count: 7 }) as never);

    const result = await getThreatIntelReadiness(deps);

    expect(result.usableReportCount).toBe(7);
  });

  it('returns freshness timestamps from lineage max aggregations', async () => {
    const deps = buildDefaultDeps();

    const result = await getThreatIntelReadiness(deps);

    expect(result).toEqual(
      expect.objectContaining({
        lastIngestAt: '2024-06-01T00:00:00.000Z',
        lastEnrichAt: '2024-06-02T00:00:00.000Z',
      })
    );
  });

  it('returns degraded with no_usable_reports when the usable count is zero', async () => {
    const deps = buildDefaultDeps();
    deps.esClient.search.mockResolvedValue(buildUsableStatsResponse({ count: 0 }) as never);

    const result = await getThreatIntelReadiness(deps);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'degraded',
        reasonCodes: ['no_usable_reports'],
      })
    );
  });

  it('returns degraded with usable_stats_unavailable, not no_usable_reports, when the stats query fails', async () => {
    const deps = buildDefaultDeps();
    deps.esClient.search.mockRejectedValue(new Error('es unavailable'));

    const result = await getThreatIntelReadiness(deps);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'degraded',
        reasonCodes: ['usable_stats_unavailable'],
      })
    );
  });

  it('returns degraded with embedding_endpoint_unavailable when inference.get fails', async () => {
    const deps = buildDefaultDeps();
    deps.esClient.inference.get.mockImplementation(async (req) => {
      const id = req?.inference_id;
      if (id === '.default-embedding') {
        throw new Error('missing');
      }
      return {} as never;
    });

    const result = await getThreatIntelReadiness(deps);

    expect(result.reasonCodes).toContain('embedding_endpoint_unavailable');
  });

  it('returns degraded with no_enrich_connector when the enrich feature has no endpoint', async () => {
    const deps = buildDefaultDeps({
      getSearchInferenceEndpoints: jest.fn().mockReturnValue({
        endpoints: {
          getForFeature: jest.fn().mockResolvedValue({ endpoints: [] }),
        },
      }),
    });

    const result = await getThreatIntelReadiness(deps);

    expect(result.reasonCodes).toContain('no_enrich_connector');
  });

  it('returns degraded with no_enrich_connector when inference plugin is missing', async () => {
    const deps = buildDefaultDeps({
      getInference: jest.fn().mockReturnValue(undefined),
    });

    const result = await getThreatIntelReadiness(deps);

    expect(result.reasonCodes).toContain('no_enrich_connector');
  });

  it('returns optional diamond_unavailable when the diamond embedding endpoint is missing', async () => {
    const deps = buildDefaultDeps();
    deps.esClient.inference.get.mockImplementation(async (req) => {
      const id = req?.inference_id;
      if (id === DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID) {
        throw new Error('missing diamond');
      }
      return {} as never;
    });

    const result = await getThreatIntelReadiness(deps);

    expect(result.optional).toEqual(['diamond_unavailable']);
  });

  it('returns ready status even when diamond is unavailable', async () => {
    const deps = buildDefaultDeps();
    deps.esClient.inference.get.mockImplementation(async (req) => {
      const id = req?.inference_id;
      if (id === DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID) {
        throw new Error('missing diamond');
      }
      return {} as never;
    });

    const result = await getThreatIntelReadiness(deps);

    expect(result.status).toBe('ready');
  });

  it('returns both bootstrap and index reason codes when both fail', async () => {
    const deps = buildDefaultDeps({
      getBootstrapReady: jest.fn().mockRejectedValue(new Error('boot failed')),
    });
    deps.esClient.indices.exists.mockResolvedValue(false);

    const result = await getThreatIntelReadiness(deps);

    expect(result.reasonCodes).toEqual(['bootstrap_incomplete', 'reports_index_missing']);
  });
});
