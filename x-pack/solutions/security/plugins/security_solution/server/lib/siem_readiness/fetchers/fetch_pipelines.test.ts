/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { CategoriesResponse, MainCategories } from '@kbn/siem-readiness';
import { fetchPipelines } from './fetch_pipelines';

const MINUTE = 60 * 1000;

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

/** Group an indexName -> main category mapping into the CategoriesResponse shape. */
const buildCategoriesData = (mapping: Record<string, MainCategories>): CategoriesResponse => {
  const byCategory = new Map<string, Array<{ indexName: string; docs: number }>>();
  Object.entries(mapping).forEach(([indexName, category]) => {
    const indices = byCategory.get(category) ?? [];
    indices.push({ indexName, docs: 1 });
    byCategory.set(category, indices);
  });

  return {
    rawCategoriesMap: [],
    mainCategoriesMap: Array.from(byCategory.entries()).map(([category, indices]) => ({
      category,
      indices,
    })),
  };
};

// Sub-category event.category values that map back to a main category in fetch_categories.ts,
// used to drive the self-fetch (categories search) path.
const SUBCATEGORY_BY_MAIN: Record<MainCategories, string> = {
  Endpoint: 'process',
  Identity: 'user',
  Network: 'network',
  Cloud: 'cloud',
  'Application/SaaS': 'application',
};

interface MakeEsClientArgs {
  /** index name -> default_pipeline */
  indexToPipeline: Record<string, string>;
  /** pipeline name -> ingest doc count (must be > 0 to be included) */
  pipelineCounts: Record<string, number>;
  /** data stream name -> maximum_timestamp (epoch ms) */
  lastEventByStream: Record<string, number>;
  /** index name -> main category, used to build the by_index categories search response */
  categoriesSearchMapping?: Record<string, MainCategories>;
  /** records whether the categories aggregation (by_index) search was issued */
  searchSpy?: { categoriesSearchCalled: boolean };
}

const makeEsClient = ({
  indexToPipeline,
  pipelineCounts,
  lastEventByStream,
  categoriesSearchMapping = {},
  searchSpy,
}: MakeEsClientArgs): ElasticsearchClient => {
  const settingsResponse: Record<string, { settings: { index: { default_pipeline: string } } }> =
    {};
  Object.entries(indexToPipeline).forEach(([indexName, pipeline]) => {
    settingsResponse[indexName] = { settings: { index: { default_pipeline: pipeline } } };
  });

  const ingestPipelines: Record<string, { count: number; failed: number }> = {};
  Object.entries(pipelineCounts).forEach(([name, count]) => {
    ingestPipelines[name] = { count, failed: 0 };
  });

  // Build the categories (by_index) aggregation response from the index -> main-category mapping.
  const byIndexBuckets = Object.entries(categoriesSearchMapping).map(
    ([indexName, mainCategory]) => ({
      key: indexName,
      doc_count: 1,
      by_category: { buckets: [{ key: SUBCATEGORY_BY_MAIN[mainCategory], doc_count: 1 }] },
    })
  );

  return {
    indices: {
      getSettings: jest.fn().mockResolvedValue(settingsResponse),
      dataStreamsStats: jest.fn().mockResolvedValue({
        data_streams: Object.entries(lastEventByStream).map(([name, maximum_timestamp]) => ({
          data_stream: name,
          maximum_timestamp,
        })),
      }),
      getDataStream: jest.fn().mockResolvedValue({ data_streams: [] }),
    },
    nodes: {
      stats: jest.fn().mockResolvedValue({
        nodes: { node1: { ingest: { pipelines: ingestPipelines } } },
      }),
    },
    search: jest.fn().mockImplementation((params: { aggs?: Record<string, unknown> }) => {
      // Volume composite aggregation from fetchIndexHealth — not needed for silence assertions.
      if (params?.aggs?.by_index_day) {
        return Promise.resolve({ aggregations: { by_index_day: { buckets: [] } } });
      }
      // Categories aggregation from fetchCategories (self-fetch path).
      if (params?.aggs?.by_index) {
        if (searchSpy) searchSpy.categoriesSearchCalled = true;
        return Promise.resolve({ aggregations: { by_index: { buckets: byIndexBuckets } } });
      }
      return Promise.resolve({});
    }),
  } as unknown as ElasticsearchClient;
};

describe('fetchPipelines - per-category silence threshold', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does NOT flag an Application/SaaS pipeline silent between 30m and 24h (regression)', async () => {
    const now = Date.now();
    const esClient = makeEsClient({
      indexToPipeline: { 'idx-app': 'pipe-app' },
      pipelineCounts: { 'pipe-app': 5 },
      lastEventByStream: { 'idx-app': now - 60 * MINUTE }, // 1h ago
    });

    const result = await fetchPipelines({
      esClient,
      isServerless: false,
      logger,
      categoriesData: buildCategoriesData({ 'idx-app': 'Application/SaaS' }),
    });

    const pipe = result.find((p) => p.name === 'pipe-app');
    expect(pipe?.categories).toEqual(['Application/SaaS']);
    expect(pipe?.isSilent).toBe(false);
  });

  it('does NOT flag a Cloud pipeline silent between 30m and 1h', async () => {
    const now = Date.now();
    const esClient = makeEsClient({
      indexToPipeline: { 'idx-cloud': 'pipe-cloud' },
      pipelineCounts: { 'pipe-cloud': 5 },
      lastEventByStream: { 'idx-cloud': now - 45 * MINUTE }, // 45m ago
    });

    const result = await fetchPipelines({
      esClient,
      isServerless: false,
      logger,
      categoriesData: buildCategoriesData({ 'idx-cloud': 'Cloud' }),
    });

    const pipe = result.find((p) => p.name === 'pipe-cloud');
    expect(pipe?.categories).toEqual(['Cloud']);
    expect(pipe?.isSilent).toBe(false);
  });

  it('flags an Endpoint pipeline silent past the 30m default threshold', async () => {
    const now = Date.now();
    const esClient = makeEsClient({
      indexToPipeline: { 'idx-endpoint': 'pipe-endpoint' },
      pipelineCounts: { 'pipe-endpoint': 5 },
      lastEventByStream: { 'idx-endpoint': now - 45 * MINUTE }, // 45m ago > 30m
    });

    const result = await fetchPipelines({
      esClient,
      isServerless: false,
      logger,
      categoriesData: buildCategoriesData({ 'idx-endpoint': 'Endpoint' }),
    });

    const pipe = result.find((p) => p.name === 'pipe-endpoint');
    expect(pipe?.categories).toEqual(['Endpoint']);
    expect(pipe?.isSilent).toBe(true);
  });

  it('uses the most lenient (max) threshold for a pipeline spanning multiple categories', async () => {
    const now = Date.now();
    const esClient = makeEsClient({
      indexToPipeline: { 'idx-multi-ep': 'pipe-multi', 'idx-multi-app': 'pipe-multi' },
      pipelineCounts: { 'pipe-multi': 5 },
      lastEventByStream: {
        'idx-multi-ep': now - 60 * MINUTE,
        'idx-multi-app': now - 60 * MINUTE,
      }, // 1h ago: silent for Endpoint (30m) but not Application/SaaS (24h)
    });

    const result = await fetchPipelines({
      esClient,
      isServerless: false,
      logger,
      categoriesData: buildCategoriesData({
        'idx-multi-ep': 'Endpoint',
        'idx-multi-app': 'Application/SaaS',
      }),
    });

    const pipe = result.find((p) => p.name === 'pipe-multi');
    expect(pipe?.categories).toEqual(expect.arrayContaining(['Endpoint', 'Application/SaaS']));
    expect(pipe?.isSilent).toBe(false);
  });

  it('does not issue a categories aggregation when categoriesData is provided', async () => {
    const now = Date.now();
    const searchSpy = { categoriesSearchCalled: false };
    const esClient = makeEsClient({
      indexToPipeline: { 'idx-app': 'pipe-app' },
      pipelineCounts: { 'pipe-app': 5 },
      lastEventByStream: { 'idx-app': now - 60 * MINUTE },
      searchSpy,
    });

    await fetchPipelines({
      esClient,
      isServerless: false,
      logger,
      categoriesData: buildCategoriesData({ 'idx-app': 'Application/SaaS' }),
    });

    expect(searchSpy.categoriesSearchCalled).toBe(false);
  });

  it('self-fetches categories (and applies the threshold) when categoriesData is omitted', async () => {
    const now = Date.now();
    const searchSpy = { categoriesSearchCalled: false };
    const esClient = makeEsClient({
      indexToPipeline: { 'idx-app': 'pipe-app' },
      pipelineCounts: { 'pipe-app': 5 },
      lastEventByStream: { 'idx-app': now - 60 * MINUTE }, // 1h ago
      categoriesSearchMapping: { 'idx-app': 'Application/SaaS' },
      searchSpy,
    });

    const result = await fetchPipelines({ esClient, isServerless: false, logger });

    const pipe = result.find((p) => p.name === 'pipe-app');
    expect(searchSpy.categoriesSearchCalled).toBe(true);
    expect(pipe?.categories).toEqual(['Application/SaaS']);
    expect(pipe?.isSilent).toBe(false);
  });
});
