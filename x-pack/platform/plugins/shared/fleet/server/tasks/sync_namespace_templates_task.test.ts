/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';

import { appContextService } from '../services';
import { syncNamespaceTemplates } from '../services/epm/packages';

import {
  registerSyncNamespaceTemplatesTask,
  scheduleSyncNamespaceTemplatesTask,
} from './sync_namespace_templates_task';

jest.mock('../services');
jest.mock('../services/epm/packages');

const mockedSyncNamespaceTemplates = syncNamespaceTemplates as jest.MockedFunction<
  typeof syncNamespaceTemplates
>;

const mockSoClient = { getCurrentNamespace: jest.fn().mockReturnValue('default') } as any;
const mockEsClient = {} as any;

describe('syncNamespaceTemplatesTask', () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (appContextService.getLogger as jest.Mock).mockReturnValue(logger);
    (appContextService.getInternalUserSOClientForSpaceId as jest.Mock).mockReturnValue(
      mockSoClient
    );
    (appContextService.getInternalUserESClient as jest.Mock).mockReturnValue(mockEsClient);
    mockedSyncNamespaceTemplates.mockResolvedValue({
      packageName: 'nginx',
      created: [],
      removed: [],
      skipped: false,
    });
  });

  describe('registerSyncNamespaceTemplatesTask', () => {
    it('should register the task definition', () => {
      const taskManager = taskManagerMock.createSetup();
      registerSyncNamespaceTemplatesTask(taskManager);
      expect(taskManager.registerTaskDefinitions).toHaveBeenCalledWith(
        expect.objectContaining({
          'fleet:sync_namespace_templates': expect.objectContaining({
            title: 'Fleet Sync namespace templates',
            timeout: '15m',
            maxAttempts: 3,
          }),
        })
      );
    });
  });

  describe('scheduleSyncNamespaceTemplatesTask', () => {
    it('should schedule the task with correct parameters', async () => {
      const taskManager = taskManagerMock.createStart();
      await scheduleSyncNamespaceTemplatesTask(taskManager, {
        spaceId: 'default',
        packageName: 'nginx',
        addedNamespaces: ['production'],
        removedNamespaces: [],
      });
      expect(taskManager.ensureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'fleet:sync_namespace_templates',
          scope: ['fleet'],
          params: {
            spaceId: 'default',
            packageName: 'nginx',
            addedNamespaces: ['production'],
            removedNamespaces: [],
          },
          state: {},
        })
      );
    });

    it('should not schedule when there are no namespace changes', async () => {
      const taskManager = taskManagerMock.createStart();
      await scheduleSyncNamespaceTemplatesTask(taskManager, {
        spaceId: 'default',
        packageName: 'nginx',
        addedNamespaces: [],
        removedNamespaces: [],
      });
      expect(taskManager.ensureScheduled).not.toHaveBeenCalled();
    });
  });

  describe('task runner', () => {
    const createTaskRunner = (params: Record<string, unknown>) => {
      const taskManager = taskManagerMock.createSetup();
      registerSyncNamespaceTemplatesTask(taskManager);
      const registeredDef =
        taskManager.registerTaskDefinitions.mock.calls[0][0]['fleet:sync_namespace_templates'];
      const abortController = new AbortController();
      const runner = registeredDef.createTaskRunner(
        taskManagerMock.createRunContext({ taskInstance: { params } as any, abortController })
      );
      return { runner, abortController };
    };

    it('should call syncNamespaceTemplates with correct parameters', async () => {
      const { runner, abortController } = createTaskRunner({
        spaceId: 'my_space',
        packageName: 'nginx',
        addedNamespaces: ['production'],
        removedNamespaces: ['staging'],
      });

      await runner.run();

      expect(appContextService.getInternalUserSOClientForSpaceId).toHaveBeenCalledWith('my_space');
      expect(appContextService.getInternalUserESClient).toHaveBeenCalled();
      expect(mockedSyncNamespaceTemplates).toHaveBeenCalledWith({
        soClient: mockSoClient,
        esClient: mockEsClient,
        packageName: 'nginx',
        addedNamespaces: ['production'],
        removedNamespaces: ['staging'],
        abortController,
      });
    });

    it('should be a no-op when there are no namespace changes', async () => {
      const { runner } = createTaskRunner({
        spaceId: 'default',
        packageName: 'nginx',
        addedNamespaces: [],
        removedNamespaces: [],
      });

      await runner.run();

      expect(mockedSyncNamespaceTemplates).not.toHaveBeenCalled();
    });

    it('should pass an aborted signal to syncNamespaceTemplates when the task is cancelled', async () => {
      const { runner, abortController } = createTaskRunner({
        spaceId: 'default',
        packageName: 'nginx',
        addedNamespaces: ['production'],
        removedNamespaces: [],
      });

      abortController.abort();
      await runner.run();

      expect(mockedSyncNamespaceTemplates).toHaveBeenCalledWith(
        expect.objectContaining({ abortController })
      );
      expect(abortController.signal.aborted).toBe(true);
    });
  });
});
