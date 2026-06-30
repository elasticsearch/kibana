/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { vendorApiAdapter } from './vendor_api_adapter';
import type { AdapterRunContext, SourceHit } from '../types';

const NOW = new Date('2026-05-16T12:00:00.000Z');

const buildContext = (
  fetchImpl: jest.Mock<Promise<Response>, [string | URL | Request, RequestInit?]>
): AdapterRunContext => ({
  esClient: elasticsearchServiceMock.createElasticsearchClient(),
  logger: loggingSystemMock.createLogger(),
  abortSignal: new AbortController().signal,
  now: () => NOW,
  fetchFn: fetchImpl as unknown as typeof fetch,
});

describe('vendorApiAdapter', () => {
  it('returns [] for an unknown vendor (no registered handler)', async () => {
    const fetchMock = jest.fn();
    const source: SourceHit = {
      _id: 'vendor_api:never-heard-of-it',
      _source: {
        adapter_type: 'vendor_api',
        name: 'Mystery',
        config: { url: 'https://mystery.example/api' },
      },
    };
    expect(await vendorApiAdapter.run(source, buildContext(fetchMock))).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delegates to the RSS adapter for elastic-security-labs and rewrites source.type to vendor_api', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>ESL</title>
        <item><title>One</title><guid>esl:1</guid><link>https://esl.example/1</link></item>
        </channel></rss>`,
        { status: 200, headers: { 'Content-Type': 'application/rss+xml' } }
      )
    );
    const source: SourceHit = {
      _id: 'vendor_api:elastic-security-labs',
      _source: {
        adapter_type: 'vendor_api',
        name: 'Elastic Security Labs',
        config: { url: 'https://www.elastic.co/security-labs/rss/feed.xml' },
      },
    };
    const reports = await vendorApiAdapter.run(source, buildContext(fetchMock));
    expect(reports).toHaveLength(1);
    // The most important contract: even though parsing was done via
    // the RSS adapter, the resulting documents must declare
    // `source.type: 'vendor_api'` so dashboard / search filters keyed
    // on type stay accurate.
    expect(reports[0].source.type).toBe('vendor_api');
    expect(reports[0].source.adapter_id).toBe('vendor_api:vendor_api:elastic-security-labs');
  });

  it('honors a config.vendor override when set', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>ESL</title>
        <item><title>X</title><guid>esl:x</guid></item></channel></rss>`,
        { status: 200 }
      )
    );
    const source: SourceHit = {
      _id: 'vendor_api:custom-mirror',
      _source: {
        adapter_type: 'vendor_api',
        name: 'Custom Mirror of ESL',
        config: {
          url: 'https://mirror.example/feed.xml',
          vendor: 'vendor_api:elastic-security-labs',
        },
      },
    };
    const reports = await vendorApiAdapter.run(source, buildContext(fetchMock));
    expect(reports).toHaveLength(1);
    expect(reports[0].source.url).toBe('https://mirror.example/feed.xml');
  });
});
