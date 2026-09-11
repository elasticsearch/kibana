/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { createThreatReport } from './create_threat_report';

const logger = loggingSystemMock.createLogger();

/** `<spaceId>:<sha256 of title+body>` — deterministic, so dedup is race-free. */
const REPORT_ID_PATTERN = /^[^:]+:[a-f0-9]{64}$/;

const buildEsClient = ({ totalHits = 0 }: { totalHits?: number } = {}) => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.search.mockResolvedValue({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: { value: totalHits, relation: 'eq' as const },
      max_score: null,
      hits: totalHits > 0 ? [{ _id: 'existing-id', _index: '.kibana-threat-reports' }] : [],
    },
  } as ReturnType<typeof esClient.search> extends Promise<infer T> ? T : never);
  esClient.create.mockResolvedValue({
    _id: 'ignored-the-id-is-deterministic',
    _index: '.kibana-threat-reports',
    result: 'created',
    _shards: { total: 1, successful: 1, failed: 0 },
    _seq_no: 0,
    _primary_term: 1,
  } as ReturnType<typeof esClient.create> extends Promise<infer T> ? T : never);
  return esClient;
};

const conflictError = () => Object.assign(new Error('version conflict'), { statusCode: 409 });

const BASE_PARAMS = {
  title: 'Test report',
  body_text: 'The threat actor contacted evil.com',
  source_name: 'Test Vendor',
  source_url: 'https://example.com/report',
} as const;

describe('createThreatReport', () => {
  it('returns ingested status and a deterministic report_id on new report', async () => {
    const esClient = buildEsClient();
    const result = await createThreatReport(esClient, logger, 'default', BASE_PARAMS);
    expect(result.status).toBe('ingested');
    expect(result.report_id).toMatch(REPORT_ID_PATTERN);
    expect(result.report_id.startsWith('default:')).toBe(true);
    expect(esClient.create).toHaveBeenCalledTimes(1);
    // The id written to ES is the one returned to the caller.
    expect(esClient.create.mock.calls[0][0].id).toBe(result.report_id);
  });

  it('returns duplicate status when content fingerprint already exists', async () => {
    const esClient = buildEsClient({ totalHits: 1 });
    const result = await createThreatReport(esClient, logger, 'default', BASE_PARAMS);
    expect(result.status).toBe('duplicate');
    expect(result.report_id).toBe('existing-id');
    expect(esClient.create).not.toHaveBeenCalled();
  });

  it('ignores a missing reports index on the dedup precheck so the first ingest still writes', async () => {
    // The reports index is created lazily on first write. Without
    // ignore_unavailable the precheck would throw index_not_found_exception and
    // 500 the very request that would have created the index.
    const esClient = buildEsClient();
    const result = await createThreatReport(esClient, logger, 'default', BASE_PARAMS);

    expect(esClient.search.mock.calls[0][0]).toEqual(
      expect.objectContaining({ ignore_unavailable: true })
    );
    expect(result.status).toBe('ingested');
    expect(esClient.create).toHaveBeenCalledTimes(1);
  });

  it('reports a duplicate when it loses the create race (409)', async () => {
    // Both requests pass the precheck; only one create can win.
    const esClient = buildEsClient();
    esClient.create.mockRejectedValue(conflictError());

    const result = await createThreatReport(esClient, logger, 'default', BASE_PARAMS);

    expect(result.status).toBe('duplicate');
    // The deterministic id is the winner's id, so no extra lookup is needed.
    expect(result.report_id).toBe(esClient.create.mock.calls[0][0].id);
  });

  it('rethrows non-conflict errors from create', async () => {
    const esClient = buildEsClient();
    esClient.create.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    await expect(createThreatReport(esClient, logger, 'default', BASE_PARAMS)).rejects.toThrow(
      'boom'
    );
  });

  it('scopes the id per space so the same content in another space is not a conflict', async () => {
    const esClient = buildEsClient();
    const inDefault = await createThreatReport(esClient, logger, 'default', BASE_PARAMS);
    const inTeamA = await createThreatReport(esClient, logger, 'team-a', BASE_PARAMS);

    expect(inDefault.report_id).not.toBe(inTeamA.report_id);
    expect(inDefault.report_id.startsWith('default:')).toBe(true);
    expect(inTeamA.report_id.startsWith('team-a:')).toBe(true);
    // Same content, so the fingerprint half matches.
    expect(inDefault.content_fingerprint).toBe(inTeamA.content_fingerprint);
  });

  it('stores only bounded plain text — never a raw HTML body', async () => {
    const esClient = buildEsClient();
    await createThreatReport(esClient, logger, 'default', BASE_PARAMS);

    const createCall = esClient.create.mock.calls[0][0];
    const doc = createCall.document as Record<string, unknown>;
    const content = doc.content as Record<string, unknown>;
    expect(content.body_text).toBe(BASE_PARAMS.body_text);
    expect(content).not.toHaveProperty('body_html');
  });

  it('records source_url as provenance metadata without fetching it', async () => {
    const esClient = buildEsClient();
    await createThreatReport(esClient, logger, 'default', BASE_PARAMS);

    const createCall = esClient.create.mock.calls[0][0];
    const doc = createCall.document as Record<string, unknown>;
    const source = doc.source as Record<string, unknown>;
    // The URL is stored on the report the analyst supplied…
    expect(source.url).toBe(BASE_PARAMS.source_url);
    expect(source.type).toBe('manual');
    // …and nothing about ingesting a report ever reaches out over the network. The
    // service only ever talks to Elasticsearch (search for dedup, then create).
    const esMethodsCalled = Object.entries(esClient)
      .filter(
        ([, value]) =>
          typeof value === 'function' && (value as unknown as jest.Mock).mock?.calls.length
      )
      .map(([name]) => name);
    expect(esMethodsCalled.sort()).toEqual(['create', 'search']);
  });

  it('removes credentials from source provenance', async () => {
    const esClient = buildEsClient();
    await createThreatReport(esClient, logger, 'default', {
      ...BASE_PARAMS,
      source_url: 'https://analyst:secret@example.com/report',
    });

    const document = esClient.create.mock.calls[0][0].document as {
      source: { url?: string };
    };
    expect(document.source.url).toBe('https://example.com/report');
  });

  it.each(['file:///etc/passwd', 'data:text/plain,secret', 'not a url'])(
    'omits invalid source provenance %s',
    async (sourceUrl) => {
      const esClient = buildEsClient();
      await createThreatReport(esClient, logger, 'default', {
        ...BASE_PARAMS,
        source_url: sourceUrl,
      });

      const document = esClient.create.mock.calls[0][0].document as {
        source: { url?: string };
      };
      expect(document.source).not.toHaveProperty('url');
    }
  );

  it('initializes revision to 1 on ingest', async () => {
    const esClient = buildEsClient();
    await createThreatReport(esClient, logger, 'default', BASE_PARAMS);

    const document = esClient.create.mock.calls[0][0].document as {
      revision?: number;
    };
    expect(document.revision).toBe(1);
  });
});
