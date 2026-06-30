/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { Logger } from '@kbn/logging';
import type { SmlTypeDefinition, SmlService } from './types';
import {
  SML_CRAWLER_TASK_TYPE,
  registerSmlCrawlerTaskDefinition,
  scheduleSmlCrawlerTasks,
} from './sml_task_definitions';

const mockEsClient = {};
const mockSoRepository = {};

const mockUiSettingsClient = { get: jest.fn().mockResolvedValue(true) };
const mockUiSettings = { asScopedToClient: jest.fn().mockReturnValue(mockUiSettingsClient) };

const mockCrawler = { crawl: jest.fn().mockResolvedValue(undefined) };
const mockSmlService = {
  getCrawler: jest.fn().mockReturnValue(mockCrawler),
  getTypeDefinition: jest.fn(),
  listTypeDefinitions: jest.fn().mockReturnValue([]),
  search: jest.fn(),
  checkItemsAccess: jest.fn(),
  indexAttachment: jest.fn(),
  getDocuments: jest.fn(),
};
const mockLogger = loggerMock.create();
(mockLogger.get as jest.Mock).mockReturnValue(mockLogger);
const mockGetCrawlerDeps = jest.fn().mockResolvedValue({
  smlService: mockSmlService,
  elasticsearch: { client: { asInternalUser: mockEsClient } },
  savedObjects: { createInternalRepository: jest.fn().mockReturnValue(mockSoRepository) },
  uiSettings: mockUiSettings,
  logger: mockLogger,
});

const mockTaskManager = {
  registerTaskDefinitions: jest.fn(),
  ensureScheduled: jest.fn().mockResolvedValue(undefined),
};

const createMockDefinition = (overrides: Partial<SmlTypeDefinition> = {}): SmlTypeDefinition => ({
  id: 'visualization',
  list: jest.fn(),
  getSmlData: jest.fn(),
  toAttachment: jest.fn(),
  ...overrides,
});

const mockAbortController = new AbortController();

function getRegisteredTaskRunner(params: { attachmentType?: string }) {
  registerSmlCrawlerTaskDefinition({
    taskManager: mockTaskManager as unknown as TaskManagerSetupContract,
    getCrawlerDeps: mockGetCrawlerDeps,
  });
  const registered = mockTaskManager.registerTaskDefinitions.mock.calls[0][0];
  const taskDef = registered[SML_CRAWLER_TASK_TYPE];
  return taskDef.createTaskRunner({
    taskInstance: { params },
    abortController: mockAbortController,
  } as unknown as { taskInstance: { params?: Record<string, unknown> }; abortController: AbortController });
}

describe('sml_task_definitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUiSettingsClient.get.mockResolvedValue(true);
    mockGetCrawlerDeps.mockResolvedValue({
      smlService: mockSmlService,
      elasticsearch: { client: { asInternalUser: mockEsClient } },
      savedObjects: { createInternalRepository: jest.fn().mockReturnValue(mockSoRepository) },
      uiSettings: mockUiSettings,
      logger: mockLogger,
    });
    mockSmlService.listTypeDefinitions.mockReturnValue([]);
    mockSmlService.getCrawler.mockReturnValue(mockCrawler);
  });

  describe('registerSmlCrawlerTaskDefinition', () => {
    it('registers task with correct type', () => {
      registerSmlCrawlerTaskDefinition({
        taskManager: mockTaskManager as unknown as TaskManagerSetupContract,
        getCrawlerDeps: mockGetCrawlerDeps,
      });

      expect(mockTaskManager.registerTaskDefinitions).toHaveBeenCalledTimes(1);
      const callArg = mockTaskManager.registerTaskDefinitions.mock.calls[0][0];
      expect(callArg).toHaveProperty(SML_CRAWLER_TASK_TYPE);
      expect(callArg[SML_CRAWLER_TASK_TYPE]).toMatchObject({
        title: 'Agent Context Layer: SML Crawler',
        timeout: '10m',
        maxAttempts: 3,
      });
      expect(callArg[SML_CRAWLER_TASK_TYPE].createTaskRunner).toBeDefined();
    });
  });

  describe('task runner', () => {
    it('returns {state:{}} when no attachmentType', async () => {
      const runner = getRegisteredTaskRunner({});

      const result = await runner.run();

      expect(result).toEqual({ state: {} });
      expect(mockGetCrawlerDeps).not.toHaveBeenCalled();
    });

    it('skips crawl when the Context Engine is disabled', async () => {
      mockUiSettingsClient.get.mockResolvedValue(false);
      const definition = createMockDefinition({ id: 'visualization' });
      mockSmlService.getTypeDefinition.mockReturnValue(definition);

      const runner = getRegisteredTaskRunner({ attachmentType: 'visualization' });
      const result = await runner.run();

      expect(result).toEqual({ state: {} });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "SML crawler: Context Engine disabled — skipping crawl for type 'visualization'"
      );
      expect(mockCrawler.crawl).not.toHaveBeenCalled();
    });

    it('awaits getCrawlerDeps and calls crawler.crawl with correct params', async () => {
      const definition = createMockDefinition({ id: 'visualization' });
      mockSmlService.getTypeDefinition.mockReturnValue(definition);
      mockSmlService.listTypeDefinitions.mockReturnValue([definition]);

      const runner = getRegisteredTaskRunner({ attachmentType: 'visualization' });
      await runner.run();

      expect(mockGetCrawlerDeps).toHaveBeenCalled();
      expect(mockCrawler.crawl).toHaveBeenCalledWith({
        definition,
        esClient: mockEsClient,
        savedObjectsClient: mockSoRepository,
        abortSignal: mockAbortController.signal,
      });
    });

    it('warns and returns when type definition not found', async () => {
      mockSmlService.getTypeDefinition.mockReturnValue(undefined);
      mockSmlService.listTypeDefinitions.mockReturnValue([{ id: 'dashboard' }]);

      const runner = getRegisteredTaskRunner({ attachmentType: 'unknown-type' });
      const result = await runner.run();

      expect(result).toEqual({ state: {} });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "SML crawler task: type definition 'unknown-type' not found — skipping. Registered types: [dashboard]"
      );
      expect(mockCrawler.crawl).not.toHaveBeenCalled();
    });

    it('catches and logs crawler.crawl errors', async () => {
      const definition = createMockDefinition({ id: 'visualization' });
      mockSmlService.getTypeDefinition.mockReturnValue(definition);
      mockCrawler.crawl.mockRejectedValue(new Error('crawl failed'));

      const runner = getRegisteredTaskRunner({ attachmentType: 'visualization' });
      const result = await runner.run();

      expect(result).toEqual({ state: {} });
      expect(mockLogger.error).toHaveBeenCalledWith(
        "SML crawler task failed for type 'visualization': crawl failed"
      );
    });
  });

  describe('scheduleSmlCrawlerTasks', () => {
    it('schedules a task per registered type', async () => {
      const def1 = createMockDefinition({ id: 'visualization' });
      const def2 = createMockDefinition({ id: 'dashboard' });
      mockSmlService.listTypeDefinitions.mockReturnValue([def1, def2]);

      await scheduleSmlCrawlerTasks({
        taskManager: mockTaskManager as unknown as TaskManagerStartContract,
        smlService: mockSmlService as unknown as SmlService,
        logger: mockLogger as unknown as Logger,
      });

      expect(mockTaskManager.ensureScheduled).toHaveBeenCalledTimes(2);
      expect(mockTaskManager.ensureScheduled).toHaveBeenNthCalledWith(1, {
        id: 'agent_context_layer:sml_crawler:visualization',
        taskType: SML_CRAWLER_TASK_TYPE,
        params: { attachmentType: 'visualization' },
        schedule: { interval: '10m' },
        scope: ['agentContextLayer'],
        state: {},
      });
      expect(mockTaskManager.ensureScheduled).toHaveBeenNthCalledWith(2, {
        id: 'agent_context_layer:sml_crawler:dashboard',
        taskType: SML_CRAWLER_TASK_TYPE,
        params: { attachmentType: 'dashboard' },
        schedule: { interval: '10m' },
        scope: ['agentContextLayer'],
        state: {},
      });
    });

    it('uses custom fetchFrequency when provided', async () => {
      const def = createMockDefinition({
        id: 'visualization',
        fetchFrequency: () => '5m',
      });
      mockSmlService.listTypeDefinitions.mockReturnValue([def]);

      await scheduleSmlCrawlerTasks({
        taskManager: mockTaskManager as unknown as TaskManagerStartContract,
        smlService: mockSmlService as unknown as SmlService,
        logger: mockLogger as unknown as Logger,
      });

      expect(mockTaskManager.ensureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: { interval: '5m' },
        })
      );
    });

    it('defaults to 10m interval', async () => {
      const def = createMockDefinition({ id: 'visualization' });
      mockSmlService.listTypeDefinitions.mockReturnValue([def]);

      await scheduleSmlCrawlerTasks({
        taskManager: mockTaskManager as unknown as TaskManagerStartContract,
        smlService: mockSmlService as unknown as SmlService,
        logger: mockLogger as unknown as Logger,
      });

      expect(mockTaskManager.ensureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: { interval: '10m' },
        })
      );
    });

    it('logs error when ensureScheduled fails', async () => {
      const def = createMockDefinition({ id: 'visualization' });
      mockSmlService.listTypeDefinitions.mockReturnValue([def]);
      mockTaskManager.ensureScheduled.mockRejectedValue(new Error('schedule failed'));

      await scheduleSmlCrawlerTasks({
        taskManager: mockTaskManager as unknown as TaskManagerStartContract,
        smlService: mockSmlService as unknown as SmlService,
        logger: mockLogger as unknown as Logger,
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to schedule SML crawler task for type 'visualization': schedule failed"
      );
    });
  });
});
