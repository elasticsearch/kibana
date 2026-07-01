/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFile } from 'fs/promises';
import http, { type Server } from 'http';
import path from 'path';

import { loggerMock } from '@kbn/logging-mocks';

import { LibraryFetcher, LibraryFetchError } from '..';

const FIXTURE_ROOT = path.join(__dirname, '__fixtures__', 'dist');
const TTL_MS = 60_000;

interface FixtureServer {
  baseUrl: string;
  close(): Promise<void>;
}

const startFixtureServer = async (): Promise<FixtureServer> => {
  const server: Server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      const filePath = path.join(FIXTURE_ROOT, urlPath);
      // Defence-in-depth: keep reads inside the fixture root.
      if (!filePath.startsWith(FIXTURE_ROOT)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const data = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        filePath.endsWith('.json')
          ? 'application/json'
          : filePath.endsWith('.yaml')
          ? 'application/yaml'
          : 'application/octet-stream'
      );
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Fixture server did not bind to a port.');
  }

  return {
    baseUrl: `http://127.0.0.1:${addr.port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
};

const buildFetcher = (baseUrl: string) =>
  new LibraryFetcher({
    registryUrl: baseUrl,
    kibanaVersion: '9.5.0',
    isServerless: false,
    ttlMs: TTL_MS,
    logger: loggerMock.create(),
    retryOptions: { retries: 0, minTimeout: 1 },
  });

describe('Library integration — LibraryFetcher against a local fixture CDN', () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('lists templates parsed from the fixture catalog', async () => {
    const fetcher = buildFetcher(server.baseUrl);

    const templates = await fetcher.listTemplates();

    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      slug: 'ip-reputation-check',
      version: '1.0.0',
      name: 'IP Reputation Check (AbuseIPDB)',
      solutions: ['security'],
      categories: ['enrichment', 'threat-intel'],
      definitionUrl: 'templates/ip-reputation-check/1.0.0.yaml',
      stepTypes: ['abuseipdb.checkIp'],
      triggerTypes: ['manual'],
    });
  });

  it('fetches and parses the template body on getTemplate', async () => {
    const fetcher = buildFetcher(server.baseUrl);

    const body = await fetcher.getTemplate('ip-reputation-check');

    expect(body.metadata.slug).toBe('ip-reputation-check');
    expect(body.metadata.install?.form?.[0]).toMatchObject({
      name: 'abuseipdb-connector',
      inputType: 'connector',
      connectorType: '.abuseipdb',
    });
    expect(body.body.inputs).toEqual([{ name: 'ip_address', type: 'string', required: true }]);
    expect(body.body.triggers).toEqual([{ type: 'manual' }]);
    expect(body.body.consts).toEqual({ abuseipdb_api_key: '' });
    expect(Array.isArray(body.body.steps)).toBe(true);
    expect(body.raw).toContain('template-metadata:');
  });

  it('records the refresh timestamp in getHealth after the first read', async () => {
    const fetcher = buildFetcher(server.baseUrl);

    expect(fetcher.getHealth()).toEqual({ sourceMode: 'http' });
    await fetcher.listTemplates();

    expect(fetcher.getHealth()).toMatchObject({
      sourceMode: 'http',
      lastRefreshAt: expect.any(String),
    });
  });

  it('propagates a LibraryFetchError when the slug is missing in the catalog', async () => {
    const fetcher = buildFetcher(server.baseUrl);

    await expect(fetcher.getTemplate('not-there')).rejects.toMatchObject({
      name: 'LibraryNotFoundError',
    });
  });

  describe('stale-while-revalidate', () => {
    let originalNow: number;

    beforeEach(() => {
      originalNow = Date.now();
      jest.useFakeTimers({
        // Keep timer primitives real so node-fetch / p-retry behave normally;
        // we only fake `Date` so TTL expiry can be driven from the test.
        doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate'],
      });
      jest.setSystemTime(new Date(originalNow));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('keeps serving the cached catalog when the upstream becomes unreachable', async () => {
      // Spin up a dedicated server so closing it does not affect other tests.
      const localServer = await startFixtureServer();
      const fetcher = buildFetcher(localServer.baseUrl);

      const first = await fetcher.listTemplates();
      expect(first).toHaveLength(1);

      await localServer.close();

      jest.setSystemTime(new Date(originalNow + TTL_MS + 1));

      const second = await fetcher.listTemplates();
      expect(second).toHaveLength(1);
      expect(fetcher.getHealth().lastError).toBeDefined();
      expect(fetcher.getHealth().lastError?.message).toMatch(/Failed to reach|ECONNREFUSED/i);
    });

    it('propagates the upstream error on cold-start failure (no stale catalog to serve)', async () => {
      // Point at a closed port so the very first refresh fails.
      const closed = await startFixtureServer();
      await closed.close();
      const fetcher = buildFetcher(closed.baseUrl);

      await expect(fetcher.listTemplates()).rejects.toBeInstanceOf(LibraryFetchError);
    });
  });
});
