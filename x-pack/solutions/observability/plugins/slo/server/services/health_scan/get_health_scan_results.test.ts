/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { getHealthScanResults } from './get_health_scan_results';

type ScopedClusterClientMock = ReturnType<
  typeof elasticsearchServiceMock.createScopedClusterClient
>;
import { IllegalArgumentError } from '../../errors';
import type { HealthDocument } from '../tasks/health_scan_task/types';

function createMockHealthDoc(overrides: Partial<HealthDocument> = {}): HealthDocument {
  return {
    '@timestamp': '2026-01-15T10:00:00.000Z',
    scanId: 'scan-123',
    spaceId: 'default',
    slo: { id: 'slo-1', revision: 1, name: 'SLO 1', enabled: true },
    health: {
      isProblematic: true,
      rollup: {
        isProblematic: true,
        missing: true,
        status: 'unavailable',
        state: 'unavailable',
        stateMatches: false,
      },
      summary: {
        isProblematic: false,
        missing: false,
        status: 'healthy',
        state: 'started',
        stateMatches: true,
      },
    },
    ...overrides,
  };
}

function createMockSearchHitsResponse(docs: HealthDocument[], total: number, sortValue?: unknown) {
  const hits = docs.map((doc, i) => ({
    _index: '.slo-observability.health-v3.6',
    _id: `doc-${i}`,
    _score: 1,
    _source: doc,
    sort: sortValue ?? [
      doc['@timestamp'],
      doc.scanId,
      doc.spaceId,
      doc.health.isProblematic,
      doc.slo.id,
    ],
  }));

  return {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: typeof total === 'number' ? total : { value: total, relation: 'eq' as const },
      max_score: 1,
      hits,
    },
  };
}

function createMockSummaryAggResponse(total: number, problematic: number) {
  return {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: total, relation: 'eq' }, max_score: null, hits: [] },
    aggregations: {
      latest_timestamp: { value: 1705312800000, value_as_string: '2026-01-15T10:00:00.000Z' },
      processed: { value: total },
      problematic: { doc_count: problematic },
    },
  };
}

describe('getHealthScanResults', () => {
  let scopedClusterClient: ScopedClusterClientMock;
  let taskManager: ReturnType<typeof taskManagerMock.createStart>;

  const TEST_SCAN_ID = 'scan-123';
  const deps = {
    scopedClusterClient: {} as ScopedClusterClientMock,
    taskManager: {} as ReturnType<typeof taskManagerMock.createStart>,
    spaceIds: ['default'],
  };

  beforeEach(() => {
    scopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
    taskManager = taskManagerMock.createStart();
    deps.scopedClusterClient = scopedClusterClient;
    deps.taskManager = taskManager;
    taskManager.get.mockRejectedValue(new Error('not found')); // no task = scan completed
    jest.clearAllMocks();
  });

  describe('pagination', () => {
    it('returns nextSearchAfter when full page is returned', async () => {
      const size = 5;
      const docs = Array.from({ length: size }, (_, i) =>
        createMockHealthDoc({
          slo: { id: `slo-${i}`, revision: 1, name: `SLO ${i}`, enabled: true },
        })
      );
      const cursor = ['2026-01-15T10:00:00.000Z', 'scan-123', 'default', true, 'slo-4'];

      scopedClusterClient.asInternalUser.search.mockImplementation(async (params: any) => {
        if (params?.size === 0) {
          return createMockSummaryAggResponse(30, 30) as any;
        }
        return createMockSearchHitsResponse(docs, 30, cursor) as any;
      });

      const result = await getHealthScanResults(
        { scanId: TEST_SCAN_ID, size, problematic: true },
        deps
      );

      expect(result.results).toHaveLength(size);
      expect(result.total).toBe(30);
      expect(result.searchAfter).toBe(Buffer.from(JSON.stringify(cursor)).toString('base64'));
    });

    it('returns undefined nextSearchAfter when partial page is returned', async () => {
      const size = 25;
      const docs = Array.from({ length: 3 }, (_, i) =>
        createMockHealthDoc({
          slo: { id: `slo-${i}`, revision: 1, name: `SLO ${i}`, enabled: true },
        })
      );

      scopedClusterClient.asInternalUser.search.mockImplementation(async (params: any) => {
        if (params?.size === 0) {
          return createMockSummaryAggResponse(3, 3) as any;
        }
        return createMockSearchHitsResponse(docs, 3) as any;
      });

      const result = await getHealthScanResults(
        { scanId: TEST_SCAN_ID, size, problematic: true },
        deps
      );

      expect(result.results).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.searchAfter).toBeUndefined();
    });

    it('passes searchAfter to the query when provided', async () => {
      const searchAfter = ['2026-01-15T10:00:00.000Z', 'scan-123', 'default', true, 'slo-24'];
      const docs = [
        createMockHealthDoc({ slo: { id: 'slo-25', name: 'SLO 25', revision: 1, enabled: true } }),
      ];

      scopedClusterClient.asInternalUser.search.mockImplementation(async (params: any) => {
        if (params?.size === 0) {
          return createMockSummaryAggResponse(30, 30) as any;
        }
        return createMockSearchHitsResponse(docs, 30) as any;
      });

      await getHealthScanResults(
        {
          scanId: TEST_SCAN_ID,
          size: 25,
          problematic: true,
          searchAfter: Buffer.from(JSON.stringify(searchAfter)).toString('base64'),
        },
        deps
      );

      const searchCall = scopedClusterClient.asInternalUser.search.mock.calls.find(
        (call: any) => call[0]?.size > 0
      );
      expect(searchCall?.[0]?.search_after).toEqual(searchAfter);
    });

    it('ignores invalid searchAfter and does not pass search_after', async () => {
      const docs = [createMockHealthDoc()];

      scopedClusterClient.asInternalUser.search.mockImplementation(async (params: any) => {
        if (params?.size === 0) {
          return createMockSummaryAggResponse(1, 1) as any;
        }
        return createMockSearchHitsResponse(docs, 1) as any;
      });

      await getHealthScanResults(
        {
          scanId: TEST_SCAN_ID,
          size: 25,
          problematic: true,
          searchAfter: 'not-valid-json',
        },
        deps
      );

      const searchCall = scopedClusterClient.asInternalUser.search.mock.calls.find(
        (call: any) => call[0]?.size > 0
      );
      expect(searchCall?.[0]?.search_after).toBeUndefined();
    });
  });

  describe('size validation', () => {
    beforeEach(() => {
      scopedClusterClient.asInternalUser.search.mockImplementation(async (params: any) => {
        if (params?.size === 0) {
          return createMockSummaryAggResponse(0, 0) as any;
        }
        return createMockSearchHitsResponse([], 0) as any;
      });
    });

    it('throws when size is 0', async () => {
      await expect(getHealthScanResults({ scanId: TEST_SCAN_ID, size: 0 }, deps)).rejects.toThrow(
        IllegalArgumentError
      );
    });

    it('throws when size exceeds 100', async () => {
      await expect(getHealthScanResults({ scanId: TEST_SCAN_ID, size: 101 }, deps)).rejects.toThrow(
        IllegalArgumentError
      );
    });

    it('accepts size 1', async () => {
      const result = await getHealthScanResults({ scanId: TEST_SCAN_ID, size: 1 }, deps);
      expect(result).toBeDefined();
    });

    it('accepts size 100', async () => {
      const result = await getHealthScanResults({ scanId: TEST_SCAN_ID, size: 100 }, deps);
      expect(result).toBeDefined();
    });
  });

  describe('space filtering', () => {
    beforeEach(() => {
      scopedClusterClient.asInternalUser.search.mockImplementation(async (params: any) => {
        if (params?.size === 0) {
          return createMockSummaryAggResponse(10, 2) as any;
        }
        return createMockSearchHitsResponse([createMockHealthDoc()], 1) as any;
      });
    });

    it('always includes a spaceId filter in the scan results query', async () => {
      await getHealthScanResults({ scanId: TEST_SCAN_ID }, deps);

      const resultsCall = scopedClusterClient.asInternalUser.search.mock.calls.find(
        (call: any) => call[0]?.size > 0
      );
      const filter = resultsCall?.[0]?.query?.bool?.filter;
      expect(filter).toEqual(expect.arrayContaining([{ terms: { spaceId: ['default'] } }]));
    });

    it('always includes a spaceId filter in the summary query', async () => {
      await getHealthScanResults({ scanId: TEST_SCAN_ID }, deps);

      const summaryCall = scopedClusterClient.asInternalUser.search.mock.calls.find(
        (call: any) => call[0]?.size === 0
      );
      const filter = summaryCall?.[0]?.query?.bool?.filter;
      expect(filter).toEqual(expect.arrayContaining([{ terms: { spaceId: ['default'] } }]));
    });

    it('filters by multiple space IDs when provided', async () => {
      const multiSpaceDeps = { ...deps, spaceIds: ['space-a', 'space-b'] };
      await getHealthScanResults({ scanId: TEST_SCAN_ID }, multiSpaceDeps);

      const resultsCall = scopedClusterClient.asInternalUser.search.mock.calls.find(
        (call: any) => call[0]?.size > 0
      );
      const filter = resultsCall?.[0]?.query?.bool?.filter;
      expect(filter).toEqual(
        expect.arrayContaining([{ terms: { spaceId: ['space-a', 'space-b'] } }])
      );

      const summaryCall = scopedClusterClient.asInternalUser.search.mock.calls.find(
        (call: any) => call[0]?.size === 0
      );
      const summaryFilter = summaryCall?.[0]?.query?.bool?.filter;
      expect(summaryFilter).toEqual(
        expect.arrayContaining([{ terms: { spaceId: ['space-a', 'space-b'] } }])
      );
    });
  });
});
