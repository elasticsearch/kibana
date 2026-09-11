/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { applyCortexEdits, optimizeCortex } from './optimize';
import type { CortexPageStore } from './page_store';

describe('applyCortexEdits', () => {
  it('upserts, corroborates, and archives proposed pages', async () => {
    const store: CortexPageStore = {
      list: jest.fn().mockResolvedValue({
        pages: [],
        stats: { total: 0, established: 0, total_corroborations: 0 },
      }),
      get: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue({}),
      corroborate: jest.fn().mockResolvedValue({}),
      archive: jest.fn().mockResolvedValue({}),
      pruneDuplicates: jest.fn().mockResolvedValue(0),
    };

    await applyCortexEdits({
      store,
      logger: loggerMock.create(),
      edits: [
        {
          action: 'upsert',
          entity_type: 'service',
          slug: 'checkout',
          title: 'Checkout',
          content: 'Checkout talks to Redis.',
          status: 'tentative',
        },
        {
          action: 'corroborate',
          entity_type: 'service',
          slug: 'checkout',
          title: 'Checkout',
        },
        {
          action: 'archive',
          entity_type: 'topic',
          slug: 'old-note',
          title: 'Old note',
        },
      ],
    });

    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'service',
        slug: 'checkout',
        title: 'Checkout',
      })
    );
    expect(store.corroborate).toHaveBeenCalledWith('cortex_service_checkout');
    expect(store.archive).toHaveBeenCalledWith('cortex_topic_old-note');
  });

  it('rewrites prefixed slugs onto the existing page', async () => {
    const store: CortexPageStore = {
      list: jest.fn().mockResolvedValue({
        pages: [
          {
            id: 'cortex_service_email-service',
            title: 'Email Service',
            entity_type: 'service',
            status: 'established',
            corroborations: 1,
            updated_at: '2026-09-09T12:00:00.000Z',
          },
        ],
        stats: { total: 1, established: 1, total_corroborations: 1 },
      }),
      get: jest.fn().mockResolvedValue({
        id: 'cortex_service_email-service',
        title: 'Email Service',
        entity_type: 'service',
        status: 'established',
        corroborations: 1,
        updated_at: '2026-09-09T12:00:00.000Z',
        slug: 'email-service',
        content: 'Sends mail.',
      }),
      upsert: jest.fn().mockResolvedValue({}),
      corroborate: jest.fn(),
      archive: jest.fn(),
      pruneDuplicates: jest.fn().mockResolvedValue(0),
    };

    await applyCortexEdits({
      store,
      logger: loggerMock.create(),
      edits: [
        {
          action: 'upsert',
          entity_type: 'service',
          slug: 'cortex-service-email-service',
          title: 'Email Service',
          content: 'Updated.',
        },
      ],
    });

    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'email-service',
        content: 'Updated.',
      })
    );
  });
});

describe('optimizeCortex', () => {
  it('applies LLM proposals from the investigation transcript', async () => {
    const store: CortexPageStore = {
      list: jest.fn().mockResolvedValue({
        pages: [],
        stats: { total: 0, established: 0, total_corroborations: 0 },
      }),
      get: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue({}),
      corroborate: jest.fn(),
      archive: jest.fn(),
      pruneDuplicates: jest.fn().mockResolvedValue(0),
    };

    await optimizeCortex({
      store,
      logger: loggerMock.create(),
      userMessage: 'Why is checkout slow?',
      assistantMessage: 'Redis lock contention on checkout.',
      proposeEdits: async () => ({
        edits: [
          {
            action: 'upsert',
            entity_type: 'service',
            slug: 'checkout',
            title: 'Checkout',
            content: 'Redis lock contention.',
            status: 'tentative',
          },
        ],
      }),
    });

    expect(store.pruneDuplicates).toHaveBeenCalled();
    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'checkout',
        content: 'Redis lock contention.',
      })
    );
  });

  it('skips writes when the optimizer proposes nothing', async () => {
    const store: CortexPageStore = {
      list: jest.fn().mockResolvedValue({
        pages: [],
        stats: { total: 0, established: 0, total_corroborations: 0 },
      }),
      get: jest.fn(),
      upsert: jest.fn(),
      corroborate: jest.fn(),
      archive: jest.fn(),
      pruneDuplicates: jest.fn().mockResolvedValue(0),
    };

    await optimizeCortex({
      store,
      logger: loggerMock.create(),
      userMessage: 'hello',
      assistantMessage: 'nothing durable',
      proposeEdits: async () => ({ edits: [] }),
    });

    expect(store.upsert).not.toHaveBeenCalled();
  });
});
