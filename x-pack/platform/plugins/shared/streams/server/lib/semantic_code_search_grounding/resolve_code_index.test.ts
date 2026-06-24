/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { resolveRepositoryForCodeIndex } from './resolve_code_index';

describe('resolve_code_index', () => {
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    logger = loggerMock.create();
  });

  describe('resolveRepositoryForCodeIndex', () => {
    const makeEsClient = (search: jest.Mock) => ({ search } as unknown as ElasticsearchClient);

    it('reads the repository keyword from a code index document', async () => {
      const search = jest.fn().mockResolvedValue({
        hits: { hits: [{ _source: { repository: 'acme/checkout' } }] },
      });
      await expect(
        resolveRepositoryForCodeIndex({
          esClient: makeEsClient(search),
          codeIndex: 'code-acme_checkout',
          logger,
        })
      ).resolves.toBe('acme/checkout');
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'code-acme_checkout', size: 1 })
      );
    });

    it('returns undefined when no document carries a repository field', async () => {
      const search = jest.fn().mockResolvedValue({ hits: { hits: [] } });
      await expect(
        resolveRepositoryForCodeIndex({
          esClient: makeEsClient(search),
          codeIndex: 'code-acme_checkout',
          logger,
        })
      ).resolves.toBeUndefined();
    });

    it('returns undefined when the repository field is empty', async () => {
      const search = jest.fn().mockResolvedValue({
        hits: { hits: [{ _source: { repository: '' } }] },
      });
      await expect(
        resolveRepositoryForCodeIndex({
          esClient: makeEsClient(search),
          codeIndex: 'code-acme_checkout',
          logger,
        })
      ).resolves.toBeUndefined();
    });

    it('returns undefined and warns when the search throws', async () => {
      const search = jest.fn().mockRejectedValue(new Error('boom'));
      await expect(
        resolveRepositoryForCodeIndex({
          esClient: makeEsClient(search),
          codeIndex: 'code-acme_checkout',
          logger,
        })
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
