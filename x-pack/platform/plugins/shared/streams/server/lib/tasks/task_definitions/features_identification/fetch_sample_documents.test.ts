/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import { BasicPrettyPrinter } from '@elastic/esql';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { FeatureWithFilter } from '@kbn/significant-events-schema';
import { getDiverseSampleDocuments, getSampleDocumentsEsql } from '@kbn/ai-tools';
import { fetchSampleDocuments } from './fetch_sample_documents';

jest.mock('@kbn/ai-tools', () => ({
  getDiverseSampleDocuments: jest.fn(),
  getSampleDocumentsEsql: jest.fn(),
}));

const getDiverseSampleDocumentsMock = jest.mocked(getDiverseSampleDocuments);
const getSampleDocumentsEsqlMock = jest.mocked(getSampleDocumentsEsql);

const createHit = (id: string): SearchHit<Record<string, unknown>> => ({
  _index: '',
  _id: id,
  _source: {},
});

const createFeature = ({
  id,
  updatedAt,
  field,
  value,
}: {
  id: string;
  updatedAt: string;
  field: string;
  value: string;
}): FeatureWithFilter =>
  ({
    id,
    stream_name: 'logs.test-default',
    type: 'system',
    description: id,
    properties: {},
    confidence: 80,
    updated_at: updatedAt,
    filter: { field, eq: value },
  } as FeatureWithFilter);

const logger = {
  debug: jest.fn(),
  warn: jest.fn(),
} as unknown as Logger;

describe('fetchSampleDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid sampling ratios', async () => {
    const baseParams = {
      esClient: {} as ElasticsearchClient,
      index: 'logs.test-default',
      start: 100,
      end: 200,
      features: [],
      logger,
      size: 5,
      maxEntityFilters: 10,
    };

    await expect(
      fetchSampleDocuments({
        ...baseParams,
        entityFilteredRatio: -0.1,
        diverseRatio: 0,
      })
    ).rejects.toThrow('must be >= 0');

    await expect(
      fetchSampleDocuments({
        ...baseParams,
        entityFilteredRatio: 0.8,
        diverseRatio: 0.3,
      })
    ).rejects.toThrow('must be <= 1');
  });

  it('uses ES|QL random sampling when there are no entity filters', async () => {
    const esClient = {} as ElasticsearchClient;
    getSampleDocumentsEsqlMock.mockResolvedValueOnce({
      hits: [createHit('random-1')],
      total: 1,
    });

    const result = await fetchSampleDocuments({
      esClient,
      index: 'logs.test-default',
      start: 100,
      end: 200,
      features: [],
      logger,
      size: 5,
      entityFilteredRatio: 0.4,
      diverseRatio: 0,
      maxEntityFilters: 10,
    });

    expect(getSampleDocumentsEsqlMock).toHaveBeenCalledWith({
      esClient,
      index: 'logs.test-default',
      start: 100,
      end: 200,
      sampleSize: 5,
    });
    expect(getDiverseSampleDocumentsMock).not.toHaveBeenCalled();
    expect(result.documents.map((document) => document._id)).toEqual(['random-1']);
    expect(result.hasFilteredDocuments).toBe(false);
  });

  it('uses ES|QL entity filtering with LOAD and leaves the random arm unfiltered', async () => {
    const esClient = { fieldCaps: jest.fn() } as unknown as ElasticsearchClient;
    const features = [
      createFeature({
        id: 'older',
        updatedAt: '2026-01-01T00:00:00.000Z',
        field: 'host.name',
        value: 'host-a',
      }),
      createFeature({
        id: 'newer',
        updatedAt: '2026-01-02T00:00:00.000Z',
        field: 'service.name',
        value: 'checkout',
      }),
    ];

    getSampleDocumentsEsqlMock
      .mockResolvedValueOnce({ hits: [createHit('entity-1')], total: 1 })
      .mockResolvedValueOnce({ hits: [createHit('random-1')], total: 1 });
    getDiverseSampleDocumentsMock.mockResolvedValueOnce({ hits: [createHit('diverse-1')] });

    const result = await fetchSampleDocuments({
      esClient,
      index: 'logs.test-default',
      start: 100,
      end: 200,
      features,
      logger,
      size: 10,
      entityFilteredRatio: 0.4,
      diverseRatio: 0.2,
      maxEntityFilters: 1,
    });

    const entityFilteredCall = getSampleDocumentsEsqlMock.mock.calls[0][0];
    expect(entityFilteredCall).toEqual(
      expect.objectContaining({
        esClient,
        index: 'logs.test-default',
        start: 100,
        end: 200,
        sampleSize: 4,
        unmappedFields: 'LOAD',
      })
    );
    expect(BasicPrettyPrinter.print(entityFilteredCall.whereCondition!)).toBe(
      'NOT COALESCE(`service.name` == "checkout", FALSE)'
    );

    expect(getDiverseSampleDocumentsMock).toHaveBeenCalledWith({
      esClient,
      index: 'logs.test-default',
      start: 100,
      end: 200,
      size: 6,
      offset: 0,
      logger,
    });
    expect(getSampleDocumentsEsqlMock.mock.calls[1][0]).toEqual({
      esClient,
      index: 'logs.test-default',
      start: 100,
      end: 200,
      sampleSize: 10,
    });
    expect(esClient.fieldCaps).not.toHaveBeenCalled();
    expect(result.documents.map((document) => document._id)).toEqual([
      'entity-1',
      'diverse-1',
      'random-1',
    ]);
    expect(result.filtersCapped).toBe(true);
    expect(result.hasFilteredDocuments).toBe(true);
  });

  it('falls back to random documents when entity-filtered ES|QL sampling fails', async () => {
    const esClient = {} as ElasticsearchClient;
    const features = [
      createFeature({
        id: 'feature-1',
        updatedAt: '2026-01-02T00:00:00.000Z',
        field: 'service.name',
        value: 'checkout',
      }),
    ];

    getSampleDocumentsEsqlMock
      .mockRejectedValueOnce(new Error('verification_exception'))
      .mockResolvedValueOnce({ hits: [createHit('random-1')], total: 1 });

    const result = await fetchSampleDocuments({
      esClient,
      index: 'logs.test-default',
      start: 100,
      end: 200,
      features,
      logger,
      size: 5,
      entityFilteredRatio: 0.4,
      diverseRatio: 0,
      maxEntityFilters: 10,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Entity-filtered sampling query failed: verification_exception'
    );
    expect(result.documents.map((document) => document._id)).toEqual(['random-1']);
    expect(result.hasFilteredDocuments).toBe(false);
  });
});
