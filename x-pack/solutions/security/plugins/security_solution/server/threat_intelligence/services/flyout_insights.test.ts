/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { flyoutInsights, parseReportIdFromIndicatorReference } from './flyout_insights';

const sampleReportSource = {
  '@timestamp': '2026-05-01T00:00:00.000Z',
  content: { title: 'Ransomware campaign' },
  source: { type: 'rss', name: 'Feed', url: 'https://example.com/report' },
  severity: { level: 'high' },
  provenance: {
    extracted_at: '2026-05-01T01:00:00.000Z',
    environment_hits_total: 3,
  },
  extracted: {
    behaviors: [{ technique_id: 'T1059' }],
    ttps: { techniques: ['T1059.003'] },
  },
};

describe('parseReportIdFromIndicatorReference', () => {
  it('parses threat-report prefix', () => {
    expect(parseReportIdFromIndicatorReference('threat-report:abc-123')).toBe('abc-123');
  });

  it('returns undefined for missing or invalid reference', () => {
    expect(parseReportIdFromIndicatorReference(undefined)).toBeUndefined();
    expect(parseReportIdFromIndicatorReference('other:abc')).toBeUndefined();
    expect(parseReportIdFromIndicatorReference('threat-report:')).toBeUndefined();
  });
});

describe('flyoutInsights', () => {
  const createEsClient = ({
    getResult,
    searchHits = [],
  }: {
    getResult?: { found: boolean; _id?: string; _source?: typeof sampleReportSource };
    searchHits?: Array<{ _id: string; _source?: typeof sampleReportSource }>;
  }): ElasticsearchClient =>
    ({
      get: jest.fn().mockResolvedValue(getResult ?? { found: false }),
      search: jest.fn().mockResolvedValue({
        hits: { hits: searchHits },
      }),
    } as unknown as ElasticsearchClient);

  it('returns Layer 1 report from indicator reference', async () => {
    const esClient = createEsClient({
      getResult: { found: true, _id: 'report-1', _source: sampleReportSource },
    });

    const result = await flyoutInsights(esClient, 'default', {
      alert_id: 'alert-1',
      indicator_reference: 'threat-report:report-1',
    });

    expect(result.related_reports).toHaveLength(1);
    expect(result.related_reports[0].join_reason).toBe('ioc_reference');
    expect(result.related_reports[0].report_id).toBe('report-1');
    expect(result.meta.layer_1_resolved).toBe(true);
  });

  it('runs Layer 2 search when techniques are provided', async () => {
    const esClient = createEsClient({
      searchHits: [
        {
          _id: 'report-2',
          _source: {
            ...sampleReportSource,
            content: { title: 'Overlap report' },
            extracted: { behaviors: [{ technique_id: 'T1059' }], ttps: { techniques: [] } },
          },
        },
      ],
    });

    const result = await flyoutInsights(esClient, 'default', {
      alert_id: 'alert-1',
      technique_ids: ['T1059'],
    });

    expect(esClient.search).toHaveBeenCalled();
    expect(result.related_reports).toHaveLength(1);
    expect(result.related_reports[0].join_reason).toBe('technique_overlap');
    expect(result.related_reports[0].matched_technique_ids).toEqual(['T1059']);
  });

  it('dedupes Layer 1 id from Layer 2 search', async () => {
    const esClient = createEsClient({
      getResult: { found: true, _id: 'report-1', _source: sampleReportSource },
      searchHits: [],
    });

    await flyoutInsights(esClient, 'default', {
      alert_id: 'alert-1',
      indicator_reference: 'threat-report:report-1',
      technique_ids: ['T1059'],
    });

    const searchCall = jest.mocked(esClient.search).mock.calls[0]?.[0] as {
      query?: { bool?: { must_not?: unknown[] } };
    };
    expect(searchCall.query?.bool?.must_not).toEqual([{ term: { _id: 'report-1' } }]);
  });

  it('returns empty related_reports when no join keys', async () => {
    const esClient = createEsClient({});

    const result = await flyoutInsights(esClient, 'default', {
      alert_id: 'alert-1',
    });

    expect(result.related_reports).toEqual([]);
    expect(esClient.get).not.toHaveBeenCalled();
    expect(esClient.search).not.toHaveBeenCalled();
  });

  it('continues to Layer 2 when Layer 1 doc is missing', async () => {
    const esClient = createEsClient({
      getResult: { found: false },
      searchHits: [{ _id: 'report-2', _source: sampleReportSource }],
    });

    const result = await flyoutInsights(esClient, 'default', {
      alert_id: 'alert-1',
      indicator_reference: 'threat-report:missing',
      technique_ids: ['T1059'],
    });

    expect(result.meta.layer_1_resolved).toBe(false);
    expect(result.related_reports).toHaveLength(1);
    expect(result.related_reports[0].report_id).toBe('report-2');
  });
});
