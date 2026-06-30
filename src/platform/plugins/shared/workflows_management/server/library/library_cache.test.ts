/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TemplateBody, TemplatesCatalog } from '@kbn/workflows-library';

import { LibraryCache } from './library_cache';

const TTL_MS = 60_000;

const catalogA: TemplatesCatalog = {
  version: 'v1',
  kibanaVersion: '9.5.0',
  generatedAt: '2026-06-01T00:00:00Z',
  templates: [
    {
      slug: 'demo',
      version: '1.0.0',
      availability: '>=9.5.0',
      name: 'Demo',
      description: 'A demo template',
      categories: ['utility'],
      definitionUrl: 'templates/demo/1.0.0.yaml',
      contentHash: `sha256:${'0'.repeat(64)}`,
      stepTypes: [],
      triggerTypes: [],
    },
  ],
};

const body: TemplateBody = {
  metadata: {
    slug: 'demo',
    version: '1.0.0',
    availability: '>=9.5.0',
    name: 'Demo',
    description: 'A demo template',
    categories: ['utility'],
  },
  body: {},
  raw: '...',
};

describe('LibraryCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts empty: no catalog, not fresh, no health timestamps', () => {
    const cache = new LibraryCache(TTL_MS);

    expect(cache.catalog).toBeUndefined();
    expect(cache.versionId).toBeUndefined();
    expect(cache.isFresh()).toBe(false);
    expect(cache.getHealth()).toEqual({ sourceMode: 'http' });
  });

  it('treats the catalog as fresh within TTL after a successful refresh', () => {
    const cache = new LibraryCache(TTL_MS);
    cache.setCatalog(catalogA);
    cache.markRefreshSuccess();

    jest.advanceTimersByTime(TTL_MS - 1);
    expect(cache.isFresh()).toBe(true);
  });

  it('treats the catalog as stale once TTL elapses', () => {
    const cache = new LibraryCache(TTL_MS);
    cache.setCatalog(catalogA);
    cache.markRefreshSuccess();

    jest.advanceTimersByTime(TTL_MS + 1);
    expect(cache.isFresh()).toBe(false);
  });

  it('reports not-fresh when a catalog has been set but no refresh recorded', () => {
    const cache = new LibraryCache(TTL_MS);
    cache.setCatalog(catalogA);
    // No markRefreshSuccess — should still be considered stale.
    expect(cache.isFresh()).toBe(false);
  });

  it('drops the body cache when a fresh catalog arrives', () => {
    const cache = new LibraryCache(TTL_MS);
    cache.setCatalog(catalogA);
    cache.setBody('demo', body);
    expect(cache.getBody('demo')).toBe(body);

    cache.setCatalog(catalogA);
    expect(cache.getBody('demo')).toBeUndefined();
  });

  it('records and surfaces refresh failures via getHealth without clearing the catalog', () => {
    const cache = new LibraryCache(TTL_MS);
    cache.setCatalog(catalogA);
    cache.markRefreshSuccess();

    cache.markRefreshFailure(new Error('upstream blew up'));

    expect(cache.catalog).toBe(catalogA);
    expect(cache.getHealth()).toEqual({
      sourceMode: 'http',
      lastRefreshAt: expect.any(String),
      lastError: { message: 'upstream blew up', at: expect.any(String) },
    });
  });

  it('clears the last error on the next successful refresh', () => {
    const cache = new LibraryCache(TTL_MS);
    cache.markRefreshFailure(new Error('boom'));
    expect(cache.getHealth().lastError).toBeDefined();

    cache.markRefreshSuccess();
    expect(cache.getHealth().lastError).toBeUndefined();
  });

  it('emits ISO-8601 strings on getHealth', () => {
    const cache = new LibraryCache(TTL_MS);
    cache.markRefreshSuccess();
    cache.markRefreshFailure(new Error('x'));

    const health = cache.getHealth();
    expect(health.lastRefreshAt).toBe('2026-06-01T12:00:00.000Z');
    expect(health.lastError?.at).toBe('2026-06-01T12:00:00.000Z');
  });
});
