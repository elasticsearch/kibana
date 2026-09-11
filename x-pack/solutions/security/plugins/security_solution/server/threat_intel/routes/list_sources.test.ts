/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  loadSourceReportStatsByAdapterId,
  loadSourceForMutation,
  mapSourceHit,
  updateSourceBodySchema,
} from './list_sources';

describe('loadSourceReportStatsByAdapterId', () => {
  const logger = {
    warn: jest.fn(),
  };

  const defaultArgs = {
    spaceId: 'default',
    logger: logger as never,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns report counts keyed by adapter id', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        aggregations: {
          by_adapter_id: {
            buckets: [
              {
                key: 'rss:ti-rss-okta',
                doc_count: 3,
                last_ingested: { value_as_string: '2026-07-22T12:00:00.000Z' },
                env_hits: { this_space: { total: { value: 5 } } },
              },
            ],
          },
        },
      }),
    };

    const stats = await loadSourceReportStatsByAdapterId({
      ...defaultArgs,
      esClient: esClient as never,
    });

    expect(stats.get('rss:ti-rss-okta')).toEqual({
      report_count: 3,
      last_ingested_at: '2026-07-22T12:00:00.000Z',
      env_hits_total: 5,
    });
  });

  // Aggregating on source.name merged rows whenever two approved sources shared a
  // display name. The stable adapter id keeps them separate.
  it('keeps two sources that share a display name separate', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        aggregations: {
          by_adapter_id: {
            buckets: [
              {
                key: 'rss:private-copy',
                doc_count: 2,
                env_hits: { this_space: { total: { value: 1 } } },
              },
              {
                key: 'rss:global-copy',
                doc_count: 7,
                env_hits: { this_space: { total: { value: 4 } } },
              },
            ],
          },
        },
      }),
    };

    const stats = await loadSourceReportStatsByAdapterId({
      ...defaultArgs,
      esClient: esClient as never,
    });

    expect(stats.get('rss:private-copy')?.report_count).toBe(2);
    expect(stats.get('rss:global-copy')?.report_count).toBe(7);
  });

  it('aggregates on the stable adapter id rather than the mutable name', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        aggregations: { by_adapter_id: { buckets: [] } },
      }),
    };

    await loadSourceReportStatsByAdapterId({
      ...defaultArgs,
      esClient: esClient as never,
    });

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        aggs: expect.objectContaining({
          by_adapter_id: expect.objectContaining({
            terms: expect.objectContaining({ field: 'source.adapter_id' }),
          }),
        }),
      })
    );
  });

  it('sums env hits through a nested agg filtered to the caller space', async () => {
    // `evidence` is nested (v30). A plain `sum` on a nested field silently
    // returns 0, and an unfiltered nested sum would count every space's element.
    const esClient = {
      search: jest.fn().mockResolvedValue({
        aggregations: { by_adapter_id: { buckets: [] } },
      }),
    };

    await loadSourceReportStatsByAdapterId({
      ...defaultArgs,
      esClient: esClient as never,
    });

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        aggs: expect.objectContaining({
          by_adapter_id: expect.objectContaining({
            aggs: expect.objectContaining({
              env_hits: {
                nested: { path: 'evidence' },
                aggs: {
                  this_space: {
                    filter: { term: { 'evidence.space_id': 'default' } },
                    aggs: {
                      total: { sum: { field: 'evidence.alert_hits_total' } },
                    },
                  },
                },
              },
            }),
          }),
        }),
      })
    );
  });

  it('reads env hits from the nested this_space bucket', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        aggregations: {
          by_adapter_id: {
            buckets: [
              {
                key: 'rss:ti-rss-okta',
                doc_count: 3,
                env_hits: { this_space: { total: { value: 5 } } },
              },
            ],
          },
        },
      }),
    };

    const stats = await loadSourceReportStatsByAdapterId({
      ...defaultArgs,
      esClient: esClient as never,
    });

    expect(stats.get('rss:ti-rss-okta')?.env_hits_total).toBe(5);
  });

  it('applies time_range to the report enrichment query', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        aggregations: { by_adapter_id: { buckets: [] } },
      }),
    };

    await loadSourceReportStatsByAdapterId({
      ...defaultArgs,
      esClient: esClient as never,
      timeRange: { from: '2026-07-16T00:00:00.000Z', to: '2026-07-23T00:00:00.000Z' },
    });

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([
              {
                range: {
                  '@timestamp': {
                    gte: '2026-07-16T00:00:00.000Z',
                    lte: '2026-07-23T00:00:00.000Z',
                  },
                },
              },
            ]),
          },
        },
      })
    );
  });

  it('returns an empty map when enrichment search fails', async () => {
    const esClient = {
      search: jest.fn().mockRejectedValue(new Error('index missing')),
    };

    const stats = await loadSourceReportStatsByAdapterId({
      ...defaultArgs,
      esClient: esClient as never,
    });

    expect(stats.size).toBe(0);
  });
});

describe('mapSourceHit', () => {
  it('returns the catalog URL for a known source id', () => {
    const mapped = mapSourceHit({
      _id: 'vendor_api:elastic-security-labs',
      _source: {
        name: 'Elastic Security Labs',
        adapter_type: 'rss',
      },
    });

    expect(mapped.url).toBe('https://www.elastic.co/security-labs/rss/feed.xml');
  });

  it('omits the url when the source id is outside the catalog', () => {
    const mapped = mapSourceHit({
      _id: 'rss:unknown',
      _source: { name: 'Acme', adapter_type: 'rss' },
    });

    expect(mapped.url).toBeUndefined();
  });
});

describe('loadSourceForMutation', () => {
  const globalSource = (spaceId?: string) => ({
    get: jest.fn().mockResolvedValue({
      _source: { name: 'Acme', adapter_type: 'rss', space_id: spaceId },
    }),
  });

  it('allows a space to mutate its own source', async () => {
    const access = await loadSourceForMutation({
      esClient: globalSource('space-a') as never,
      sourceId: 'rss:mandiant-research',
      spaceId: 'space-a',
    });

    expect(access.allowed).toBe(true);
  });

  // A 403 told the caller a source with this id exists in some other space, which
  // is an existence oracle across a boundary the rest of the feature treats as a
  // security boundary. Both outcomes have to look the same.
  it("reports another space's source as simply not found", async () => {
    const access = await loadSourceForMutation({
      esClient: globalSource('space-a') as never,
      sourceId: 'rss:mandiant-research',
      spaceId: 'space-b',
    });

    expect(access).toEqual({ allowed: false });
  });

  it('reports a genuinely absent source the same way', async () => {
    const esClient = {
      get: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { statusCode: 404 })),
    };

    const access = await loadSourceForMutation({
      esClient: esClient as never,
      sourceId: 'space-b:rss:nope',
      spaceId: 'space-b',
    });

    expect(access).toEqual({ allowed: false });
  });

  it('rethrows an unexpected Elasticsearch failure', async () => {
    const esClient = {
      get: jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 503 })),
    };

    await expect(
      loadSourceForMutation({
        esClient: esClient as never,
        sourceId: 'rss:mandiant-research',
        spaceId: 'default',
      })
    ).rejects.toThrow('boom');
  });
});

describe('update source schema — enable/disable only', () => {
  it('accepts a bare enabled toggle', () => {
    expect(() => updateSourceBodySchema.validate({ enabled: true })).not.toThrow();
    expect(() => updateSourceBodySchema.validate({ enabled: false })).not.toThrow();
  });

  it('requires enabled', () => {
    expect(() => updateSourceBodySchema.validate({})).toThrow();
  });

  // The approved catalog is fixed, so an operator can only flip `enabled`. Any
  // attempt to re-point, rename, retag, or re-vendor a source is rejected.
  it.each([
    ['url', { enabled: true, url: 'https://evil.example/feed.xml' }],
    ['name', { enabled: true, name: 'Renamed' }],
    ['adapter_type', { enabled: true, adapter_type: 'rss' }],
    ['tags', { enabled: true, tags: ['x'] }],
    ['vendor', { enabled: true, vendor: 'vendor_api:elastic-security-labs' }],
    ['id', { enabled: true, id: 'rss:injected' }],
  ])('rejects an attempt to change %s', (_field, body) => {
    expect(() => updateSourceBodySchema.validate(body)).toThrow();
  });
});
