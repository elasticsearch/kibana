/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import {
  buildFindReportFilters,
  findThreatReports,
  USABLE_REPORT_FILTER,
} from './find_threat_reports';
import { encodeCursor, InvalidCursorError } from '../lib/report_cursor';

const buildHit = ({
  id,
  sort,
  source,
}: {
  id: string;
  sort: Array<string | number | boolean | null>;
  source?: Record<string, unknown>;
}) => ({
  _id: id,
  _index: '.kibana-threat-reports',
  sort,
  _source: {
    revision: 1,
    content: { title: 'Report', body_text: 'Body text with indicators' },
    severity: { level: 'high', score: 0.8 },
    extracted: {
      iocs: [{ type: 'domain', value: 'evil.com' }],
    },
    ...source,
  },
});

const buildSearchResponse = (hits: ReturnType<typeof buildHit>[], pitId = 'pit-1') =>
  ({
    took: 1,
    timed_out: false,
    pit_id: pitId,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: hits.length, relation: 'eq' as const }, max_score: null, hits },
  } as const);

const createEsClient = () => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.openPointInTime.mockResolvedValue({ id: 'pit-1' } as never);
  esClient.closePointInTime.mockResolvedValue({ succeeded: true, num_freed: 1 } as never);
  return esClient;
};

describe('buildFindReportFilters', () => {
  const defaultArgs = {
    spaceId: 'default',
  };

  it('returns a space filter for the current space and global sentinel', () => {
    expect(buildFindReportFilters(defaultArgs)).toEqual([
      { terms: { space_id: ['default', '*'] } },
    ]);
  });

  it('returns a source.name term when source is set', () => {
    expect(buildFindReportFilters({ ...defaultArgs, source: 'CISA' })).toEqual(
      expect.arrayContaining([{ term: { 'source.name': 'CISA' } }])
    );
  });

  it('returns a severity.level terms filter for multiple severities', () => {
    expect(buildFindReportFilters({ ...defaultArgs, severity: ['high', 'critical'] })).toEqual(
      expect.arrayContaining([{ terms: { 'severity.level': ['high', 'critical'] } }])
    );
  });

  it('returns an extracted.categories terms filter when category is set', () => {
    expect(buildFindReportFilters({ ...defaultArgs, category: 'ransomware' })).toEqual(
      expect.arrayContaining([{ terms: { 'extracted.categories': ['ransomware'] } }])
    );
  });

  it('returns an @timestamp range when from/to are set', () => {
    expect(
      buildFindReportFilters({
        ...defaultArgs,
        from: '2024-01-01T00:00:00.000Z',
        to: '2024-02-01T00:00:00.000Z',
      })
    ).toEqual(
      expect.arrayContaining([
        {
          range: {
            '@timestamp': {
              gte: '2024-01-01T00:00:00.000Z',
              lte: '2024-02-01T00:00:00.000Z',
            },
          },
        },
      ])
    );
  });

  it('returns the usable-bar filter when usableOnly is true', () => {
    expect(buildFindReportFilters({ ...defaultArgs, usableOnly: true })).toEqual(
      expect.arrayContaining([USABLE_REPORT_FILTER])
    );
  });
});

describe('findThreatReports', () => {
  const defaultArgs = {
    spaceId: 'default',
    pageSize: 2,
  };

  it('returns mapped summary items from search hits', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([buildHit({ id: 'r1', sort: [0.9, 1] })]) as never
    );

    const result = await findThreatReports(esClient, defaultArgs);

    expect(result.items).toEqual([
      expect.objectContaining({
        reportId: 'r1',
        revision: 1,
        title: 'Report',
        severity: { level: 'high', score: 0.8 },
        iocs: [{ type: 'domain', value: 'evil.com' }],
      }),
    ]);
  });

  it('returns a nextCursor carrying the pit id and last sort values when more pages remain', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([
        buildHit({ id: 'r1', sort: [0.9, 1] }),
        buildHit({ id: 'r2', sort: [0.8, 2] }),
        buildHit({ id: 'r3', sort: [0.7, 3] }),
      ]) as never
    );

    const result = await findThreatReports(esClient, defaultArgs);

    expect(result.nextCursor).toBe(
      encodeCursor({ version: 2, pitId: 'pit-1', sort: 'relevance', sortValues: [0.8, 2] })
    );
  });

  it('returns a nextCursor when the primary sort value is an ISO date string', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([
        buildHit({ id: 'r1', sort: ['2024-02-01T00:00:00.000Z', 1] }),
        buildHit({ id: 'r2', sort: ['2024-01-15T00:00:00.000Z', 2] }),
        buildHit({ id: 'r3', sort: ['2024-01-01T00:00:00.000Z', 3] }),
      ]) as never
    );

    const result = await findThreatReports(esClient, {
      ...defaultArgs,
      sort: 'updated_at',
    });

    expect(result.nextCursor).toBe(
      encodeCursor({
        version: 2,
        pitId: 'pit-1',
        sort: 'updated_at',
        sortValues: ['2024-01-15T00:00:00.000Z', 2],
      })
    );
  });

  it('throws rather than silently ending pagination when sort values cannot be encoded', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([
        buildHit({ id: 'r1', sort: [true, 1] }),
        buildHit({ id: 'r2', sort: [true, 2] }),
        buildHit({ id: 'r3', sort: [true, 3] }),
      ]) as never
    );

    await expect(findThreatReports(esClient, defaultArgs)).rejects.toThrow(
      /Unable to encode threat report pagination cursor/
    );
    expect(esClient.closePointInTime).toHaveBeenCalledWith({ id: 'pit-1' });
  });

  it('returns a null nextCursor on the last page', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([buildHit({ id: 'r1', sort: [0.9, 1] })]) as never
    );

    const result = await findThreatReports(esClient, defaultArgs);

    expect(result.nextCursor).toBeNull();
  });

  it('returns after closing the point-in-time on the last page', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([buildHit({ id: 'r1', sort: [0.9, 1] })]) as never
    );

    await findThreatReports(esClient, defaultArgs);

    expect(esClient.closePointInTime).toHaveBeenCalledWith({ id: 'pit-1' });
  });

  it('returns without closing the point-in-time when more pages remain', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([
        buildHit({ id: 'r1', sort: [0.9, 1] }),
        buildHit({ id: 'r2', sort: [0.8, 2] }),
        buildHit({ id: 'r3', sort: [0.7, 3] }),
      ]) as never
    );

    await findThreatReports(esClient, defaultArgs);

    expect(esClient.closePointInTime).not.toHaveBeenCalled();
  });

  it('returns a search that sorts by extracted.relevance with a _shard_doc tiebreak for sort=relevance', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(buildSearchResponse([]) as never);

    await findThreatReports(esClient, { ...defaultArgs, sort: 'relevance' });

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: [
          { 'extracted.relevance': { order: 'desc', missing: '_last' } },
          { _shard_doc: { order: 'asc' } },
        ],
      })
    );
  });

  it('returns a search that sorts by rank_score with a _shard_doc tiebreak for sort=rank', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(buildSearchResponse([]) as never);

    await findThreatReports(esClient, { ...defaultArgs, sort: 'rank' });

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: [
          { rank_score: { order: 'desc', missing: '_last' } },
          { _shard_doc: { order: 'asc' } },
        ],
      })
    );
  });

  it('returns a search that sorts by lineage.extracted_at with a _shard_doc tiebreak for sort=updated_at', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(buildSearchResponse([]) as never);

    await findThreatReports(esClient, { ...defaultArgs, sort: 'updated_at' });

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: [
          { 'lineage.extracted_at': { order: 'desc', missing: '_last' } },
          { _shard_doc: { order: 'asc' } },
        ],
      })
    );
  });

  it('returns a first-page search that opens a point-in-time over the hidden reports index', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(buildSearchResponse([]) as never);

    await findThreatReports(esClient, defaultArgs);

    expect(esClient.openPointInTime).toHaveBeenCalledWith(
      expect.objectContaining({
        index: '.kibana-threat-reports*',
        keep_alive: '2m',
        expand_wildcards: ['open', 'hidden'],
        ignore_unavailable: true,
        allow_no_indices: true,
      })
    );
  });

  it('returns a first-page search that runs against the point-in-time, not an index', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(buildSearchResponse([]) as never);

    await findThreatReports(esClient, defaultArgs);

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({ pit: { id: 'pit-1', keep_alive: '2m' } })
    );
  });

  it('returns empty when the reports index does not exist yet', async () => {
    const esClient = createEsClient();
    esClient.openPointInTime.mockRejectedValue({ statusCode: 404 } as never);

    const result = await findThreatReports(esClient, defaultArgs);

    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('reuses the cursor pit id instead of opening a new point-in-time', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(buildSearchResponse([]) as never);
    const cursor = encodeCursor({
      version: 2,
      pitId: 'pit-existing',
      sort: 'relevance',
      sortValues: [0.5, 9],
    });

    await findThreatReports(esClient, { ...defaultArgs, cursor });

    expect(esClient.openPointInTime).not.toHaveBeenCalled();
  });

  it('returns a search_after and pit from a decoded cursor', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(buildSearchResponse([]) as never);
    const cursor = encodeCursor({
      version: 2,
      pitId: 'pit-existing',
      sort: 'relevance',
      sortValues: [0.5, 9],
    });

    await findThreatReports(esClient, { ...defaultArgs, cursor });

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        pit: { id: 'pit-existing', keep_alive: '2m' },
        search_after: [0.5, 9],
      })
    );
  });

  it('throws InvalidCursorError when the cursor was minted for a different sort', async () => {
    const esClient = createEsClient();
    const cursor = encodeCursor({
      version: 2,
      pitId: 'pit-existing',
      sort: 'rank',
      sortValues: [0.5, 9],
    });

    await expect(
      findThreatReports(esClient, { ...defaultArgs, sort: 'relevance', cursor })
    ).rejects.toThrow(InvalidCursorError);
  });

  it('throws InvalidCursorError when the point-in-time has expired', async () => {
    const esClient = createEsClient();
    // ES reports an expired PIT as a 404 whose top-level type is
    // search_phase_execution_exception; the real cause is in the shard reason.
    esClient.search.mockRejectedValue({
      body: {
        error: {
          type: 'search_phase_execution_exception',
          reason: 'all shards failed',
          failed_shards: [{ reason: { type: 'search_context_missing_exception' } }],
        },
      },
    });
    const cursor = encodeCursor({
      version: 2,
      pitId: 'pit-existing',
      sort: 'relevance',
      sortValues: [0.5, 9],
    });

    await expect(findThreatReports(esClient, { ...defaultArgs, cursor })).rejects.toThrow(
      InvalidCursorError
    );
  });

  it('closes a point-in-time it opened when the first-page search fails', async () => {
    const esClient = createEsClient();
    esClient.search.mockRejectedValue(new Error('boom'));

    await expect(findThreatReports(esClient, defaultArgs)).rejects.toThrow('boom');
    expect(esClient.closePointInTime).toHaveBeenCalledWith({ id: 'pit-1' });
  });

  it('does not close a cursor-supplied point-in-time when the search fails', async () => {
    const esClient = createEsClient();
    esClient.search.mockRejectedValue(new Error('boom'));
    const cursor = encodeCursor({
      version: 2,
      pitId: 'pit-existing',
      sort: 'relevance',
      sortValues: [0.5, 9],
    });

    await expect(findThreatReports(esClient, { ...defaultArgs, cursor })).rejects.toThrow('boom');
    expect(esClient.closePointInTime).not.toHaveBeenCalled();
  });

  it('returns diamond summary fields when present on the hit', async () => {
    const esClient = createEsClient();
    esClient.search.mockResolvedValue(
      buildSearchResponse([
        buildHit({
          id: 'r1',
          sort: [0.9, 1],
          source: {
            extracted: {
              iocs: [{ type: 'domain', value: 'evil.com' }],
              diamond: { signal_count: 3, suitable: true },
            },
          },
        }),
      ]) as never
    );

    const result = await findThreatReports(esClient, defaultArgs);

    expect(result.items[0].diamond).toEqual({ signalCount: 3, suitable: true });
  });
});
