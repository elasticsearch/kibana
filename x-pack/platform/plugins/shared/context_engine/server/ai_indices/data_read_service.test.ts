/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { AuditLogger } from '@kbn/core-security-server';
import type { AiIndexHttpItem } from '../../common/http_api/ai_indices';
import { buildAiIndexSpaceFilter } from '../../common/space_filter';
import { AiIndexDataReadService } from './data_read_service';
import { describeAiIndex } from './describe';
import { AiIndexNotFoundError } from './errors';
import { resolveAiIndexVisibility, type AiIndexVisibility } from './list_visible';

jest.mock('./describe');
jest.mock('./list_visible');

const describeAiIndexMock = jest.mocked(describeAiIndex);
const resolveAiIndexVisibilityMock = jest.mocked(resolveAiIndexVisibility);

const aiIndex: AiIndexHttpItem = {
  id: 'support',
  dest: { type: 'index', value: 'ai-index-idx-support' },
  managed: false,
  automations: [],
  sources: [],
  date_created: '2026-01-01T00:00:00.000Z',
  date_modified: '2026-01-01T00:00:00.000Z',
};

const contextBlock = 'AI index: support\nQuery with ES|QL against: ai-index-idx-support';

describe('AiIndexDataReadService', () => {
  const esqlQuery = jest.fn();
  const esClient = { esql: { query: esqlQuery } } as unknown as ElasticsearchClient;
  const auditLogger = { log: jest.fn() } as unknown as jest.Mocked<AuditLogger>;
  const aiIndexService = { get: jest.fn(), list: jest.fn() };
  const logger = loggingSystemMock.createLogger();
  const service = new AiIndexDataReadService({
    esClient,
    spaceId: 'marketing',
    auditLogger,
    aiIndexService,
    logger,
  });

  beforeEach(() => {
    esqlQuery.mockReset();
    auditLogger.log.mockReset();
    aiIndexService.get.mockReset();
    aiIndexService.list.mockReset();
    describeAiIndexMock.mockReset();
    resolveAiIndexVisibilityMock.mockReset();
  });

  describe('query', () => {
    it('runs the query in the service space and audit-logs success', async () => {
      esqlQuery.mockResolvedValue({ columns: [], values: [] });

      const result = await service.query({ query: 'FROM ai-index-idx-a', limit: 10 });

      expect(result).toEqual({ columns: [], values: [] });
      expect(esqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'FROM ai-index-idx-a | LIMIT 10',
          filter: buildAiIndexSpaceFilter('marketing'),
        }),
        expect.anything()
      );
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User has queried an AI index',
          event: expect.objectContaining({ action: 'ai_index_query', outcome: 'success' }),
        })
      );
    });

    it('audit-logs failure and rethrows', async () => {
      esqlQuery.mockRejectedValue(new Error('boom'));

      await expect(service.query({ query: 'FROM ai-index-idx-a' })).rejects.toThrow('boom');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed attempt to query an AI index',
          event: expect.objectContaining({ action: 'ai_index_query', outcome: 'failure' }),
          error: { code: 'Error', message: 'boom' },
        })
      );
    });
  });

  describe('describe', () => {
    it('resolves the registry entry, describes it as the current user, and audit-logs success', async () => {
      aiIndexService.get.mockResolvedValue(aiIndex);
      describeAiIndexMock.mockResolvedValue(contextBlock);

      const result = await service.describe('support');

      expect(result).toEqual({ response: contextBlock });
      expect(aiIndexService.get).toHaveBeenCalledWith('support');
      expect(describeAiIndexMock).toHaveBeenCalledWith({ esClient, aiIndex, spaceId: 'marketing' });
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User has described AI index [id=support]',
          event: expect.objectContaining({ action: 'ai_index_describe', outcome: 'success' }),
          kibana: { saved_object: { type: 'ai_index', id: 'support' } },
        })
      );
    });

    it('audit-logs the failure and rethrows for an unknown id', async () => {
      aiIndexService.get.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await expect(service.describe('missing')).rejects.toThrow(AiIndexNotFoundError);

      expect(describeAiIndexMock).not.toHaveBeenCalled();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed attempt to describe AI index [id=missing]',
          event: expect.objectContaining({ action: 'ai_index_describe', outcome: 'failure' }),
          error: { code: 'AiIndexNotFoundError', message: "AI index 'missing' not found" },
        })
      );
    });

    it('audit-logs other failures and rethrows', async () => {
      aiIndexService.get.mockResolvedValue(aiIndex);
      describeAiIndexMock.mockRejectedValue(new Error('boom'));

      await expect(service.describe('support')).rejects.toThrow('boom');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ action: 'ai_index_describe', outcome: 'failure' }),
          error: { code: 'Error', message: 'boom' },
        })
      );
    });
  });

  describe('listVisible', () => {
    const withId = (id: string): AiIndexHttpItem => ({ ...aiIndex, id });
    const registry = ['visible', 'empty', 'hidden', 'unknown'].map(withId);

    it('keeps visible and empty entries, drops hidden and unknown, and audit-logs success', async () => {
      aiIndexService.list.mockResolvedValue(registry);
      resolveAiIndexVisibilityMock.mockResolvedValue(
        registry.map((entry) => ({ aiIndex: entry, visibility: entry.id as AiIndexVisibility }))
      );

      const result = await service.listVisible();

      expect(resolveAiIndexVisibilityMock).toHaveBeenCalledWith({
        esClient,
        aiIndices: registry,
        spaceId: 'marketing',
        logger,
      });
      expect(result.map(({ id }) => id)).toEqual(['visible', 'empty']);
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'ai_index_list',
            type: ['access'],
            outcome: 'success',
          }),
          kibana: { saved_object: undefined },
        })
      );
    });

    it('narrows the registry to the requested ids before probing', async () => {
      aiIndexService.list.mockResolvedValue(registry);
      resolveAiIndexVisibilityMock.mockResolvedValue([
        { aiIndex: registry[0], visibility: 'visible' },
      ]);

      const result = await service.listVisible(['visible', 'not-registered']);

      expect(resolveAiIndexVisibilityMock).toHaveBeenCalledWith(
        expect.objectContaining({ aiIndices: [registry[0]] })
      );
      expect(result.map(({ id }) => id)).toEqual(['visible']);
    });

    it('audit-logs failure and rethrows', async () => {
      aiIndexService.list.mockRejectedValue(new Error('boom'));

      await expect(service.listVisible()).rejects.toThrow('boom');

      expect(resolveAiIndexVisibilityMock).not.toHaveBeenCalled();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ action: 'ai_index_list', outcome: 'failure' }),
          error: { code: 'Error', message: 'boom' },
        })
      );
    });
  });
});
