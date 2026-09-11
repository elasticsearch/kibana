/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fetchScoreDocs } from './fetch_score_docs';

describe('fetchScoreDocs', () => {
  const esUrl = 'https://es.example.com';
  const apiKey = 'key';
  const okResponse = (hits: unknown[]) => ({
    ok: true,
    json: async () => ({ hits: { hits } }),
  });

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse([]));
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  const body = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

  it('refuses an unscoped read rather than scanning every archived run', async () => {
    // 25 config model ids match 136 executions on the golden cluster: an
    // unscoped query is ~56 minutes of transfer and never what the caller meant.
    await expect(
      fetchScoreDocs({ esUrl, apiKey, exampleIds: ['a'], suiteIds: ['s'] })
    ).rejects.toThrow(/requires --execution-id or --models/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts an execution scope', async () => {
    await fetchScoreDocs({ esUrl, apiKey, exampleIds: ['a'], executionIds: ['e1'] });

    expect(body(0).query.bool.filter).toContainEqual({
      terms: { 'metadata.execution_id': ['e1'] },
    });
  });

  it('filters on example.id by default', async () => {
    await fetchScoreDocs({ esUrl, apiKey, exampleIds: ['a'], executionIds: ['e1'] });

    expect(body(0).query.bool.filter).toContainEqual({ term: { 'example.id': 'a' } });
  });

  // attack-discovery stores example.id = '0' on every document, so filtering
  // that field there returns one scenario and silently drops the other eight.
  it('filters on the caller-supplied join field instead of example.id', async () => {
    await fetchScoreDocs({
      esUrl,
      apiKey,
      exampleIds: ['wmi-lateral'],
      joinField: 'example.metadata.scenarioKey',
      executionIds: ['e1'],
    });

    const filters = body(0).query.bool.filter;
    expect(filters).toContainEqual({ term: { 'example.metadata.scenarioKey': 'wmi-lateral' } });
    expect(filters).not.toContainEqual({ term: { 'example.id': 'wmi-lateral' } });
  });

  it('falls back to the config model list when no explicit models are given', async () => {
    await fetchScoreDocs({ esUrl, apiKey, exampleIds: ['a'], configModelIds: ['m1'] });

    expect(body(0).query.bool.filter).toContainEqual({ terms: { 'task.model.id': ['m1'] } });
  });

  it('prefers explicit models over the config list', async () => {
    await fetchScoreDocs({
      esUrl,
      apiKey,
      exampleIds: ['a'],
      modelIds: ['chosen'],
      configModelIds: ['ignored'],
    });

    expect(body(0).query.bool.filter).toContainEqual({ terms: { 'task.model.id': ['chosen'] } });
  });

  it('collapses to one execution group and pulls its members', async () => {
    // A trajectory is stored once per evaluator (~15 docs); collapsing is what
    // turns a 42k-document read into a ~2.8k-trajectory read. The members let
    // the caller prefer a payload-bearing document over an empty sibling.
    await fetchScoreDocs({ esUrl, apiKey, exampleIds: ['a'], executionIds: ['e1'] });

    expect(body(0).collapse).toEqual({
      field: 'metadata.execution_id',
      inner_hits: { name: 'members', size: 50, _source: expect.any(Array) },
    });
  });

  it('resolves the newest execution per model instead of trusting collapse order', async () => {
    // A suite re-runs an example across many executions; the newest is the one
    // whose trajectories were captured. The first call per example is the
    // resolution aggregation, the second the document fetch.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          aggregations: {
            by_model: {
              buckets: [
                {
                  key: 'm1',
                  latest: {
                    hits: { hits: [{ _source: { metadata: { execution_id: 'new-exec' } } }] },
                  },
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce(okResponse([{ _source: { example: { id: 'a' } } }]));

    await fetchScoreDocs({ esUrl, apiKey, exampleIds: ['a'], modelIds: ['m1'] });

    // Resolution query: newest document per model bucket.
    expect(body(0).aggs.by_model.aggs.latest.top_hits.sort).toEqual([
      { '@timestamp': { order: 'desc' } },
    ]);
    // Document fetch: scoped to the resolved execution.
    expect(body(1).query.bool.filter).toContainEqual({
      terms: { 'metadata.execution_id': ['new-exec'] },
    });
  });

  it('prefers a payload-bearing group member over an empty representative', async () => {
    const empty = { _source: { task: { output: {} } } };
    const withInsights = {
      _source: { task: { output: { insights: [{ title: 'x' }] } }, example: { id: 'a' } },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hits: {
          hits: [
            {
              _source: empty._source,
              inner_hits: { members: { hits: { hits: [empty, withInsights] } } },
            },
          ],
        },
      }),
    });

    const docs = await fetchScoreDocs({
      esUrl,
      apiKey,
      exampleIds: ['a'],
      executionIds: ['e1'],
    });

    expect(docs).toHaveLength(1);
    expect((docs[0] as any).task.output.insights).toHaveLength(1);
  });

  it('queries once per example and returns every hit', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse([{ _source: { example: { id: 'a' } } }]))
      .mockResolvedValueOnce(okResponse([{ _source: { example: { id: 'b' } } }]));

    const docs = await fetchScoreDocs({
      esUrl,
      apiKey,
      exampleIds: ['a', 'b'],
      executionIds: ['e1'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(docs).toHaveLength(2);
  });

  it('applies the as-of cutoff so replays match the published selection', async () => {
    await fetchScoreDocs({
      esUrl,
      apiKey,
      exampleIds: ['a'],
      executionIds: ['e1'],
      asOf: Date.parse('2026-09-01T00:00:00.000Z'),
    });

    expect(body(0).query.bool.filter).toContainEqual({
      range: { '@timestamp': { lt: '2026-09-01T00:00:00.000Z' } },
    });
  });

  it('surfaces a failed query instead of returning an empty result', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });

    await expect(
      fetchScoreDocs({ esUrl, apiKey, exampleIds: ['a'], executionIds: ['e1'] })
    ).rejects.toThrow(/403 forbidden/);
  });
});
