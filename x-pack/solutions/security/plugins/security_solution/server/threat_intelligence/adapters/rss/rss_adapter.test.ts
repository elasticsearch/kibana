/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { rssAdapter } from './rss_adapter';
import type { AdapterRunContext, SourceHit } from '../types';

const FEED_URL = 'https://acme.example/feed.xml';
const FEED_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Acme</title>
  <item>
    <title>Item one</title>
    <guid>acme:1</guid>
    <link>https://acme.example/1</link>
    <pubDate>Mon, 12 May 2025 09:30:00 GMT</pubDate>
    <description><![CDATA[<p>Body one</p>]]></description>
  </item>
  <item>
    <title>Item two</title>
    <guid>acme:2</guid>
    <link>https://acme.example/2</link>
    <pubDate>Tue, 13 May 2025 09:30:00 GMT</pubDate>
    <description>Body two</description>
  </item>
</channel></rss>`;

const buildSource = (overrides: Partial<SourceHit['_source']> = {}): SourceHit => ({
  _id: 'rss:acme',
  _source: {
    adapter_type: 'rss',
    name: 'Acme',
    config: { url: FEED_URL },
    ...overrides,
  },
});

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

const okResponse = (body: string): Response =>
  new Response(body, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/rss+xml' },
  });

describe('rssAdapter', () => {
  it('emits one normalized report per RSS item', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(FEED_BODY));
    const reports = await rssAdapter.run(buildSource(), buildContext(fetchMock));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(FEED_URL);

    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({
      '@timestamp': NOW.toISOString(),
      space_id: '*',
      source: {
        type: 'rss',
        name: 'Acme',
        url: 'https://acme.example/1',
        adapter_id: 'rss:rss:acme',
      },
      content: {
        title: 'Item one',
        body_text: 'Body one',
        body_html: '<p>Body one</p>',
        language: 'en',
      },
      severity: { level: 'medium', score: 40 },
      provenance: {
        ingested_at: NOW.toISOString(),
        extraction_method: 'pending',
        source_doc_ref: { index: 'rss:feed', id: 'acme:1' },
      },
    });
    // Fingerprint must be a stable 64-hex digest (matches buildFingerprint).
    expect(reports[0].content_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(reports[0].content_fingerprint).not.toBe(reports[1].content_fingerprint);
  });

  it('stamps space_id from the source when set', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(FEED_BODY));
    const reports = await rssAdapter.run(
      buildSource({ space_id: 'team-a' }),
      buildContext(fetchMock)
    );
    expect(reports[0].space_id).toBe('team-a');
  });

  it('returns [] when the source has no config.url', async () => {
    const fetchMock = jest.fn();
    const reports = await rssAdapter.run(
      buildSource({ config: {} as Record<string, unknown> }),
      buildContext(fetchMock)
    );
    expect(reports).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx response so the workflow surfaces the failure', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('boom', { status: 503, statusText: 'Service Unavailable' }));
    await expect(rssAdapter.run(buildSource(), buildContext(fetchMock))).rejects.toThrow(
      /HTTP 503/
    );
  });

  it('returns [] when the feed contains no parseable items', async () => {
    const empty = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const fetchMock = jest.fn().mockResolvedValue(okResponse(empty));
    const reports = await rssAdapter.run(buildSource(), buildContext(fetchMock));
    expect(reports).toEqual([]);
  });
});
