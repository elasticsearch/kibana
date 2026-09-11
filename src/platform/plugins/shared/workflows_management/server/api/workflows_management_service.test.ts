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
 *   - lib/wait_for_managed_workflow_install_readiness.test.ts
 *
 * The facade owns exactly three concerns:
 *   1. initPromise sequencing — every public method awaits init before delegating.
 *   2. error propagation from sub-services.
 *   3. managed install readiness gate — skip install/ready/orphan cleanup when not ready.
 */

import type { CoreSetup, CoreStart, ElasticsearchClient } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { workflowsExecutionEngineMock } from '@kbn/workflows-execution-engine/server/mocks';

import { WorkflowsService } from './workflows_management_service';
import { waitForManagedWorkflowInstallReadiness } from '../lib/wait_for_managed_workflow_install_readiness';
import { ManagedWorkflowsService } from '../services/managed_workflows_service';
import { WorkflowChangeHistoryService } from '../services/workflow_change_history_service';
import { WorkflowCrudService } from '../services/workflow_crud_service';
import { WorkflowExecutionQueryService } from '../services/workflow_execution_query_service';
import { WorkflowSearchService } from '../services/workflow_search_service';
import { WorkflowValidationService } from '../services/workflow_validation_service';
import type { WorkflowsServerPluginSetupDeps, WorkflowsServerPluginStartDeps } from '../types';

jest.mock('../services/workflow_change_history_service');
jest.mock('../lib/wait_for_managed_workflow_install_readiness', () => ({
  waitForManagedWorkflowInstallReadiness: jest.fn(),
}));

const MockedWorkflowChangeHistoryService = WorkflowChangeHistoryService as jest.MockedClass<
  typeof WorkflowChangeHistoryService
>;

const mockedWaitForManagedWorkflowInstallReadiness =
  waitForManagedWorkflowInstallReadiness as jest.MockedFunction<
    typeof waitForManagedWorkflowInstallReadiness
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
    info: jest.fn().mockResolvedValue({ version: { build_flavor: 'default' } }),
    indices: {
      // Default to cold start so init warm-up exercises template + index creation.
      // Empty alias map means no write index yet (same outcome as a 404).
      create: jest.fn().mockResolvedValue({}),
      putMapping: jest.fn(),
      getIndexTemplate: jest.fn().mockResolvedValue({ index_templates: [] }),
      putIndexTemplate: jest.fn().mockResolvedValue({}),
      getAlias: jest.fn().mockResolvedValue({}),
      putAlias: jest.fn(),
      get: jest.fn().mockResolvedValue({}),
      simulateIndexTemplate: jest.fn().mockResolvedValue({ template: { mappings: {} } }),
    },
    search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
    bulk: jest.fn(),
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

const makeCoreSetup = (
  startServices: () => Promise<[CoreStart, WorkflowsServerPluginStartDeps]>
): CoreSetup<WorkflowsServerPluginStartDeps> =>
  ({
    getStartServices: startServices,
    status: {
      core$: { subscribe: jest.fn() },
    },
  } as unknown as CoreSetup<WorkflowsServerPluginStartDeps>);

const makePluginsSetup = (): WorkflowsServerPluginSetupDeps =>
  ({} as unknown as WorkflowsServerPluginSetupDeps);

describe('WorkflowsService (facade)', () => {
  let crudSpies: PrototypeSpies;
  let searchSpies: PrototypeSpies;
  let executionQuerySpies: PrototypeSpies;
  let validationSpies: PrototypeSpies;
  let managedSpies: PrototypeSpies;

  const buildService = async (): Promise<WorkflowsService> => {
    const coreStart = makeCoreStart(makeEsClient());
    const startServices = jest.fn().mockResolvedValue([coreStart, makePluginsStart()]);
    const service = new WorkflowsService(
      makeCoreSetup(startServices),
      makePluginsSetup(),
      loggerMock.create(),
      '9.0.0'
    );
    // Wait a tick so initialize() completes.
    await Promise.resolve();
    await Promise.resolve();
    return service;
  };

  beforeEach(() => {
    MockedWorkflowChangeHistoryService.mockImplementation(
      () =>
        ({
          initialize: jest.fn().mockResolvedValue(undefined),
          isInitialized: jest.fn().mockReturnValue(true),
        } as unknown as WorkflowChangeHistoryService)
    );
    mockedWaitForManagedWorkflowInstallReadiness.mockResolvedValue({ ready: true });
    crudSpies = spyPrototype(WorkflowCrudService, [
      'getWorkflow',
      'getWorkflowDocumentSource',
      'getManagedWorkflowDocumentsAllSpaces',
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
    managedSpies = spyPrototype(ManagedWorkflowsService, [
      'installManagedWorkflow',
      'pluginReady',
      'cleanupUnregisteredOrphans',
      'markInstallIncomplete',
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('initializes change history at startup', async () => {
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
        const svc = new WorkflowsService(
          makeCoreSetup(startServices),
          makePluginsSetup(),
          loggerMock.create(),
          '9.0.0'
        );
        await Promise.resolve();
        await Promise.resolve();
        return svc;
      })();

      await service.getWorkflow('wf-1', 'default');

      expect(changeHistoryInstance.initialize).toHaveBeenCalledWith({
        elasticsearchClient: esClient,
        authService: coreStart.security!.authc,
      });
    });

    it('bootstraps workflows storage index at startup', async () => {
      const esClient = makeEsClient();
      const coreStart = makeCoreStart(esClient);
      const startServices = jest.fn().mockResolvedValue([coreStart, makePluginsStart()]);
      const service = new WorkflowsService(
        makeCoreSetup(startServices),
        makePluginsSetup(),
        loggerMock.create(),
        '9.0.0'
      );

      await service.getWorkflow('wf-1', 'default');

      expect(esClient.indices.putIndexTemplate).toHaveBeenCalled();
      expect(esClient.indices.create).toHaveBeenCalled();
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
      const service = new WorkflowsService(
        makeCoreSetup(startServices),
        makePluginsSetup(),
        loggerMock.create(),
        '9.0.0'
      );

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
    it('returns managed template values to their owning plugin', async () => {
      const source = {
        managed: true,
        managedBy: 'alertzero',
        managedTemplateValues: { autonomyLevel: 'assisted' },
        originManagedWorkflowId: 'system-security-watch-floor',
        spaceId: 'space-a',
        version: 4,
      };
      crudSpies.getWorkflowDocumentSource.mockResolvedValue(source);
      const service = await buildService();

      await expect(
        service.getInstalledManagedWorkflowState(
          'system-security-watch-floor-space-a',
          'space-a',
          'alertzero'
        )
      ).resolves.toEqual({
        workflowId: 'system-security-watch-floor-space-a',
        templateValues: { autonomyLevel: 'assisted' },
        definitionId: 'system-security-watch-floor',
        spaceId: 'space-a',
        documentVersion: 4,
      });
    });

    it('delegates CRUD reads and writes to WorkflowCrudService', async () => {
      const service = await buildService();
      const request = {} as any;

      await service.getWorkflow('wf-1', 'default', { includeDeleted: true });
      await service.getWorkflowsByIds(['a', 'b'], 'default', { includeDeleted: true });
      await service.getWorkflowsSourceByIds(['a'], 'default', ['name'], { includeDeleted: false });
      await service.createWorkflow({ name: 'n' } as any, 'default', request, {
        nameFallback: 'n Copy',
      });
      await service.bulkCreateWorkflows([{ name: 'n' } as any], 'default', request, {
        overwrite: true,
      });
      await service.updateWorkflow('wf-1', { name: 'new' } as any, 'default', request);
      await service.deleteWorkflows(['wf-1'], 'default', { force: true });
      await service.disableAllWorkflows('my-space', request);

      expect(crudSpies.getWorkflow).toHaveBeenCalledWith('wf-1', 'default', {
        includeDeleted: true,
      });
      expect(crudSpies.getWorkflowsByIds).toHaveBeenCalledWith(['a', 'b'], 'default', {
        includeDeleted: true,
      });
      expect(crudSpies.getWorkflowsSourceByIds).toHaveBeenCalledWith(['a'], 'default', ['name'], {
        includeDeleted: false,
      });
      expect(crudSpies.createWorkflow).toHaveBeenCalledWith({ name: 'n' }, 'default', request, {
        nameFallback: 'n Copy',
      });
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
      expect(crudSpies.disableAllWorkflows).toHaveBeenCalledWith('my-space', request);
    });

    it('reads soft-deleted workflows when gating workflow change history', async () => {
      const getHistory = jest.fn().mockResolvedValue({ total: 0, items: [] });
      MockedWorkflowChangeHistoryService.mockImplementation(
        () =>
          ({
            initialize: jest.fn().mockResolvedValue(undefined),
            isInitialized: jest.fn().mockReturnValue(true),
            getHistory,
          } as unknown as WorkflowChangeHistoryService)
      );

      crudSpies.getWorkflowDocumentSource.mockResolvedValue({
        spaceId: 'default',
      } as never);

      const service = await buildService();

      await service.getHistoryForWorkflow('wf-1', 'default', { page: 1, perPage: 20 });

      expect(crudSpies.getWorkflowDocumentSource).toHaveBeenCalledWith('wf-1', 'default', {
        includeGlobal: true,
        includeDeleted: true,
      });
      expect(getHistory).toHaveBeenCalledWith('default', 'wf-1', { from: 0, size: 20 });
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

  describe('managed install readiness gate', () => {
    it('skips install, ready, and orphan cleanup when the gate is not ready', async () => {
      mockedWaitForManagedWorkflowInstallReadiness.mockResolvedValue({
        ready: false,
        reason: 'stopping',
      });
      const service = await buildService();

      await service.installManagedWorkflow('wf.managed' as any, { spaceId: 'default' }, 'owner');
      await service.pluginReady('owner');
      await service.cleanupUnregisteredOrphans(['owner']);

      expect(managedSpies.installManagedWorkflow).not.toHaveBeenCalled();
      expect(managedSpies.markInstallIncomplete).toHaveBeenCalledWith('owner');
      expect(managedSpies.pluginReady).not.toHaveBeenCalled();
      expect(managedSpies.cleanupUnregisteredOrphans).not.toHaveBeenCalled();
      expect(mockedWaitForManagedWorkflowInstallReadiness).toHaveBeenCalled();
    });

    it('marks install incomplete when install is gated out so ready reconcile stays safe', async () => {
      mockedWaitForManagedWorkflowInstallReadiness
        .mockResolvedValueOnce({ ready: false, reason: 'stopping' })
        .mockResolvedValueOnce({ ready: true });
      const service = await buildService();

      await service.installManagedWorkflow('wf.managed' as any, { spaceId: 'default' }, 'owner');
      await service.pluginReady('owner');

      expect(managedSpies.installManagedWorkflow).not.toHaveBeenCalled();
      expect(managedSpies.markInstallIncomplete).toHaveBeenCalledWith('owner');
      expect(managedSpies.pluginReady).toHaveBeenCalledWith('owner');
    });

    it('delegates install, ready, and orphan cleanup when the gate is ready', async () => {
      mockedWaitForManagedWorkflowInstallReadiness.mockResolvedValue({ ready: true });
      const service = await buildService();

      await service.installManagedWorkflow('wf.managed' as any, { spaceId: 'default' }, 'owner');
      await service.pluginReady('owner');
      await service.cleanupUnregisteredOrphans(['owner']);

      expect(managedSpies.installManagedWorkflow).toHaveBeenCalledWith(
        'wf.managed',
        { spaceId: 'default' },
        'owner'
      );
      expect(managedSpies.markInstallIncomplete).not.toHaveBeenCalled();
      expect(managedSpies.pluginReady).toHaveBeenCalledWith('owner');
      expect(managedSpies.cleanupUnregisteredOrphans).toHaveBeenCalledWith(['owner']);
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

  describe('markStepAsResponded', () => {
    it('resolves the responder via the security service and delegates with full audit metadata', async () => {
      // The service owns username resolution so callers cannot spoof audit identity.
      // Behavioral coverage of the ES update lives in the query-service tests.
      const markSpy = jest
        .spyOn(WorkflowExecutionQueryService.prototype, 'markStepAsResponded')
        .mockResolvedValue(true as never);
      try {
        const service = await buildService();
        const request = { headers: {} } as unknown as Parameters<
          typeof service.markStepAsResponded
        >[1];
        await service.markStepAsResponded('step-exec-1', request, 'inbox', 'default');

        expect(markSpy).toHaveBeenCalledWith(
          'step-exec-1',
          expect.objectContaining({
            channel: 'inbox',
            // The mock security service returns `system` for fake
            // requests; the real service swaps in the actual user.
            respondedBy: expect.any(String),
            respondedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          }),
          'default'
        );
      } finally {
        markSpy.mockRestore();
      }
    });
  });
});
