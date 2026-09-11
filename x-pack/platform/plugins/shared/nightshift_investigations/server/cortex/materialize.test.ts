/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { materializeCortex } from './materialize';
import type { CortexPageStore } from './page_store';

describe('materializeCortex', () => {
  it('writes README, INDEX, and each page into the sandbox workspace', async () => {
    const store: CortexPageStore = {
      list: jest.fn().mockResolvedValue({
        pages: [
          {
            id: 'cortex_service_checkout',
            title: 'Checkout',
            entity_type: 'service',
            status: 'established',
            corroborations: 2,
            updated_at: '2026-09-09T12:00:00.000Z',
          },
        ],
        stats: { total: 1, established: 1, total_corroborations: 2 },
      }),
      get: jest.fn().mockResolvedValue({
        id: 'cortex_service_checkout',
        title: 'Checkout',
        entity_type: 'service',
        status: 'established',
        corroborations: 2,
        updated_at: '2026-09-09T12:00:00.000Z',
        slug: 'checkout',
        content: 'Checkout talks to Redis.',
      }),
      upsert: jest.fn(),
      corroborate: jest.fn(),
      archive: jest.fn(),
      pruneDuplicates: jest.fn().mockResolvedValue(0),
    };

    const apiClient = {
      mkdirs: jest.fn().mockResolvedValue([true]),
      writeFiles: jest.fn().mockResolvedValue([]),
    };

    await materializeCortex({
      apiClient: apiClient as never,
      conversationId: 'conv-1',
      store,
      logger: loggerMock.create(),
    });

    expect(store.pruneDuplicates).toHaveBeenCalled();
    expect(apiClient.mkdirs).toHaveBeenCalledWith(
      'conv-1',
      expect.arrayContaining(['/workspace/cortex', '/workspace/cortex/services'])
    );
    expect(apiClient.writeFiles).toHaveBeenCalledWith(
      'conv-1',
      expect.arrayContaining([
        expect.objectContaining({ path: '/workspace/cortex/README.md' }),
        expect.objectContaining({ path: '/workspace/cortex/INDEX.md' }),
        expect.objectContaining({ path: '/workspace/cortex/services/checkout.md' }),
      ])
    );
  });
});
