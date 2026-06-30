/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { stixAdapter } from './stix_adapter';
import type { AdapterRunContext, SourceHit } from '../types';

const URL = 'https://stix.example/bundle.json';
const NOW = new Date('2026-05-16T12:00:00.000Z');

const buildSource = (): SourceHit => ({
  _id: 'stix:vendor',
  _source: {
    adapter_type: 'stix',
    name: 'Vendor STIX',
    config: { url: URL },
  },
});

const buildContext = (
  fetchImpl: jest.Mock<Promise<Response>, [string | URL | Request, RequestInit?]>
): AdapterRunContext => ({
  esClient: elasticsearchServiceMock.createElasticsearchClient(),
  logger: loggingSystemMock.createLogger(),
  abortSignal: new AbortController().signal,
  now: () => NOW,
  fetchFn: fetchImpl as unknown as typeof fetch,
});

const okJson = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/stix+json' },
  });

describe('stixAdapter', () => {
  it('emits one normalized report per reportable SDO', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okJson({
        type: 'bundle',
        id: 'bundle--1',
        objects: [
          {
            type: 'indicator',
            id: 'indicator--1',
            name: 'IOC: bad domain',
            description: 'Detects connections to bad.example.',
            modified: '2026-05-15T00:00:00Z',
            pattern: "[domain-name:value = 'bad.example']",
            pattern_type: 'stix',
          },
          { type: 'marking-definition', id: 'marking-definition--1' },
          {
            type: 'threat-actor',
            id: 'threat-actor--1',
            name: 'APT-Test',
            description: 'A test actor.',
            created: '2026-05-10T00:00:00Z',
          },
        ],
      })
    );
    const reports = await stixAdapter.run(buildSource(), buildContext(fetchMock));
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({
      source: { type: 'stix', adapter_id: 'stix:stix:vendor', url: URL },
      content: { title: 'IOC: bad domain' },
      provenance: {
        extraction_method: 'pending',
        source_doc_ref: { index: 'stix:bundle', id: 'indicator--1' },
      },
    });
    expect(reports[0].content.body_text).toContain(
      "Pattern (stix): [domain-name:value = 'bad.example']"
    );
    expect(reports[1].source.adapter_id).toBe('stix:stix:vendor');
    expect(reports[1].content.title).toBe('APT-Test');
  });

  it('throws on non-2xx', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('nope', { status: 401, statusText: 'Unauthorized' }));
    await expect(stixAdapter.run(buildSource(), buildContext(fetchMock))).rejects.toThrow(
      /HTTP 401/
    );
  });

  it('throws on a non-JSON response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response('<not json>', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      );
    await expect(stixAdapter.run(buildSource(), buildContext(fetchMock))).rejects.toThrow(
      /not valid JSON/
    );
  });

  it('returns [] when the bundle has no reportable SDOs', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okJson({
        type: 'bundle',
        id: 'bundle--empty',
        objects: [{ type: 'marking-definition', id: 'marking-definition--1' }],
      })
    );
    const reports = await stixAdapter.run(buildSource(), buildContext(fetchMock));
    expect(reports).toEqual([]);
  });
});
