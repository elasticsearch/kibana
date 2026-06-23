/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Facade tests for WorkflowsService.
 *
 * This file intentionally does NOT re-test behaviour that lives in sub-services.
 * Behavioural coverage belongs in:
 *   - services/workflow_crud_service.test.ts
 *   - services/workflow_execution_query_service.test.ts
 *   - api/lib/*.test.ts and task_defs/*.test.ts (library-function specs)
 *
 * The facade owns exactly two concerns:
 *   1. initPromise sequencing — every public method awaits init before delegating.
 *   2. error propagation from sub-services.
 */

import type { CoreStart, ElasticsearchClient } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { workflowsExecutionEngineMock } from '@kbn/workflows-execution-engine/server/mocks';

import { WorkflowsService } from './workflows_management_service';
import { readWorkflowVersioningEnabled } from '../lib/is_workflow_versioning_enabled';
import { WorkflowChangeHistoryService } from '../services/workflow_change_history_service';
import { WorkflowCrudService } from '../services/workflow_crud_service';
import { WorkflowExecutionQueryService } from '../services/workflow_execution_query_service';
import { WorkflowSearchService } from '../services/workflow_search_service';
import { WorkflowValidationService } from '../services/workflow_validation_service';
import type { WorkflowsServerPluginStartDeps } from '../types';

jest.mock('../services/workflow_change_history_service');
jest.mock('../lib/is_workflow_versioning_enabled', () => ({
  readWorkflowVersioningEnabled: jest.fn().mockResolvedValue(true),
}));

const MockedWorkflowChangeHistoryService = WorkflowChangeHistoryService as jest.MockedClass<
  typeof WorkflowChangeHistoryService
>;
const mockedReadWorkflowVersioningEnabled = readWorkflowVersioningEnabled as jest.MockedFunction<
  typeof readWorkflowVersioningEnabled
>;

type PrototypeSpies = Record<string, jest.SpyInstance>;

const spyPrototype = <T extends object>(
  klass: { prototype: T },
  methods: ReadonlyArray<keyof T & string>
): PrototypeSpies => {
  const spies: PrototypeSpies = {};
  const prototype = klass.prototype as unknown as Record<string, jest.Mock>;
  for (const method of methods) {
    spies[method] = jest
      .spyOn(prototype, method)
      .mockResolvedValue({ facadeTest: method } as never);
  }
  return spies;
};

const makeEsClient = (): jest.Mocked<ElasticsearchClient> =>
  ({
    indices: {
      exists: jest.fn().mockResolvedValue(true),
      create: jest.fn(),
      putMapping: jest.fn(),
      getIndexTemplate: jest.fn().mockResolvedValue({}),
      putIndexTemplate: jest.fn(),
      getAlias: jest.fn().mockResolvedValue({}),
      putAlias: jest.fn(),
      get: jest.fn().mockResolvedValue({}),
      simulateIndexTemplate: jest.fn().mockResolvedValue({ template: { mappings: {} } }),
    },
    search: jest.fn(),
    index: jest.fn(),
    bulk: jest.fn(),
    delete: jest.fn(),
    deleteByQuery: jest.fn(),
  } as unknown as jest.Mocked<ElasticsearchClient>);

const makePluginsStart = (): WorkflowsServerPluginStartDeps =>
  ({
    workflowsExecutionEngine: workflowsExecutionEngineMock.createStart(),
    taskManager: {
      schedule: jest.fn(),
      ensureScheduled: jest.fn(),
      fetch: jest.fn().mockResolvedValue({ docs: [] }),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    actions: {
      getUnsecuredActionsClient: jest.fn().mockReturnValue({}),
      getActionsClientWithRequest: jest.fn().mockResolvedValue({}),
    },
    workflowsExtensions: {
      getAllTriggerDefinitions: jest.fn().mockReturnValue([]),
    },
  } as unknown as WorkflowsServerPluginStartDeps);

const makeCoreStart = (esClient: ElasticsearchClient): CoreStart =>
  ({
    ...coreMock.createStart(),
    elasticsearch: { client: { asInternalUser: esClient } },
  } as unknown as CoreStart);

describe('WorkflowsService (facade)', () => {
  let crudSpies: PrototypeSpies;
  let searchSpies: PrototypeSpies;
  let executionQuerySpies: PrototypeSpies;
  let validationSpies: PrototypeSpies;

  const buildService = async (): Promise<WorkflowsService> => {
    const coreStart = makeCoreStart(makeEsClient());
    const startServices = jest.fn().mockResolvedValue([coreStart, makePluginsStart()]);
    const service = new WorkflowsService(startServices as any, loggerMock.create(), '9.0.0');
    // Wait a tick so initialize() completes.
    await Promise.resolve();
    await Promise.resolve();
    return service;
  };

  beforeEach(() => {
    mockedReadWorkflowVersioningEnabled.mockResolvedValue(true);
    MockedWorkflowChangeHistoryService.mockImplementation(
      () =>
        ({
          initialize: jest.fn().mockResolvedValue(undefined),
          isInitialized: jest.fn().mockReturnValue(true),
        } as unknown as WorkflowChangeHistoryService)
    );
    crudSpies = spyPrototype(WorkflowCrudService, [
      'getWorkflow',
      'getWorkflowsByIds',
      'getWorkflowsSourceByIds',
      'createWorkflow',
      'bulkCreateWorkflows',
      'updateWorkflow',
      'deleteWorkflows',
      'disableAllWorkflows',
    ]);
    searchSpies = spyPrototype(WorkflowSearchService, [
      'getWorkflowsSubscribedToTrigger',
      'getWorkflows',
      'getWorkflowStats',
      'getWorkflowAggs',
    ]);
    executionQuerySpies = spyPrototype(WorkflowExecutionQueryService, [
      'getWorkflowExecution',
      'getChildWorkflowExecutions',
      'getWorkflowExecutions',
      'getWorkflowExecutionHistory',
      'getStepExecutions',
      'searchStepExecutions',
      'getExecutionLogs',
      'getStepLogs',
      'getStepExecution',
    ]);
    validationSpies = spyPrototype(WorkflowValidationService, [
      'getAvailableConnectors',
      'validateWorkflow',
      'getWorkflowZodSchema',
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('initializes change history when workflow versioning uiSetting is enabled', async () => {
      mockedReadWorkflowVersioningEnabled.mockResolvedValue(true);

      const changeHistoryInstance = {
        initialize: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(true),
      };
      MockedWorkflowChangeHistoryService.mockImplementation(
        () => changeHistoryInstance as unknown as WorkflowChangeHistoryService
      );

      const esClient = makeEsClient();
      const coreStart = makeCoreStart(esClient);
      const service = await (async () => {
        const startServices = jest.fn().mockResolvedValue([coreStart, makePluginsStart()]);
        const svc = new WorkflowsService(startServices as any, loggerMock.create(), '9.0.0');
        await Promise.resolve();
        await Promise.resolve();
        return svc;
      })();

      await service.getWorkflow('wf-1', 'default');

      expect(mockedReadWorkflowVersioningEnabled).toHaveBeenCalledWith(coreStart);
      expect(changeHistoryInstance.initialize).toHaveBeenCalledWith({
        elasticsearchClient: esClient,
        authService: coreStart.security!.authc,
      });
    });

    it('skips change history init when workflow versioning uiSetting is disabled', async () => {
      mockedReadWorkflowVersioningEnabled.mockResolvedValue(false);

      const changeHistoryInstance = {
        initialize: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(false),
      };
      MockedWorkflowChangeHistoryService.mockImplementation(
        () => changeHistoryInstance as unknown as WorkflowChangeHistoryService
      );

      const esClient = makeEsClient();
      const coreStart = makeCoreStart(esClient);
      const service = await (async () => {
        const startServices = jest.fn().mockResolvedValue([coreStart, makePluginsStart()]);
        const svc = new WorkflowsService(startServices as any, loggerMock.create(), '9.0.0');
        await Promise.resolve();
        await Promise.resolve();
        return svc;
      })();

      await service.getWorkflow('wf-1', 'default');

      expect(mockedReadWorkflowVersioningEnabled).toHaveBeenCalledWith(coreStart);
      expect(changeHistoryInstance.initialize).not.toHaveBeenCalled();
    });

    it('awaits initPromise before delegating to a sub-service', async () => {
      let releaseStartServices: (value: [CoreStart, WorkflowsServerPluginStartDeps]) => void = () =>
        undefined;
      const startServicesPromise = new Promise<[CoreStart, WorkflowsServerPluginStartDeps]>(
        (resolve) => {
          releaseStartServices = resolve;
        }
      );

      const startServices = jest.fn().mockReturnValue(startServicesPromise);
      const service = new WorkflowsService(startServices as any, loggerMock.create(), '9.0.0');

      const call = service.getWorkflow('wf-1', 'default');
      // Give the microtask queue a chance to run — the call must still be pending.
      await Promise.resolve();
      expect(crudSpies.getWorkflow).not.toHaveBeenCalled();

      releaseStartServices([makeCoreStart(makeEsClient()), makePluginsStart()]);

      await call;
      expect(crudSpies.getWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  describe('delegation', () => {
    it('delegates CRUD reads and writes to WorkflowCrudService', async () => {
      const service = await buildService();
      const request = {} as any;

      await service.getWorkflow('wf-1', 'default', { includeDeleted: true });
      await service.getWorkflowsByIds(['a', 'b'], 'default', { includeDeleted: true });
      await service.getWorkflowsSourceByIds(['a'], 'default', ['name'], { includeDeleted: false });
      await service.createWorkflow({ name: 'n' } as any, 'default', request);
      await service.bulkCreateWorkflows([{ name: 'n' } as any], 'default', request, {
        overwrite: true,
      });
      await service.updateWorkflow('wf-1', { name: 'new' } as any, 'default', request);
      await service.deleteWorkflows(['wf-1'], 'default', { force: true });
      await service.disableAllWorkflows('my-space');

      expect(crudSpies.getWorkflow).toHaveBeenCalledWith('wf-1', 'default', {
        includeDeleted: true,
      });
      expect(crudSpies.getWorkflowsByIds).toHaveBeenCalledWith(['a', 'b'], 'default', {
        includeDeleted: true,
      });
      expect(crudSpies.getWorkflowsSourceByIds).toHaveBeenCalledWith(['a'], 'default', ['name'], {
        includeDeleted: false,
      });
      expect(crudSpies.createWorkflow).toHaveBeenCalledWith({ name: 'n' }, 'default', request);
      expect(crudSpies.bulkCreateWorkflows).toHaveBeenCalledWith(
        [{ name: 'n' }],
        'default',
        request,
        { overwrite: true }
      );
      expect(crudSpies.updateWorkflow).toHaveBeenCalledWith(
        'wf-1',
        { name: 'new' },
        'default',
        request
      );
      expect(crudSpies.deleteWorkflows).toHaveBeenCalledWith(['wf-1'], 'default', { force: true });
      expect(crudSpies.disableAllWorkflows).toHaveBeenCalledWith('my-space');
    });

    it('delegates search-side reads to WorkflowSearchService', async () => {
      const service = await buildService();

      await service.getWorkflowsSubscribedToTrigger('trig-1', 'default');
      await service.getWorkflows({ page: 1, size: 10 } as any, 'default', {
        includeExecutionHistory: true,
      });
      await service.getWorkflowStats('default', { includeExecutionStats: true });
      await service.getWorkflowAggs(['name'], 'default');
      await service.getWorkflowAggs(['tags'], 'default', { managedFilter: 'all' });

      expect(searchSpies.getWorkflowsSubscribedToTrigger).toHaveBeenCalledWith('trig-1', 'default');
      expect(searchSpies.getWorkflows).toHaveBeenCalledWith({ page: 1, size: 10 }, 'default', {
        includeExecutionHistory: true,
      });
      expect(searchSpies.getWorkflowStats).toHaveBeenCalledWith('default', {
        includeExecutionStats: true,
      });
      expect(searchSpies.getWorkflowAggs).toHaveBeenCalledWith(['name'], 'default');
      expect(searchSpies.getWorkflowAggs).toHaveBeenCalledWith(['tags'], 'default', {
        managedFilter: 'all',
      });
    });

    it('delegates execution reads to WorkflowExecutionQueryService', async () => {
      const service = await buildService();

      await service.getWorkflowExecution('exec-1', 'default', { includeInput: true });
      await service.getChildWorkflowExecutions('parent-1', 'default');
      await service.getWorkflowExecutions({ workflowId: 'wf-1' } as any, 'default');
      await service.getWorkflowExecutionHistory('exec-1', 'default');
      await service.getStepExecutions({ executionId: 'exec-1' } as any, 'default');
      await service.searchStepExecutions({ executionId: 'exec-1' } as any, 'default');
      await service.getExecutionLogs({ executionId: 'exec-1' } as any);
      await service.getStepLogs({ executionId: 'exec-1' } as any);
      await service.getStepExecution({ executionId: 'exec-1' } as any, 'default');

      expect(executionQuerySpies.getWorkflowExecution).toHaveBeenCalledWith('exec-1', 'default', {
        includeInput: true,
      });
      expect(executionQuerySpies.getChildWorkflowExecutions).toHaveBeenCalledWith(
        'parent-1',
        'default'
      );
      expect(executionQuerySpies.getWorkflowExecutions).toHaveBeenCalled();
      expect(executionQuerySpies.getWorkflowExecutionHistory).toHaveBeenCalled();
      expect(executionQuerySpies.getStepExecutions).toHaveBeenCalled();
      expect(executionQuerySpies.searchStepExecutions).toHaveBeenCalled();
      expect(executionQuerySpies.getExecutionLogs).toHaveBeenCalled();
      expect(executionQuerySpies.getStepLogs).toHaveBeenCalled();
      expect(executionQuerySpies.getStepExecution).toHaveBeenCalled();
    });

    it('delegates validation operations to WorkflowValidationService', async () => {
      const service = await buildService();
      const request = {} as any;

      await service.getAvailableConnectors('default', request);
      await service.validateWorkflow('name: wf', 'default', request);
      await service.getWorkflowZodSchema({ loose: false }, 'default', request);

      expect(validationSpies.getAvailableConnectors).toHaveBeenCalledWith('default', request);
      expect(validationSpies.validateWorkflow).toHaveBeenCalledWith('name: wf', 'default', request);
      expect(validationSpies.getWorkflowZodSchema).toHaveBeenCalledWith(
        { loose: false },
        'default',
        request
      );
    });
  });

  describe('error propagation', () => {
    it('surfaces rejections from sub-services untouched', async () => {
      const service = await buildService();
      const boom = new Error('sub-service failure');
      (crudSpies.getWorkflow as jest.SpyInstance).mockRejectedValueOnce(boom);

      await expect(service.getWorkflow('wf-1', 'default')).rejects.toBe(boom);
    });
  });

  describe('listWaitingForInputSteps', () => {
    it('delegates to WorkflowExecutionQueryService.listWaitingForInputSteps after init', async () => {
      // Behavioural coverage for this method lives next to the implementation
      // in `services/workflow_execution_query_service.test.ts`. This facade
      // test only asserts the delegation shape.
      const listSpy = jest
        .spyOn(WorkflowExecutionQueryService.prototype, 'listWaitingForInputSteps')
        .mockResolvedValue({ results: [], total: 0 } as never);
      try {
        const service = await buildService();
        await service.listWaitingForInputSteps('my-space', { page: 2, perPage: 25 });
        expect(listSpy).toHaveBeenCalledWith('my-space', { page: 2, perPage: 25 });
      } finally {
        listSpy.mockRestore();
      }
    });
  });
});
