/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature, QueryLink, StreamQuery } from '@kbn/streams-schema';
import { searchKnowledgeIndicators } from './search';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-id',
    uuid: 'feature-uuid',
    stream_name: 'logs.test',
    type: 'dataset_analysis',
    description: 'Feature description',
    properties: {},
    confidence: 90,
    ...overrides,
  };
}

function makeStreamQuery(overrides: Partial<StreamQuery> = {}): StreamQuery {
  return {
    id: 'query-id',
    type: 'match',
    title: 'Query title',
    description: 'Query description',
    esql: { query: 'FROM logs-*' },
    ...overrides,
  };
}

describe('searchKnowledgeIndicators', () => {
  it('returns both features and queries by default', async () => {
    const res = await searchKnowledgeIndicators({
      params: {},
      getStreamNames: async () => ['logs.test'],
      getFeatures: async () => [makeFeature({ id: 'f1', confidence: 80 })],
      getQueries: async () => [
        {
          query: makeStreamQuery({ id: 'q1', severity_score: 50 }),
          rule_backed: true,
          rule_id: 'rule-1',
          stream_name: 'logs.test',
        },
      ],
    });

    expect(res.knowledge_indicators).toHaveLength(2);
    expect(res.knowledge_indicators[0].kind).toBe('feature');
    expect(res.knowledge_indicators[1].kind).toBe('query');
  });

  it('supports kind=[query] (queries-only)', async () => {
    const getFeatures = jest.fn();
    const getQueries = jest.fn(
      async (): Promise<QueryLink[]> => [
        {
          query: makeStreamQuery({ id: 'q1' }),
          rule_backed: false,
          rule_id: 'rule-1',
          stream_name: 'logs.test',
        },
      ]
    );

    const res = await searchKnowledgeIndicators({
      params: { kind: ['query'] },
      getStreamNames: async () => ['logs.test'],
      getFeatures,
      getQueries,
    });

    expect(getFeatures).not.toHaveBeenCalled();
    expect(getQueries).toHaveBeenCalled();
    expect(res.knowledge_indicators.every((ki) => ki.kind === 'query')).toBe(true);
  });

  it('supports kind=[feature] (features-only)', async () => {
    const getFeatures = jest.fn(async () => [makeFeature({ id: 'f1' })]);
    const getQueries = jest.fn();

    const res = await searchKnowledgeIndicators({
      params: { kind: ['feature'] },
      getStreamNames: async () => ['logs.test'],
      getFeatures,
      getQueries,
    });

    expect(getQueries).not.toHaveBeenCalled();
    expect(res.knowledge_indicators).toHaveLength(1);
    expect(res.knowledge_indicators[0].kind).toBe('feature');
  });

  it('filters requested stream_names against accessible streams', async () => {
    const getFeatures = jest.fn(async () => []);
    const getQueries = jest.fn(async () => []);

    await searchKnowledgeIndicators({
      params: { stream_names: ['logs.allowed', 'logs.denied'] },
      getStreamNames: async () => ['logs.allowed'],
      getFeatures,
      getQueries,
    });

    expect(getFeatures).toHaveBeenCalledTimes(1);
    expect(getFeatures).toHaveBeenCalledWith('logs.allowed', expect.any(Object));
    expect(getQueries).toHaveBeenCalledWith(['logs.allowed'], undefined);
  });

  it('returns empty when requested stream_names are not accessible', async () => {
    const getFeatures = jest.fn(async () => []);
    const getQueries = jest.fn(async () => []);

    const res = await searchKnowledgeIndicators({
      params: { stream_names: ['logs.missing'] },
      getStreamNames: async () => ['logs.allowed'],
      getFeatures,
      getQueries,
    });

    expect(res.knowledge_indicators).toHaveLength(0);
    expect(getFeatures).not.toHaveBeenCalled();
    expect(getQueries).not.toHaveBeenCalled();
  });

  it('applies limit to the merged output', async () => {
    const res = await searchKnowledgeIndicators({
      params: { limit: 2 },
      getStreamNames: async () => ['logs.test'],
      getFeatures: async () => [
        makeFeature({ id: 'f1', confidence: 10 }),
        makeFeature({ id: 'f2', confidence: 20 }),
      ],
      getQueries: async (): Promise<QueryLink[]> =>
        [
          {
            query: makeStreamQuery({ id: 'q1' }),
            rule_backed: true,
            rule_id: 'rule-1',
            stream_name: 'logs.test',
          },
          {
            query: makeStreamQuery({ id: 'q2' }),
            rule_backed: true,
            rule_id: 'rule-2',
            stream_name: 'logs.test',
          },
        ] as QueryLink[],
    });

    expect(res.knowledge_indicators).toHaveLength(2);
  });

  it('calls onFeatureFetchError when a stream feature fetch fails', async () => {
    const onFeatureFetchError = jest.fn();

    const res = await searchKnowledgeIndicators({
      params: { kind: ['feature'] },
      onFeatureFetchError,
      getStreamNames: async () => ['logs.bad', 'logs.good'],
      getFeatures: async (streamName) => {
        if (streamName === 'logs.bad') {
          throw new Error('boom');
        }
        return [makeFeature({ id: 'ok' })];
      },
      getQueries: async () => [],
    });

    expect(onFeatureFetchError).toHaveBeenCalledTimes(1);
    expect(res.knowledge_indicators).toHaveLength(1);
    expect(res.knowledge_indicators[0].kind).toBe('feature');
  });
});
