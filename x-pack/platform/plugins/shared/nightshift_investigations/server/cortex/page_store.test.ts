/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { canonicalizeSlug, createCortexPageStore, toCortexKiId } from './page_store';

const source = {
  '@timestamp': '2026-09-09T12:00:00.000Z',
  type: 'service',
  title: 'Checkout',
  description: 'Payments checkout',
  content: 'Checkout talks to Redis.',
  tags: ['cortex', 'service'],
  attributes: {
    status: 'established',
    corroborations: 3,
    slug: 'checkout',
  },
};

describe('canonicalizeSlug', () => {
  it('strips cortex and entity-type prefixes copied from document ids', () => {
    expect(canonicalizeSlug('service', 'email-service')).toBe('email-service');
    expect(canonicalizeSlug('service', 'cortex-service-email-service')).toBe('email-service');
    expect(canonicalizeSlug('service', 'cortex_service_email-service')).toBe('email-service');
    expect(canonicalizeSlug('runbook', 'cortex-runbook-checkout-high-p99-latency')).toBe(
      'checkout-high-p99-latency'
    );
    expect(canonicalizeSlug('service', 'service-mesh')).toBe('service-mesh');
  });
});

describe('toCortexKiId', () => {
  it('normalizes the slug into a stable document id', () => {
    expect(toCortexKiId('service', 'Checkout Service')).toBe('cortex_service_checkout-service');
    expect(toCortexKiId('service', 'cortex-service-email-service')).toBe(
      'cortex_service_email-service'
    );
  });
});

describe('createCortexPageStore', () => {
  const logger = loggerMock.create();

  it('lists cortex pages and computes stats from the unfiltered set', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            { _id: 'cortex_service_checkout', _source: source },
            {
              _id: 'cortex_alert_latency',
              _source: {
                ...source,
                type: 'alert',
                title: 'Latency',
                attributes: { status: 'tentative', corroborations: 1, slug: 'latency' },
              },
            },
          ],
        },
      }),
    };

    const store = createCortexPageStore({
      esClient: esClient as never,
      logger,
    });

    const result = await store.list({ entityType: 'service' });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe('Checkout');
    expect(result.stats).toEqual({
      total: 2,
      established: 1,
      total_corroborations: 4,
      last_updated: '2026-09-09T12:00:00.000Z',
    });
  });

  it('collapses slug-prefix duplicates onto the canonical page', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'cortex_service_cortex-service-email-service',
              _source: {
                ...source,
                title: 'Email Service',
                attributes: {
                  status: 'tentative',
                  corroborations: 0,
                  slug: 'cortex-service-email-service',
                },
              },
            },
            {
              _id: 'cortex_service_email-service',
              _source: {
                ...source,
                title: 'Email Service',
                attributes: { status: 'established', corroborations: 1, slug: 'email-service' },
              },
            },
          ],
        },
      }),
    };

    const store = createCortexPageStore({
      esClient: esClient as never,
      logger,
    });

    const result = await store.list();

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].id).toBe('cortex_service_email-service');
    expect(result.stats.total).toBe(1);
  });

  it('upserts a page with a stable id and returns the normalized document', async () => {
    const esClient = {
      get: jest.fn().mockRejectedValue({ statusCode: 404 }),
      index: jest.fn().mockResolvedValue({ _id: 'cortex_service_checkout' }),
    };

    const store = createCortexPageStore({
      esClient: esClient as never,
      logger,
    });

    const page = await store.upsert({
      entityType: 'service',
      slug: 'checkout',
      title: 'Checkout',
      content: 'Checkout talks to Redis.',
      status: 'tentative',
    });

    expect(esClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cortex_service_checkout',
        document: expect.objectContaining({
          type: 'service',
          title: 'Checkout',
          tags: ['cortex', 'service'],
        }),
      })
    );
    expect(page.id).toBe('cortex_service_checkout');
    expect(page.corroborations).toBe(0);
  });

  it('increments corroborations on an existing page', async () => {
    const esClient = {
      get: jest.fn().mockResolvedValue({
        found: true,
        _id: 'cortex_service_checkout',
        _source: source,
      }),
      index: jest.fn().mockResolvedValue({ _id: 'cortex_service_checkout' }),
    };

    const store = createCortexPageStore({
      esClient: esClient as never,
      logger,
    });

    const page = await store.corroborate('cortex_service_checkout');

    expect(page?.corroborations).toBe(4);
    expect(esClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          attributes: expect.objectContaining({ corroborations: 4 }),
        }),
      })
    );
  });

  it('prunes prefixed duplicate ids onto the canonical document', async () => {
    const prefixed = {
      ...source,
      title: 'Email Service',
      '@timestamp': '2026-09-09T13:00:00.000Z',
      attributes: {
        status: 'tentative',
        corroborations: 2,
        slug: 'cortex-service-email-service',
      },
    };
    const canonical = {
      ...source,
      title: 'Email Service',
      attributes: { status: 'established', corroborations: 1, slug: 'email-service' },
    };
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            { _id: 'cortex_service_cortex-service-email-service', _source: prefixed },
            { _id: 'cortex_service_email-service', _source: canonical },
          ],
        },
      }),
      get: jest.fn().mockImplementation(async ({ id }: { id: string }) => {
        if (id === 'cortex_service_cortex-service-email-service') {
          return { found: true, _id: id, _source: prefixed };
        }
        if (id === 'cortex_service_email-service') {
          return { found: true, _id: id, _source: canonical };
        }
        return { found: false };
      }),
      index: jest.fn().mockResolvedValue({ _id: 'cortex_service_email-service' }),
      delete: jest.fn().mockResolvedValue({}),
    };

    const store = createCortexPageStore({
      esClient: esClient as never,
      logger,
    });

    await expect(store.pruneDuplicates()).resolves.toBe(1);
    expect(esClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cortex_service_email-service',
        document: expect.objectContaining({
          attributes: expect.objectContaining({ corroborations: 2, slug: 'email-service' }),
        }),
      })
    );
    expect(esClient.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cortex_service_cortex-service-email-service' })
    );
  });
});
