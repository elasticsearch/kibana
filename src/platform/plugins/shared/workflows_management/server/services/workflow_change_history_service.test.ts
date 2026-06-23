/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ChangeHistoryClient } from '@kbn/change-history';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';

import {
  WORKFLOW_CHANGE_HISTORY_DATASET,
  WORKFLOW_CHANGE_HISTORY_MODULE,
  WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
  WORKFLOW_CHANGE_HISTORY_SYSTEM_USER,
} from './workflow_change_history_constants';
import { WorkflowChangeHistoryService } from './workflow_change_history_service';

jest.mock('@kbn/change-history', () => {
  const actual = jest.requireActual('@kbn/change-history');
  return {
    ...actual,
    ChangeHistoryClient: jest.fn(),
  };
});

const MockedChangeHistoryClient = ChangeHistoryClient as jest.MockedClass<
  typeof ChangeHistoryClient
>;

describe('WorkflowChangeHistoryService', () => {
  const logger = loggerMock.create();
  const clientMock = {
    isInitialized: jest.fn().mockReturnValue(false),
    initialize: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue(undefined),
    logBulk: jest.fn().mockResolvedValue(undefined),
    getHistory: jest.fn().mockResolvedValue({ total: 0, items: [] }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    MockedChangeHistoryClient.mockImplementation(
      () => clientMock as unknown as ChangeHistoryClient
    );
    clientMock.isInitialized.mockReturnValue(false);
  });

  it('constructs ChangeHistoryClient with stack module and workflows dataset', () => {
    new WorkflowChangeHistoryService(logger, '9.0.0');

    expect(MockedChangeHistoryClient).toHaveBeenCalledWith(
      expect.objectContaining({
        module: WORKFLOW_CHANGE_HISTORY_MODULE,
        dataset: WORKFLOW_CHANGE_HISTORY_DATASET,
        kibanaVersion: '9.0.0',
      })
    );
  });

  it('initializes the change history client with the elasticsearch client', async () => {
    const service = new WorkflowChangeHistoryService(logger, '9.0.0');
    const elasticsearchClient = elasticsearchServiceMock.createElasticsearchClient();
    const authService = {
      getCurrentUser: jest.fn().mockReturnValue({ username: 'alice', profile_uid: 'profile-1' }),
    };

    await service.initialize({ elasticsearchClient, authService: authService as any });

    expect(clientMock.initialize).toHaveBeenCalledWith(elasticsearchClient);
  });

  it('initialize resolves after client initialization completes', async () => {
    let resolveInitialize: () => void = () => undefined;
    const initializePromise = new Promise<void>((resolve) => {
      resolveInitialize = resolve;
    });
    clientMock.initialize.mockReturnValue(initializePromise);

    const service = new WorkflowChangeHistoryService(logger, '9.0.0');
    const elasticsearchClient = elasticsearchServiceMock.createElasticsearchClient();
    const authService = {
      getCurrentUser: jest.fn().mockReturnValue({ username: 'alice', profile_uid: 'profile-1' }),
    };

    let ready = false;
    const initializeCall = service
      .initialize({ elasticsearchClient, authService: authService as any })
      .then(() => {
        ready = true;
      });

    await Promise.resolve();
    expect(ready).toBe(false);

    resolveInitialize();
    await initializeCall;
    expect(ready).toBe(true);
  });

  it('resolves without throwing when client initialization fails', async () => {
    const cause = new Error('data stream unavailable');
    clientMock.initialize.mockRejectedValue(cause);

    const service = new WorkflowChangeHistoryService(logger, '9.0.0');
    const elasticsearchClient = elasticsearchServiceMock.createElasticsearchClient();
    const authService = {
      getCurrentUser: jest.fn().mockReturnValue({ username: 'alice', profile_uid: 'profile-1' }),
    };

    await expect(
      service.initialize({ elasticsearchClient, authService: authService as any })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
    expect(service.isInitialized()).toBe(false);
  });

  it('reports initialized state from the underlying client', () => {
    clientMock.isInitialized.mockReturnValue(true);
    const service = new WorkflowChangeHistoryService(logger, '9.0.0');

    expect(service.isInitialized()).toBe(true);
  });

  it('delegates getHistory with the workflow object type', async () => {
    const service = new WorkflowChangeHistoryService(logger, '9.0.0');

    await service.getHistory('default', 'wf-1', { size: 10 });

    expect(clientMock.getHistory).toHaveBeenCalledWith(
      'default',
      WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
      'wf-1',
      { size: 10 }
    );
  });

  it('asScoped injects username and userProfileId from the request', async () => {
    const service = new WorkflowChangeHistoryService(logger, '9.0.0');
    const authService = {
      getCurrentUser: jest.fn().mockReturnValue({ username: 'alice', profile_uid: 'profile-1' }),
    };
    await service.initialize({
      elasticsearchClient: elasticsearchServiceMock.createElasticsearchClient(),
      authService: authService as any,
    });

    const scoped = service.asScoped({} as any);
    await scoped.logBulk(
      [
        {
          objectId: 'wf-1',
          objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
          snapshot: { name: 'A' },
        },
      ],
      { action: 'workflow_update', spaceId: 'default' }
    );

    expect(clientMock.logBulk).toHaveBeenCalledWith(
      [
        {
          objectId: 'wf-1',
          objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
          snapshot: { name: 'A' },
        },
      ],
      {
        action: 'workflow_update',
        spaceId: 'default',
        username: 'alice',
        userProfileId: 'profile-1',
      }
    );
  });

  it('asSystemUser injects the system username', async () => {
    const service = new WorkflowChangeHistoryService(logger, '9.0.0');

    const scoped = service.asSystemUser();
    await scoped.logBulk(
      [
        {
          objectId: 'wf-1',
          objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
          snapshot: { name: 'A' },
        },
      ],
      { action: 'install', spaceId: 'default' }
    );

    expect(clientMock.logBulk).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        action: 'install',
        spaceId: 'default',
        username: WORKFLOW_CHANGE_HISTORY_SYSTEM_USER,
      })
    );
  });

  it('throws when asScoped is called before initialize', () => {
    const service = new WorkflowChangeHistoryService(logger, '9.0.0');

    expect(() => service.asScoped({} as any)).toThrow(/before initialize/);
  });
});
