/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fetch, { FetchError } from 'node-fetch';
import { loggerMock } from '@kbn/logging-mocks';

import { LibraryFetchError, LibraryNotFoundError } from './errors';
import { LibraryFetcher } from './library_fetcher';

jest.mock('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

const BASE_URL = 'https://workflows.test/v1';
const KIBANA_VERSION = '9.5.0';
const TTL_MS = 60_000;

const buildFetcher = (overrides?: { isServerless?: boolean; kibanaVersion?: string }) =>
  new LibraryFetcher({
    registryUrl: BASE_URL,
    kibanaVersion: overrides?.kibanaVersion ?? KIBANA_VERSION,
    isServerless: overrides?.isServerless ?? false,
    ttlMs: TTL_MS,
    logger: loggerMock.create(),
    retryOptions: { retries: 3, minTimeout: 1, factor: 1 },
  });

const jsonResponse = (body: unknown, init: { status?: number; etag?: string } = {}) =>
  ({
    status: init.status ?? 200,
    ok: (init.status ?? 200) < 400,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'etag' ? init.etag ?? null : null),
    },
    text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Awaited<ReturnType<typeof fetch>>);

const notModifiedResponse = () =>
  ({
    status: 304,
    ok: false,
    headers: { get: () => null },
    text: jest.fn().mockResolvedValue(''),
  } as unknown as Awaited<ReturnType<typeof fetch>>);

const sampleManifest = {
  versions: [
    { id: '9.5', kibana: '9.5.0', active: true },
    { id: '9.4', kibana: '9.4.0', active: true },
  ],
  latest: 'main',
};

const sampleCatalog = (overrides: Partial<{ slug: string; version: string }> = {}) => ({
  version: 'v1',
  kibanaVersion: '9.5.0',
  generatedAt: '2026-06-01T00:00:00Z',
  templates: [
    {
      slug: overrides.slug ?? 'demo',
      version: overrides.version ?? '1.0.0',
      availability: '>=9.5.0',
      name: 'Demo',
      description: 'Demo template',
      categories: ['utility'],
      definitionUrl: `templates/${overrides.slug ?? 'demo'}/${overrides.version ?? '1.0.0'}.yaml`,
      contentHash: `sha256:${'0'.repeat(64)}`,
      stepTypes: [],
      triggerTypes: [],
    },
  ],
});

const sampleBodyYaml = `
template-metadata:
  slug: demo
  version: "1.0.0"
  availability: ">=9.5.0"
  name: "Demo"
  description: "Demo template"
  categories: [utility]

consts:
  k: v
inputs:
  - name: ip
    type: string
steps:
  - name: noop
    type: noop
`;

/** Queues a manifest then a catalog response on the mocked fetch. */
const queueRefresh = (manifest: unknown, catalog: unknown, init?: { etag?: string }) => {
  mockedFetch
    .mockResolvedValueOnce(jsonResponse(manifest, init))
    .mockResolvedValueOnce(jsonResponse(catalog, init));
};

let now = Date.UTC(2026, 5, 1, 12, 0, 0);

const advanceClock = (ms: number) => {
  now += ms;
  jest.setSystemTime(new Date(now));
};

beforeEach(() => {
  mockedFetch.mockReset();
  now = Date.UTC(2026, 5, 1, 12, 0, 0);
  // Fake only `Date` so we can drive TTL expiry; leave the timer primitives
  // real so p-retry's exponential backoff can complete in retry tests.
  jest.useFakeTimers({
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate'],
  });
  jest.setSystemTime(new Date(now));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LibraryFetcher.listTemplates', () => {
  it('fetches manifest + catalog on the first read and returns the rows', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher();

    const result = await fetcher.listTemplates();

    expect(result.map((t) => t.slug)).toEqual(['demo']);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/kibana-versions.json`,
      expect.any(Object)
    );
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/9.5/catalogs/templates.json`,
      expect.any(Object)
    );
  });

  it('serves repeated reads from cache while fresh', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher();

    await fetcher.listTemplates();
    advanceClock(TTL_MS - 1);
    await fetcher.listTemplates();
    await fetcher.listTemplates();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('re-fetches the catalog after the TTL elapses', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher();

    await fetcher.listTemplates();
    advanceClock(TTL_MS + 1);
    await fetcher.listTemplates();

    expect(mockedFetch).toHaveBeenCalledTimes(4);
  });

  it('targets `/main/` for serverless deployments regardless of kibanaVersion', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher({ isServerless: true });

    await fetcher.listTemplates();

    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/main/catalogs/templates.json`,
      expect.any(Object)
    );
  });

  it('falls back to `manifest.latest` when no manifest entry matches the runtime version', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher({ kibanaVersion: '10.0.0' });

    await fetcher.listTemplates();

    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/main/catalogs/templates.json`,
      expect.any(Object)
    );
  });

  it("resolves to the runtime's exact minor regardless of manifest order", async () => {
    // Ascending order: a caret range (`^9.4.0`) would have matched 9.4 first for
    // a 9.5.x runtime; the tilde range must still pick 9.5.
    const ascending = {
      versions: [
        { id: '9.4', kibana: '9.4.0', active: true },
        { id: '9.5', kibana: '9.5.0', active: true },
      ],
      latest: 'main',
    };
    queueRefresh(ascending, sampleCatalog());
    const fetcher = buildFetcher({ kibanaVersion: '9.5.2' });

    await fetcher.listTemplates();

    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/9.5/catalogs/templates.json`,
      expect.any(Object)
    );
  });

  it('falls back to `manifest.latest` when the runtime is newer than every named minor', async () => {
    const manifest = {
      versions: [
        { id: '9.6', kibana: '9.6.0', active: true },
        { id: '9.5', kibana: '9.5.0', active: true },
      ],
      latest: 'main',
    };
    queueRefresh(manifest, sampleCatalog());
    const fetcher = buildFetcher({ kibanaVersion: '9.8.0' });

    await fetcher.listTemplates();

    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/main/catalogs/templates.json`,
      expect.any(Object)
    );
  });

  it('reuses the cached versionId when the manifest is 304', async () => {
    queueRefresh(sampleManifest, sampleCatalog(), { etag: 'W/"m1"' });
    mockedFetch
      .mockResolvedValueOnce(notModifiedResponse())
      .mockResolvedValueOnce(jsonResponse(sampleCatalog()));
    const fetcher = buildFetcher();

    await fetcher.listTemplates();
    advanceClock(TTL_MS + 1);
    const result = await fetcher.listTemplates();

    expect(result).toHaveLength(1);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      4,
      `${BASE_URL}/9.5/catalogs/templates.json`,
      expect.any(Object)
    );
  });

  it('sends `If-None-Match` on subsequent catalog refreshes', async () => {
    queueRefresh(sampleManifest, sampleCatalog(), { etag: 'W/"v1"' });
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher();

    await fetcher.listTemplates();
    advanceClock(TTL_MS + 1);
    await fetcher.listTemplates();

    expect(mockedFetch).toHaveBeenNthCalledWith(
      4,
      `${BASE_URL}/9.5/catalogs/templates.json`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': 'W/"v1"' }),
      })
    );
  });

  it('coalesces concurrent reads into a single refresh', async () => {
    let resolveManifest: (value: unknown) => void;
    mockedFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveManifest = (val) => resolve(jsonResponse(val) as never);
      }) as never
    );
    mockedFetch.mockResolvedValueOnce(jsonResponse(sampleCatalog()));
    const fetcher = buildFetcher();

    const a = fetcher.listTemplates();
    const b = fetcher.listTemplates();
    resolveManifest!(sampleManifest);
    await Promise.all([a, b]);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('propagates the upstream error when the first refresh fails (cold start)', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse('nope', { status: 404 }));
    const fetcher = buildFetcher();

    await expect(fetcher.listTemplates()).rejects.toMatchObject({
      name: 'LibraryFetchError',
      reason: 'http-error',
      statusCode: 404,
    });
    expect(fetcher.getHealth().lastError).toBeDefined();
  });

  it('serves the stale catalog when a later refresh fails (SWR)', async () => {
    // First refresh: 2 specific 200 responses (manifest, catalog).
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(sampleManifest))
      .mockResolvedValueOnce(jsonResponse(sampleCatalog()));
    // Every subsequent call returns 503 (covers p-retry's 1 + 3 retries).
    mockedFetch.mockResolvedValue(jsonResponse('nope', { status: 503 }));
    const fetcher = buildFetcher();

    await fetcher.listTemplates();
    advanceClock(TTL_MS + 1);
    const result = await fetcher.listTemplates();

    expect(result).toHaveLength(1);
    expect(fetcher.getHealth().lastError?.message).toMatch(/503|Upstream/i);
  });

  it('retries 5xx responses and eventually succeeds', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse('boom', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse('boom', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(sampleManifest))
      .mockResolvedValueOnce(jsonResponse(sampleCatalog()));
    const fetcher = buildFetcher();

    const result = await fetcher.listTemplates();

    expect(result).toHaveLength(1);
    expect(mockedFetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry 4xx responses', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse('nope', { status: 404 }));
    const fetcher = buildFetcher();

    await expect(fetcher.listTemplates()).rejects.toMatchObject({
      reason: 'http-error',
      statusCode: 404,
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('throws `malformed` when the catalog response is not valid JSON', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(sampleManifest))
      .mockResolvedValueOnce(jsonResponse('not json{'));
    const fetcher = buildFetcher();

    await expect(fetcher.listTemplates()).rejects.toMatchObject({ reason: 'malformed' });
  });

  it('throws `malformed` when the catalog fails schema validation', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(sampleManifest))
      .mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }));
    const fetcher = buildFetcher();

    await expect(fetcher.listTemplates()).rejects.toBeInstanceOf(LibraryFetchError);
  });

  it('tolerates unknown fields in the fetched manifest and catalog (forward-compat)', async () => {
    // Simulate a catalog published by a newer Kibana that adds fields this
    // (older) runtime does not know about — at the top level and per row.
    const futureManifest = {
      ...sampleManifest,
      futureChannelMeta: { beta: true },
      versions: sampleManifest.versions.map((v) => ({ ...v, note: 'from a newer publisher' })),
    };
    const base = sampleCatalog();
    const futureCatalog = {
      ...base,
      futureTopLevelField: 'ignored-by-older-kibana',
      templates: base.templates.map((t) => ({ ...t, snippetRoles: ['send-notification'] })),
    };
    queueRefresh(futureManifest, futureCatalog);
    const fetcher = buildFetcher();

    const result = await fetcher.listTemplates();

    expect(result.map((t) => t.slug)).toEqual(['demo']);
  });

  it('translates a node-fetch system error into reason `connection`', async () => {
    const sysErr = Object.assign(new FetchError('boom', 'system'), { type: 'system' });
    mockedFetch.mockRejectedValue(sysErr);
    const fetcher = buildFetcher();

    await expect(fetcher.listTemplates()).rejects.toMatchObject({ reason: 'connection' });
  });
});

describe('LibraryFetcher.getTemplate', () => {
  it('refreshes the catalog, fetches the body, and caches it for subsequent hits', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    mockedFetch.mockResolvedValueOnce(jsonResponse(sampleBodyYaml));
    const fetcher = buildFetcher();

    const first = await fetcher.getTemplate('demo');
    const second = await fetcher.getTemplate('demo');

    expect(first).toBe(second);
    expect(first.metadata.slug).toBe('demo');
    expect(first.body.consts).toEqual({ k: 'v' });
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      3,
      `${BASE_URL}/templates/demo/1.0.0.yaml`,
      expect.any(Object)
    );
  });

  it('tolerates an unknown `template-metadata` field in the fetched body (forward-compat)', async () => {
    // A body published by a newer Kibana that adds a `template-metadata` field
    // this (older) runtime does not know about must still parse, so a template
    // the catalog lists does not 503 when opened.
    const futureBodyYaml = sampleBodyYaml.replace(
      '  categories: [utility]',
      '  categories: [utility]\n  someFutureField: hello'
    );
    queueRefresh(sampleManifest, sampleCatalog());
    mockedFetch.mockResolvedValueOnce(jsonResponse(futureBodyYaml));
    const fetcher = buildFetcher();

    const result = await fetcher.getTemplate('demo');

    expect(result.metadata.slug).toBe('demo');
    expect(result.metadata).not.toHaveProperty('someFutureField');
  });

  it('throws `LibraryNotFoundError` when the slug is absent from the catalog', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher();

    await expect(fetcher.getTemplate('missing')).rejects.toBeInstanceOf(LibraryNotFoundError);
  });

  it('wraps a parse failure as `malformed`', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    mockedFetch.mockResolvedValueOnce(jsonResponse('not: [valid yaml at all'));
    const fetcher = buildFetcher();

    await expect(fetcher.getTemplate('demo')).rejects.toMatchObject({
      name: 'LibraryFetchError',
      reason: 'malformed',
    });
  });

  it('drops the body cache when the catalog is refreshed to a new version', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    mockedFetch.mockResolvedValueOnce(jsonResponse(sampleBodyYaml));
    queueRefresh(sampleManifest, sampleCatalog({ slug: 'demo', version: '1.1.0' }));
    mockedFetch.mockResolvedValueOnce(jsonResponse(sampleBodyYaml));
    const fetcher = buildFetcher();

    await fetcher.getTemplate('demo');
    advanceClock(TTL_MS + 1);
    await fetcher.getTemplate('demo');

    // 2 refreshes (manifest+catalog each) + 2 body fetches.
    expect(mockedFetch).toHaveBeenCalledTimes(6);
  });
});

describe('LibraryFetcher.getHealth', () => {
  it('starts with no timestamps and no error', () => {
    const fetcher = buildFetcher();
    expect(fetcher.getHealth()).toEqual({ sourceMode: 'http' });
  });

  it('records a successful refresh', async () => {
    queueRefresh(sampleManifest, sampleCatalog());
    const fetcher = buildFetcher();

    await fetcher.listTemplates();

    expect(fetcher.getHealth()).toEqual({
      sourceMode: 'http',
      lastRefreshAt: expect.any(String),
    });
  });
});
