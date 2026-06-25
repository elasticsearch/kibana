/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type { ReplaySubject } from 'rxjs';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { createCoreSetupMock } from '@kbn/core-lifecycle-browser-mocks/src/core_setup.mock';
import { AutomaticImportService } from './automatic_import_service';
import type {
  AnalyticsServiceSetup,
  AuthenticatedUser,
  CoreSetup,
  ElasticsearchClient,
  KibanaRequest,
  SavedObjectsServiceSetup,
  SavedObjectsClient,
} from '@kbn/core/server';
import type {
  ConcreteTaskInstance,
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { AutomaticImportPluginStartDependencies } from '../types';
import type { ApproveIntegrationParams, CreateUpdateIntegrationParams } from '../routes/types';
import type { AutomaticImportSamplesIndexService } from './samples_index/index_service';
import type { AutomaticImportSavedObjectService } from './saved_objects/saved_objects_service';
import type { TaskManagerService } from './task_manager/task_manager_service';

interface AutomaticImportServicePrivate {
  pluginStop$: ReplaySubject<void>;
  savedObjectsServiceSetup: SavedObjectsServiceSetup;
  savedObjectService: AutomaticImportSavedObjectService | null;
  samplesIndexService:
    | AutomaticImportSamplesIndexService
    | Partial<Record<'addSamplesToDataStream' | 'deleteSamplesForDataStream', jest.Mock>>;
  taskManagerService:
    | TaskManagerService
    | Partial<Record<'removeDataStreamCreationTask', jest.Mock>>;
}

interface TaskManagerWithPrivate {
  automaticImportSavedObjectService:
    | AutomaticImportSavedObjectService
    | Record<string, unknown>
    | null;
  agentService: { invokeAutomaticImportAgent: jest.Mock };
  runTask: (...args: unknown[]) => Promise<unknown>;
}

const asPrivate = (svc: AutomaticImportService): AutomaticImportServicePrivate =>
  svc as unknown as AutomaticImportServicePrivate;

const asTaskManagerPrivate = (tm: TaskManagerService): TaskManagerWithPrivate =>
  tm as unknown as TaskManagerWithPrivate;

// Mock the AutomaticImportSamplesIndexService
jest.mock('./samples_index/index_service', () => {
  return {
    AutomaticImportSamplesIndexService: jest.fn().mockImplementation(() => ({
      createSamplesDocs: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn(),
    })),
  };
});

describe('AutomaticImportSetupService', () => {
  let service: AutomaticImportService;
  let mockLoggerFactory: ReturnType<typeof loggerMock.create>;
  let mockSavedObjectsSetup: jest.Mocked<SavedObjectsServiceSetup>;
  let mockSavedObjectsClient: SavedObjectsClient;
  let mockTaskManagerSetup: jest.Mocked<TaskManagerSetupContract>;
  let mockTaskManagerStart: jest.Mocked<TaskManagerStartContract>;
  let mockCoreSetup: ReturnType<typeof createCoreSetupMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoggerFactory = loggerMock.create();
    mockSavedObjectsSetup = savedObjectsServiceMock.createSetupContract();
    mockSavedObjectsClient = savedObjectsClientMock.create() as unknown as SavedObjectsClient;
    mockCoreSetup = createCoreSetupMock();

    // Mock TaskManager contracts
    mockTaskManagerSetup = {
      registerTaskDefinitions: jest.fn(),
    } as unknown as jest.Mocked<TaskManagerSetupContract>;

    mockTaskManagerStart = {
      schedule: jest.fn(),
      runSoon: jest.fn(),
      get: jest.fn(),
      ensureScheduled: jest.fn(),
    } as unknown as jest.Mocked<TaskManagerStartContract>;

    const mockAnalytics = {
      reportEvent: jest.fn(),
      registerEventType: jest.fn(),
    } as unknown as AnalyticsServiceSetup;

    service = new AutomaticImportService(
      mockLoggerFactory,
      mockSavedObjectsSetup,
      mockTaskManagerSetup,
      mockCoreSetup as unknown as CoreSetup<AutomaticImportPluginStartDependencies>,
      mockAnalytics
    );
  });

  describe('constructor', () => {
    it('should initialize the AutomaticImportSamplesIndexService with correct parameters', () => {
      const { AutomaticImportSamplesIndexService: MockedService } = jest.requireMock(
        './samples_index/index_service'
      );

      expect(MockedService).toHaveBeenCalledWith(mockLoggerFactory);
    });

    it('should initialize the pluginStop$ subject', () => {
      expect(asPrivate(service).pluginStop$).toBeDefined();
      expect(asPrivate(service).pluginStop$.subscribe).toBeDefined();
    });

    it('should register saved object types during construction', () => {
      expect(mockSavedObjectsSetup.registerType).toHaveBeenCalledTimes(2);
      expect(mockSavedObjectsSetup.registerType).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'integration-config' })
      );
      expect(mockSavedObjectsSetup.registerType).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'data_stream-config' })
      );
    });

    it('should store the savedObjectsServiceSetup reference', () => {
      expect(asPrivate(service).savedObjectsServiceSetup).toBe(mockSavedObjectsSetup);
    });
  });

  describe('initialize', () => {
    const mockInternalEsClient = {} as unknown as ElasticsearchClient;

    it('should initialize saved object service', async () => {
      await service.initialize(mockSavedObjectsClient, mockTaskManagerStart, mockInternalEsClient);

      expect(asPrivate(service).savedObjectService).toBeDefined();
    });

    it('should create savedObjectService with correct parameters', async () => {
      await service.initialize(mockSavedObjectsClient, mockTaskManagerStart, mockInternalEsClient);

      const savedObjectService = asPrivate(service).savedObjectService;
      expect(savedObjectService).toBeDefined();
    });
  });

  describe('methods before initialization', () => {
    it('should throw error when calling createIntegration before initialize', async () => {
      const params: CreateUpdateIntegrationParams = {
        integrationParams: {
          integrationId: 'id',
          description: '',
          title: '',
        },
        authenticatedUser: { username: 'u' } as AuthenticatedUser,
      };
      await expect(service.createUpdateIntegration(params)).rejects.toThrow(
        'Saved Objects service not initialized.'
      );
    });

    it('should throw error when calling getIntegrationById before initialize', async () => {
      await expect(service.getIntegrationById('test-id')).rejects.toThrow(
        'Saved Objects service not initialized.'
      );
    });

    it('should throw error when calling approveIntegration before initialize', async () => {
      await expect(
        service.approveIntegration({
          integrationId: 'test-id',
          authenticatedUser: { username: 'test-user' } as AuthenticatedUser,
          version: '1.0.0',
          categories: ['security'],
        })
      ).rejects.toThrow('Saved Objects service not initialized.');
    });
  });

  describe('approveIntegration', () => {
    it('should update integration status to approved and bump version (expectedVersion from request)', async () => {
      const mockGetIntegration = jest.fn().mockResolvedValue({
        integration_id: 'integration-123',
        created_by: 'creator',
        status: 'pending',
        metadata: { title: 't', description: 'd', version: '0.0.1' },
      });
      const mockGetAllDataStreams = jest
        .fn()
        .mockResolvedValue([
          { job_info: { status: 'completed' } },
          { job_info: { status: 'completed' } },
        ]);
      const mockUpdateIntegration = jest.fn().mockResolvedValue({});

      asPrivate(service).savedObjectService = {
        getIntegration: mockGetIntegration,
        getAllDataStreams: mockGetAllDataStreams,
        updateIntegration: mockUpdateIntegration,
      } as unknown as AutomaticImportSavedObjectService;

      await service.approveIntegration({
        integrationId: 'integration-123',
        authenticatedUser: { username: 'approver-user' } as AuthenticatedUser,
        version: '1.2.3',
        categories: ['observability'],
      });

      expect(mockGetIntegration).toHaveBeenCalledWith('integration-123');
      expect(mockGetAllDataStreams).toHaveBeenCalledWith('integration-123');
      expect(mockUpdateIntegration).toHaveBeenCalledTimes(1);

      const [updateData, expectedVersion] = mockUpdateIntegration.mock.calls[0];
      expect(expectedVersion).toBe('1.2.3');
      expect(updateData.integration_id).toBe('integration-123');
      expect(updateData.last_updated_by).toBe('approver-user');
      expect(updateData.last_updated_at).toEqual(expect.any(String));
      expect(updateData.status).toBe('approved');
      expect(updateData.metadata).toEqual(
        expect.objectContaining({ version: '0.0.1', categories: ['observability'] })
      );

      expect(updateData.changelog).toEqual([
        {
          version: '1.2.3',
          changes: [{ description: 'Initial release of t', type: 'enhancement', link: '' }],
        },
      ]);

      expect(mockUpdateIntegration.mock.calls[0]).toHaveLength(2);
    });

    it('should prepend changelog entry on subsequent approvals', async () => {
      const existingChangelog = [
        {
          version: '1.0.0',
          changes: [{ description: 'Initial release of t', type: 'enhancement', link: '' }],
        },
      ];
      const mockGetIntegration = jest.fn().mockResolvedValue({
        integration_id: 'integration-123',
        created_by: 'creator',
        status: 'approved',
        metadata: { title: 't', description: 'd', version: '1.0.0' },
        changelog: existingChangelog,
      });
      const mockGetAllDataStreams = jest
        .fn()
        .mockResolvedValue([{ job_info: { status: 'completed' } }]);
      const mockUpdateIntegration = jest.fn().mockResolvedValue({});

      asPrivate(service).savedObjectService = {
        getIntegration: mockGetIntegration,
        getAllDataStreams: mockGetAllDataStreams,
        updateIntegration: mockUpdateIntegration,
      } as unknown as AutomaticImportSavedObjectService;

      await service.approveIntegration({
        integrationId: 'integration-123',
        authenticatedUser: { username: 'approver-user' } as AuthenticatedUser,
        version: '1.1.0',
        categories: ['security'],
      });

      const [updateData] = mockUpdateIntegration.mock.calls[0];
      expect(updateData.changelog).toHaveLength(2);
      expect(updateData.changelog[0]).toEqual({
        version: '1.1.0',
        changes: [{ description: 'Updated t', type: 'enhancement', link: '' }],
      });
      expect(updateData.changelog[1]).toEqual(existingChangelog[0]);
    });

    it('should not approve integration with no data streams', async () => {
      const mockGetIntegration = jest.fn().mockResolvedValue({
        integration_id: 'integration-empty',
        created_by: 'creator',
        status: 'pending',
        metadata: { title: 't', description: 'd', version: '0.0.1' },
      });
      const mockGetAllDataStreams = jest.fn().mockResolvedValue([]);
      const mockUpdateIntegration = jest.fn().mockResolvedValue({});

      asPrivate(service).savedObjectService = {
        getIntegration: mockGetIntegration,
        getAllDataStreams: mockGetAllDataStreams,
        updateIntegration: mockUpdateIntegration,
      } as unknown as AutomaticImportSavedObjectService;

      await expect(
        service.approveIntegration({
          integrationId: 'integration-empty',
          authenticatedUser: { username: 'approver-user' } as AuthenticatedUser,
          version: '1.2.3',
          categories: ['security'],
        })
      ).rejects.toThrow('Cannot approve integration integration-empty with no data streams');

      expect(mockGetIntegration).toHaveBeenCalledWith('integration-empty');
      expect(mockGetAllDataStreams).toHaveBeenCalledWith('integration-empty');
      expect(mockUpdateIntegration).not.toHaveBeenCalled();
    });

    it('should not approve integration if any data stream is not completed', async () => {
      const mockGetIntegration = jest.fn().mockResolvedValue({
        integration_id: 'integration-123',
        created_by: 'creator',
        status: 'pending',
        metadata: { title: 't', description: 'd', version: '0.0.1' },
      });
      const mockGetAllDataStreams = jest
        .fn()
        .mockResolvedValue([
          { job_info: { status: 'completed' } },
          { job_info: { status: 'processing' } },
        ]);
      const mockUpdateIntegration = jest.fn();

      asPrivate(service).savedObjectService = {
        getIntegration: mockGetIntegration,
        getAllDataStreams: mockGetAllDataStreams,
        updateIntegration: mockUpdateIntegration,
      } as unknown as AutomaticImportSavedObjectService;

      await expect(
        service.approveIntegration({
          integrationId: 'integration-123',
          authenticatedUser: { username: 'approver-user' } as AuthenticatedUser,
          version: '1.2.3',
          categories: ['security'],
        })
      ).rejects.toThrow(
        'Cannot approve integration integration-123 until all data streams are completed'
      );

      expect(mockUpdateIntegration).not.toHaveBeenCalled();
    });

    it('should propagate errors from saved object service', async () => {
      const mockGetIntegration = jest.fn().mockResolvedValue({
        integration_id: 'integration-123',
        created_by: 'creator',
        status: 'pending',
        metadata: { title: 't', description: 'd', version: '0.0.1' },
      });
      const mockGetAllDataStreams = jest
        .fn()
        .mockResolvedValue([{ job_info: { status: 'completed' } }]);
      const mockUpdateIntegration = jest
        .fn()
        .mockRejectedValue(new Error('Failed to update integration'));

      asPrivate(service).savedObjectService = {
        getIntegration: mockGetIntegration,
        getAllDataStreams: mockGetAllDataStreams,
        updateIntegration: mockUpdateIntegration,
      } as unknown as AutomaticImportSavedObjectService;

      await expect(
        service.approveIntegration({
          integrationId: 'integration-123',
          authenticatedUser: { username: 'approver-user' } as AuthenticatedUser,
          version: '1.2.3',
          categories: ['security'],
        } as unknown as ApproveIntegrationParams)
      ).rejects.toThrow('Failed to update integration');
    });
  });

  describe('stop', () => {
    it('should complete the pluginStop$ subject', () => {
      const pluginStop$ = asPrivate(service).pluginStop$;
      const nextSpy = jest.spyOn(pluginStop$, 'next');
      const completeSpy = jest.spyOn(pluginStop$, 'complete');

      service.stop();

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).toHaveBeenCalledWith();
      expect(completeSpy).toHaveBeenCalledTimes(1);
    });

    it('should emit to all subscribers before completing', (done) => {
      const pluginStop$ = asPrivate(service).pluginStop$;
      let emittedValue: void | undefined;
      let completed = false;

      pluginStop$.subscribe({
        next: (value: void) => {
          emittedValue = value;
        },
        complete: () => {
          completed = true;
          expect(emittedValue).toBeUndefined();
          expect(completed).toBe(true);
          done();
        },
      });

      service.stop();
    });

    it('should be safe to call multiple times', () => {
      const pluginStop$ = asPrivate(service).pluginStop$;
      const nextSpy = jest.spyOn(pluginStop$, 'next');
      const completeSpy = jest.spyOn(pluginStop$, 'complete');

      service.stop();
      service.stop();

      // RxJS subjects are safe to complete multiple times
      expect(nextSpy).toHaveBeenCalledTimes(2);
      expect(completeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('addSamplesToDataStream', () => {
    it('should delegate to samplesIndexService.addSamplesToDataStream', async () => {
      const mockParams = {
        integrationId: 'integration-123',
        dataStreamId: 'data-stream-456',
        rawSamples: ['sample1', 'sample2'],
        originalSource: { sourceType: 'file' as const, sourceValue: 'test.log' },
        createdBy: 'test-user',
      };

      const mockResult = { items: [], errors: false };
      const mockAddSamples = jest.fn().mockResolvedValue(mockResult);

      asPrivate(service).samplesIndexService = {
        addSamplesToDataStream: mockAddSamples,
      };

      const result = await service.addSamplesToDataStream(mockParams);

      expect(mockAddSamples).toHaveBeenCalledWith(mockParams);
      expect(result).toBe(mockResult);
    });

    it('should work without initializing savedObjectService', async () => {
      const mockParams = {
        integrationId: 'integration-123',
        dataStreamId: 'data-stream-456',
        rawSamples: ['sample1'],
        originalSource: { sourceType: 'index' as const, sourceValue: 'logs-*' },
        createdBy: 'test-user',
      };

      const mockResult = { items: [], errors: false };
      const mockAddSamples = jest.fn().mockResolvedValue(mockResult);

      asPrivate(service).samplesIndexService = {
        addSamplesToDataStream: mockAddSamples,
      };

      // Service is not initialized, but this should still work
      expect(asPrivate(service).savedObjectService).toBeNull();

      const result = await service.addSamplesToDataStream(mockParams);

      expect(mockAddSamples).toHaveBeenCalledWith(mockParams);
      expect(result).toBe(mockResult);
    });

    it('should pass through all parameters correctly', async () => {
      const mockParams = {
        integrationId: 'test-integration',
        dataStreamId: 'test-datastream',
        rawSamples: ['log line 1', 'log line 2', 'log line 3'],
        originalSource: { sourceType: 'file' as const, sourceValue: 'application.log' },
        createdBy: 'admin',
      };

      const mockAddSamples = jest.fn().mockResolvedValue({});

      asPrivate(service).samplesIndexService = {
        addSamplesToDataStream: mockAddSamples,
      };

      await service.addSamplesToDataStream(mockParams);

      expect(mockAddSamples).toHaveBeenCalledTimes(1);
      const callArgs = mockAddSamples.mock.calls[0][0];
      expect(callArgs.integrationId).toBe('test-integration');
      expect(callArgs.dataStreamId).toBe('test-datastream');
      expect(callArgs.rawSamples).toEqual(['log line 1', 'log line 2', 'log line 3']);
      expect(callArgs.originalSource).toEqual({
        sourceType: 'file',
        sourceValue: 'application.log',
      });
      expect(callArgs.createdBy).toBe('admin');
    });

    it('should propagate errors from samplesIndexService', async () => {
      const mockParams = {
        integrationId: 'integration-123',
        dataStreamId: 'data-stream-456',
        rawSamples: ['sample1'],
        originalSource: { sourceType: 'file' as const, sourceValue: 'test.log' },
        createdBy: 'test-user',
      };

      const mockError = new Error('Failed to add samples');
      const mockAddSamples = jest.fn().mockRejectedValue(mockError);

      asPrivate(service).samplesIndexService = {
        addSamplesToDataStream: mockAddSamples,
      };

      await expect(service.addSamplesToDataStream(mockParams)).rejects.toThrow(
        'Failed to add samples'
      );
    });
  });

  describe('deleteDataStream', () => {
    const mockInternalEsClient = {} as unknown as ElasticsearchClient;

    beforeEach(async () => {
      await service.initialize(mockSavedObjectsClient, mockTaskManagerStart, mockInternalEsClient);
    });

    it('should delete data stream and call all required services', async () => {
      const mockDeleteSamples = jest.fn().mockResolvedValue({ deleted: 5 });
      const mockRemoveTask = jest.fn().mockResolvedValue(undefined);
      const mockDeleteSavedObject = jest.fn().mockResolvedValue(undefined);
      const mockUpdateStatus = jest.fn().mockResolvedValue(undefined);

      asPrivate(service).samplesIndexService = {
        deleteSamplesForDataStream: mockDeleteSamples,
      };
      asPrivate(service).taskManagerService = {
        removeDataStreamCreationTask: mockRemoveTask,
      };
      asPrivate(service).savedObjectService = {
        deleteDataStream: mockDeleteSavedObject,
        updateDataStreamStatus: mockUpdateStatus,
        getIntegration: jest.fn().mockResolvedValue({ status: 'completed' }),
      } as unknown as AutomaticImportSavedObjectService;

      await service.deleteDataStream('integration-123', 'data-stream-456');

      expect(mockUpdateStatus).toHaveBeenCalledWith(
        'data-stream-456',
        'integration-123',
        'deleting'
      );
      expect(mockRemoveTask).toHaveBeenCalledWith({
        integrationId: 'integration-123',
        dataStreamId: 'data-stream-456',
      });
      expect(mockDeleteSamples).toHaveBeenCalledWith('integration-123', 'data-stream-456');
      expect(mockDeleteSavedObject).toHaveBeenCalledWith(
        'data-stream-456',
        'integration-123',
        undefined
      );
    });

    it('should pass options to saved object service delete', async () => {
      const mockDeleteSamples = jest.fn().mockResolvedValue({ deleted: 0 });
      const mockRemoveTask = jest.fn().mockResolvedValue(undefined);
      const mockDeleteSavedObject = jest.fn().mockResolvedValue(undefined);
      const mockUpdateStatus = jest.fn().mockResolvedValue(undefined);
      const options = { force: true };

      asPrivate(service).samplesIndexService = {
        deleteSamplesForDataStream: mockDeleteSamples,
      };
      asPrivate(service).taskManagerService = {
        removeDataStreamCreationTask: mockRemoveTask,
      };
      asPrivate(service).savedObjectService = {
        deleteDataStream: mockDeleteSavedObject,
        updateDataStreamStatus: mockUpdateStatus,
        getIntegration: jest.fn().mockResolvedValue({ status: 'completed' }),
      } as unknown as AutomaticImportSavedObjectService;

      await service.deleteDataStream('integration-123', 'data-stream-456', options);

      expect(mockDeleteSavedObject).toHaveBeenCalledWith(
        'data-stream-456',
        'integration-123',
        options
      );
    });

    it('should throw error if saved object service is not initialized', async () => {
      asPrivate(service).savedObjectService = null;

      await expect(service.deleteDataStream('integration-123', 'data-stream-456')).rejects.toThrow(
        'Saved Objects service not initialized.'
      );
    });

    it('should still delete saved object when task manager removal fails', async () => {
      const mockDeleteSamples = jest.fn().mockResolvedValue({ deleted: 0 });
      const mockRemoveTask = jest.fn().mockRejectedValue(new Error('Task removal failed'));
      const mockDeleteSavedObject = jest.fn().mockResolvedValue(undefined);
      const mockUpdateStatus = jest.fn().mockResolvedValue(undefined);

      asPrivate(service).samplesIndexService = {
        deleteSamplesForDataStream: mockDeleteSamples,
      };
      asPrivate(service).taskManagerService = {
        removeDataStreamCreationTask: mockRemoveTask,
      };
      asPrivate(service).savedObjectService = {
        deleteDataStream: mockDeleteSavedObject,
        updateDataStreamStatus: mockUpdateStatus,
        getIntegration: jest.fn().mockResolvedValue({ status: 'completed' }),
      } as unknown as AutomaticImportSavedObjectService;

      await service.deleteDataStream('integration-123', 'data-stream-456');

      expect(mockRemoveTask).toHaveBeenCalled();
      expect(mockDeleteSamples).toHaveBeenCalledWith('integration-123', 'data-stream-456');
      expect(mockDeleteSavedObject).toHaveBeenCalledWith(
        'data-stream-456',
        'integration-123',
        undefined
      );
    });

    it('should still delete saved object when samples index deletion fails', async () => {
      const mockDeleteSamples = jest.fn().mockRejectedValue(new Error('Sample deletion failed'));
      const mockRemoveTask = jest.fn().mockResolvedValue(undefined);
      const mockDeleteSavedObject = jest.fn().mockResolvedValue(undefined);
      const mockUpdateStatus = jest.fn().mockResolvedValue(undefined);

      asPrivate(service).samplesIndexService = {
        deleteSamplesForDataStream: mockDeleteSamples,
      };
      asPrivate(service).taskManagerService = {
        removeDataStreamCreationTask: mockRemoveTask,
      };
      asPrivate(service).savedObjectService = {
        deleteDataStream: mockDeleteSavedObject,
        updateDataStreamStatus: mockUpdateStatus,
        getIntegration: jest.fn().mockResolvedValue({ status: 'completed' }),
      } as unknown as AutomaticImportSavedObjectService;

      await service.deleteDataStream('integration-123', 'data-stream-456');

      expect(mockRemoveTask).toHaveBeenCalled();
      expect(mockDeleteSamples).toHaveBeenCalled();
      expect(mockDeleteSavedObject).toHaveBeenCalledWith(
        'data-stream-456',
        'integration-123',
        undefined
      );
    });

    it('should handle errors from saved object service', async () => {
      const mockDeleteSamples = jest.fn().mockResolvedValue({ deleted: 0 });
      const mockRemoveTask = jest.fn().mockResolvedValue(undefined);
      const mockDeleteSavedObject = jest
        .fn()
        .mockRejectedValue(new Error('Saved object deletion failed'));
      const mockUpdateStatus = jest.fn().mockResolvedValue(undefined);

      asPrivate(service).samplesIndexService = {
        deleteSamplesForDataStream: mockDeleteSamples,
      };
      asPrivate(service).taskManagerService = {
        removeDataStreamCreationTask: mockRemoveTask,
      };
      asPrivate(service).savedObjectService = {
        deleteDataStream: mockDeleteSavedObject,
        updateDataStreamStatus: mockUpdateStatus,
      } as unknown as AutomaticImportSavedObjectService;

      await expect(service.deleteDataStream('integration-123', 'data-stream-456')).rejects.toThrow(
        'Saved object deletion failed'
      );
    });

    it('should execute operations in correct order', async () => {
      const executionOrder: string[] = [];
      const mockDeleteSamples = jest.fn().mockImplementation(async () => {
        executionOrder.push('deleteSamples');
        return { deleted: 0 };
      });
      const mockRemoveTask = jest.fn().mockImplementation(async () => {
        executionOrder.push('removeTask');
      });
      const mockDeleteSavedObject = jest.fn().mockImplementation(async () => {
        executionOrder.push('deleteSavedObject');
      });
      const mockUpdateStatus = jest.fn().mockImplementation(async () => {
        executionOrder.push('updateStatus');
      });

      asPrivate(service).samplesIndexService = {
        deleteSamplesForDataStream: mockDeleteSamples,
      };
      asPrivate(service).taskManagerService = {
        removeDataStreamCreationTask: mockRemoveTask,
      };
      asPrivate(service).savedObjectService = {
        deleteDataStream: mockDeleteSavedObject,
        updateDataStreamStatus: mockUpdateStatus,
        getIntegration: jest.fn().mockResolvedValue({ status: 'completed' }),
      } as unknown as AutomaticImportSavedObjectService;

      await service.deleteDataStream('integration-123', 'data-stream-456');

      expect(executionOrder).toEqual([
        'updateStatus',
        'removeTask',
        'deleteSamples',
        'deleteSavedObject',
      ]);
    });
  });

  describe('getDataStreamResults', () => {
    it('returns ingest_pipeline as JSON string and results when completed', async () => {
      const mockGetDataStream = jest.fn().mockResolvedValue({
        attributes: {
          job_info: { status: 'completed' },
          result: {
            ingest_pipeline: { processors: [] },
            pipeline_docs: [{ a: 1 }],
          },
        },
      });

      asPrivate(service).savedObjectService = {
        getDataStream: mockGetDataStream,
      } as unknown as AutomaticImportSavedObjectService;

      const res = await service.getDataStreamResults('integration-1', 'ds-1');
      expect(res.ingest_pipeline).toEqual({ processors: [] });
      expect(res.results).toEqual([{ a: 1 }]);
    });

    it('throws when data stream is not completed', async () => {
      const mockGetDataStream = jest.fn().mockResolvedValue({
        attributes: {
          job_info: { status: 'processing' },
          result: {},
        },
      });

      asPrivate(service).savedObjectService = {
        getDataStream: mockGetDataStream,
      } as unknown as AutomaticImportSavedObjectService;

      await expect(service.getDataStreamResults('integration-1', 'ds-1')).rejects.toThrow(
        'has not completed yet'
      );
    });

    it('throws when data stream is failed', async () => {
      const mockGetDataStream = jest.fn().mockResolvedValue({
        attributes: {
          job_info: { status: 'failed' },
          result: {},
        },
      });

      asPrivate(service).savedObjectService = {
        getDataStream: mockGetDataStream,
      } as unknown as AutomaticImportSavedObjectService;

      await expect(service.getDataStreamResults('integration-1', 'ds-1')).rejects.toThrow(
        'failed and has no results'
      );
    });

    it('returns empty pipeline and field_mapping when ingest pipeline is missing but completed', async () => {
      const mockGetDataStream = jest.fn().mockResolvedValue({
        attributes: {
          job_info: { status: 'completed' },
          result: { pipeline_docs: [{ a: 1 }] },
        },
      });

      asPrivate(service).savedObjectService = {
        getDataStream: mockGetDataStream,
      } as unknown as AutomaticImportSavedObjectService;

      await expect(service.getDataStreamResults('integration-1', 'ds-1')).resolves.toEqual({
        ingest_pipeline: {},
        field_mapping: [],
        results: [{ a: 1 }],
      });
    });
  });

  describe('integration', () => {
    it('should properly initialize and setup the service', async () => {
      const { AutomaticImportSamplesIndexService: MockedService } = jest.requireMock(
        './samples_index/index_service'
      );

      // Verify constructor was called
      expect(MockedService).toHaveBeenCalledWith(mockLoggerFactory);

      expect(mockSavedObjectsSetup.registerType).toHaveBeenCalledTimes(2);
      await service.initialize(
        mockSavedObjectsClient,
        mockTaskManagerStart,
        {} as unknown as ElasticsearchClient
      );

      // Stop the service
      service.stop();

      // Verify pluginStop$ was completed
      expect(asPrivate(service).pluginStop$.isStopped).toBeTruthy();
    });

    it('should maintain the same pluginStop$ instance throughout lifecycle', () => {
      const pluginStop$Before = asPrivate(service).pluginStop$;
      const pluginStop$After = asPrivate(service).pluginStop$;

      expect(pluginStop$Before).toBe(pluginStop$After);
    });

    it('should initialize samples index service with logger factory only', () => {
      const { AutomaticImportSamplesIndexService: MockedService } = jest.requireMock(
        './samples_index/index_service'
      );

      const constructorCall = MockedService.mock.calls[0];
      expect(constructorCall[0]).toBe(mockLoggerFactory);
      expect(constructorCall).toHaveLength(1); // Only one parameter now
    });

    it('should complete full lifecycle: construct -> initialize -> stop', async () => {
      expect(asPrivate(service).savedObjectService).toBeNull();

      await service.initialize(
        mockSavedObjectsClient,
        mockTaskManagerStart,
        {} as unknown as ElasticsearchClient
      );
      expect(asPrivate(service).savedObjectService).toBeDefined();

      // Stop
      service.stop();
      expect(asPrivate(service).pluginStop$.isStopped).toBeTruthy();
    });
  });

  describe('task manager service integration', () => {
    beforeEach(async () => {
      await service.initialize(
        mockSavedObjectsClient,
        mockTaskManagerStart,
        {} as unknown as ElasticsearchClient
      );
    });

    it('should register task definitions during construction', () => {
      expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalledTimes(1);
      const registeredTasks = mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0];
      expect(registeredTasks).toHaveProperty('autoImport-dataStream-task');
      expect(registeredTasks['autoImport-dataStream-task']).toMatchObject({
        title: 'Data Stream generation workflow',
        description: 'Executes long-running AI agent workflows for data stream generation',
      });
    });

    it('should initialize task manager service with saved object service', () => {
      const taskManagerService = asPrivate(service).taskManagerService as TaskManagerService;
      expect(taskManagerService).toBeDefined();
      const tm = asTaskManagerPrivate(taskManagerService);
      expect(tm.automaticImportSavedObjectService).toBe(asPrivate(service).savedObjectService);
    });

    it('should have task runner that updates SavedObjects when run', async () => {
      const mockUpdateDataStream = jest.fn().mockResolvedValue(undefined);
      const mockGetDataStream = jest.fn().mockResolvedValue({
        attributes: {
          data_stream_id: 'test-datastream',
          integration_id: 'test-integration',
          job_info: { status: 'pending', jobId: 'task-123', jobType: 'autoImport-dataStream-task' },
        },
      });

      // Mock the saved object service methods
      asPrivate(service).savedObjectService = {
        updateDataStreamSavedObjectAttributes: mockUpdateDataStream,
        updateDataStreamPhase: jest.fn().mockResolvedValue(undefined),
        getDataStream: mockGetDataStream,
      } as unknown as AutomaticImportSavedObjectService;

      // Re-initialize to set the mocked service
      const taskManagerService = asPrivate(service).taskManagerService as TaskManagerService;
      const tmForSavedObjects = asTaskManagerPrivate(taskManagerService);
      tmForSavedObjects.automaticImportSavedObjectService = asPrivate(service)
        .savedObjectService as AutomaticImportSavedObjectService;

      // Extract the task runner from registered definitions
      const registeredTasks = mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0];
      const taskDefinition = registeredTasks['autoImport-dataStream-task'];
      const createTaskRunner = taskDefinition.createTaskRunner;

      // Mock task instance
      const mockTaskInstance = {
        id: 'test-task-id',
        params: {
          integrationId: 'test-integration',
          dataStreamId: 'test-datastream',
          connectorId: 'test-connector',
          authHeaders: {},
        },
        state: { task_status: 'pending' },
      };

      // Mock core setup and plugins
      const mockCoreStart = {
        elasticsearch: {
          client: {
            asScoped: jest.fn().mockReturnValue({
              asCurrentUser: {},
            }),
          },
        },
      };

      const mockPluginsStart = {
        inference: {
          getChatModel: jest.fn().mockResolvedValue({}),
        },
        fieldsMetadata: {
          getClient: jest.fn().mockResolvedValue({
            find: jest.fn().mockResolvedValue({ toPlain: () => ({}) }),
            getByName: jest.fn(),
          }),
        },
      };

      const coreSetupMock = {
        getStartServices: jest.fn().mockResolvedValue([mockCoreStart, mockPluginsStart]),
      };

      // Mock agent service - must return valid pipeline with at least one processor
      const mockInvokeAgent = jest.fn().mockResolvedValue({
        current_pipeline: { processors: [{ set: { field: 'test', value: true } }] },
        pipeline_generation_results: [],
      });

      const tmForAgent = asTaskManagerPrivate(taskManagerService);
      tmForAgent.agentService = {
        invokeAutomaticImportAgent: mockInvokeAgent,
      };

      const abortController = new AbortController();

      // Create task runner
      const taskRunner = createTaskRunner({
        taskInstance: mockTaskInstance as unknown as ConcreteTaskInstance,
        fakeRequest: {} as unknown as KibanaRequest,
        abortController,
      });

      // Replace runTask to inject our mock core setup
      const tmForRunTask = asTaskManagerPrivate(taskManagerService);
      const originalRunTask = tmForRunTask.runTask;
      tmForRunTask.runTask = jest
        .fn()
        .mockImplementation(
          async (
            taskInstance: unknown,
            core: unknown,
            savedObjectService: unknown,
            request: unknown,
            abortSignal: AbortSignal
          ) => {
            // Call the original runTask but with our mocked core setup
            return originalRunTask.call(
              taskManagerService,
              taskInstance,
              coreSetupMock,
              savedObjectService,
              request,
              abortSignal
            );
          }
        );

      // Run the task
      await taskRunner.run();

      // Verify that updateDataStreamSavedObjectAttributes was called: first to mark
      // the data stream as processing at task start, then to persist the completed result.
      expect(mockUpdateDataStream).toHaveBeenCalledTimes(2);
      expect(mockUpdateDataStream).toHaveBeenNthCalledWith(1, {
        integrationId: 'test-integration',
        dataStreamId: 'test-datastream',
        status: 'processing',
      });
      expect(mockUpdateDataStream).toHaveBeenNthCalledWith(
        2,
        {
          integrationId: 'test-integration',
          dataStreamId: 'test-datastream',
          ingestPipeline: expect.any(Object),
          pipelineDocs: expect.any(Array),
          fieldMapping: expect.any(Array),
          status: 'completed',
        },
        abortController.signal
      );
    });

    it('should mark data stream as failed when task execution errors', async () => {
      const mockUpdateDataStream = jest.fn().mockResolvedValue(undefined);
      const mockGetDataStream = jest.fn().mockResolvedValue({
        attributes: {
          data_stream_id: 'test-datastream',
          integration_id: 'test-integration',
          job_info: { status: 'pending', jobId: 'task-123', jobType: 'autoImport-dataStream-task' },
        },
      });

      const mockSavedObjectService = {
        updateDataStreamSavedObjectAttributes: mockUpdateDataStream,
        getDataStream: mockGetDataStream,
      };

      const taskManagerService = asPrivate(service).taskManagerService as TaskManagerService;
      const tmFailedTest = asTaskManagerPrivate(taskManagerService);
      tmFailedTest.automaticImportSavedObjectService =
        mockSavedObjectService as unknown as AutomaticImportSavedObjectService;

      const registeredTasks = mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0];
      const taskDefinition = registeredTasks['autoImport-dataStream-task'];
      const createTaskRunner = taskDefinition.createTaskRunner;

      const mockTaskInstance = {
        id: 'test-task-id',
        params: {
          integrationId: 'test-integration',
          dataStreamId: 'test-datastream',
          connectorId: 'test-connector',
        },
        state: { task_status: 'pending' },
      };

      const mockCoreStart = {
        elasticsearch: {
          client: {
            asScoped: jest.fn().mockReturnValue({
              asCurrentUser: {},
            }),
          },
        },
      };

      const mockPluginsStart = {
        inference: {
          getChatModel: jest.fn().mockRejectedValue(new Error('Agent invocation failed')),
        },
        fieldsMetadata: {
          getClient: jest.fn().mockResolvedValue({
            find: jest.fn().mockResolvedValue({ toPlain: () => ({}) }),
            getByName: jest.fn(),
          }),
        },
      };

      const coreSetupMock = {
        getStartServices: jest.fn().mockResolvedValue([mockCoreStart, mockPluginsStart]),
      };

      tmFailedTest.agentService = {
        invokeAutomaticImportAgent: jest.fn(),
      };

      const taskRunner = createTaskRunner({
        taskInstance: mockTaskInstance as unknown as ConcreteTaskInstance,
        fakeRequest: {} as unknown as KibanaRequest,
        abortController: new AbortController(),
      });

      const originalRunTask = tmFailedTest.runTask;
      tmFailedTest.runTask = jest
        .fn()
        .mockImplementation(
          async (
            taskInstance: unknown,
            core: unknown,
            savedObjectService: unknown,
            request: unknown,
            abortSignal: AbortSignal
          ) => {
            return originalRunTask.call(
              taskManagerService,
              taskInstance,
              coreSetupMock,
              savedObjectService,
              request,
              abortSignal
            );
          }
        );

      const result = (await taskRunner.run()) as { state: Record<string, unknown>; error: unknown };

      expect(mockUpdateDataStream).toHaveBeenCalledTimes(1);
      expect(mockUpdateDataStream).toHaveBeenCalledWith({
        integrationId: 'test-integration',
        dataStreamId: 'test-datastream',
        status: 'failed',
      });
      expect(result.state).toEqual(expect.objectContaining({ task_status: 'failed' }));
      expect(result.error).toBeDefined();
    });

    it('should throw unrecoverable error for non-recoverable failures (e.g. connector not found)', async () => {
      const mockUpdateDataStream = jest.fn().mockResolvedValue(undefined);

      const mockSavedObjectService = {
        updateDataStreamSavedObjectAttributes: mockUpdateDataStream,
      };

      const taskManagerService = asPrivate(service).taskManagerService as TaskManagerService;
      const tmUnrecoverable = asTaskManagerPrivate(taskManagerService);
      tmUnrecoverable.automaticImportSavedObjectService =
        mockSavedObjectService as unknown as AutomaticImportSavedObjectService;

      const registeredTasks = mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0];
      const taskDefinition = registeredTasks['autoImport-dataStream-task'];
      const createTaskRunner = taskDefinition.createTaskRunner;

      const mockTaskInstance = {
        id: 'test-task-id',
        params: {
          integrationId: 'test-integration',
          dataStreamId: 'test-datastream',
          connectorId: 'invalid-connector',
        },
        state: { task_status: 'pending' },
      };

      const connectorNotFoundError = Object.assign(
        new Error("No connector found for id 'invalid-connector'"),
        { statusCode: 404 }
      );

      const mockCoreStart = {
        elasticsearch: {
          client: {
            asScoped: jest.fn().mockReturnValue({
              asCurrentUser: {},
            }),
          },
        },
      };

      const mockPluginsStart = {
        inference: {
          getChatModel: jest.fn().mockRejectedValue(connectorNotFoundError),
        },
        fieldsMetadata: {
          getClient: jest.fn().mockResolvedValue({
            find: jest.fn().mockResolvedValue({ toPlain: () => ({}) }),
            getByName: jest.fn(),
          }),
        },
      };

      const coreSetupMock = {
        getStartServices: jest.fn().mockResolvedValue([mockCoreStart, mockPluginsStart]),
      };

      tmUnrecoverable.agentService = {
        invokeAutomaticImportAgent: jest.fn(),
      };

      const taskRunner = createTaskRunner({
        taskInstance: mockTaskInstance as unknown as ConcreteTaskInstance,
        fakeRequest: {} as unknown as KibanaRequest,
        abortController: new AbortController(),
      });

      const originalRunTask = tmUnrecoverable.runTask;
      tmUnrecoverable.runTask = jest
        .fn()
        .mockImplementation(
          async (
            taskInstance: unknown,
            core: unknown,
            savedObjectService: unknown,
            request: unknown,
            abortSignal: AbortSignal
          ) => {
            return originalRunTask.call(
              taskManagerService,
              taskInstance,
              coreSetupMock,
              savedObjectService,
              request,
              abortSignal
            );
          }
        );

      await expect(taskRunner.run()).rejects.toThrow('No connector found');

      expect(mockUpdateDataStream).toHaveBeenCalledWith({
        integrationId: 'test-integration',
        dataStreamId: 'test-datastream',
        status: 'failed',
      });
    });
  });
});
