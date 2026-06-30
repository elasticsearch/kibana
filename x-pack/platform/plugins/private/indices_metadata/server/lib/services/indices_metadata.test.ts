/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type {
  ConcreteTaskInstance,
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { AnalyticsServiceStart, ElasticsearchClient } from '@kbn/core/server';
import type {
  DataStream,
  IndicesMetadataConfiguration,
  IndexSettings,
  IndexStats,
  IndexTemplateInfo,
} from './indices_metadata.types';

import { IndicesMetadataService } from './indices_metadata';
import { MetadataReceiver } from './receiver';
import { MetadataSender } from './sender';
import type { ConfigurationService } from './configuration';
import {
  DATA_STREAM_EVENT,
  ILM_POLICY_EVENT,
  ILM_STATS_EVENT,
  INDEX_SETTINGS_EVENT,
  INDEX_STATS_EVENT,
  INDEX_TEMPLATES_EVENT,
} from '../ebt/events';
import { createMockTelemetryConfigProvider } from '../__mocks__';

jest.mock('./receiver');
jest.mock('./sender');

describe('Indices Metadata - IndicesMetadataService', () => {
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let configurationService: jest.Mocked<ConfigurationService>;
  let service: IndicesMetadataService;
  let taskManager: jest.Mocked<TaskManagerSetupContract>;
  let taskManagerStart: jest.Mocked<TaskManagerStartContract>;
  let analytics: jest.Mocked<AnalyticsServiceStart>;
  let esClient: jest.Mocked<ElasticsearchClient>;
  let receiver: jest.Mocked<MetadataReceiver>;
  let sender: jest.Mocked<MetadataSender>;
  let subscription: jest.Mocked<Subscription>;
  const telemetryConfigProvider = createMockTelemetryConfigProvider();
  const mockConfiguration: IndicesMetadataConfiguration = {
    indices_threshold: 100,
    datastreams_threshold: 50,
    indices_settings_threshold: 75,
    index_query_size: 10,
    ilm_stats_query_size: 20,
    ilm_policy_query_size: 30,
  };

  const mockIndexSettings: IndexSettings[] = [
    {
      index_name: 'test-index-1',
      default_pipeline: 'default',
      final_pipeline: 'final',
      index_mode: 'standard',
      source_mode: 'stored',
    },
  ];

  const mockDataStreams: DataStream[] = [
    {
      datastream_name: 'test-datastream',
      dsl: {
        enabled: true,
        data_retention: '30d',
      },
      indices: [{ index_name: 'test-index-1', ilm_policy: 'policy1' }],
    },
  ];

  const mockIndexTemplates: IndexTemplateInfo[] = [
    {
      template_name: 'test-template',
      index_mode: 'standard',
      package_name: 'test-package',
      datastream: true,
      managed_by: 'elasticsearch',
      beat: undefined,
      is_managed: true,
      composed_of: ['component1'],
      source_enabled: true,
      source_includes: [],
      source_excludes: [],
    },
  ];

  const mockIndexStats: IndexStats[] = [
    {
      index_name: 'test-index-1',
      query_total: 100,
      query_time_in_millis: 1000,
      docs_count: 500,
      docs_deleted: 10,
      docs_total_size_in_bytes: 1024000,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    logger = loggingSystemMock.createLogger();
    configurationService = {
      getIndicesMetadataConfiguration$: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<ConfigurationService>;

    taskManager = {
      registerTaskDefinitions: jest.fn(),
    } as unknown as jest.Mocked<TaskManagerSetupContract>;

    taskManagerStart = {
      ensureScheduled: jest.fn(),
    } as unknown as jest.Mocked<TaskManagerStartContract>;

    analytics = {
      reportEvent: jest.fn(),
    } as unknown as jest.Mocked<AnalyticsServiceStart>;

    esClient = {} as jest.Mocked<ElasticsearchClient>;

    receiver = {
      getIndices: jest.fn(),
      getDataStreams: jest.fn(),
      getIndexTemplatesStats: jest.fn(),
      getIndicesStats: jest.fn(),
      isIlmStatsAvailable: jest.fn(),
      getIlmsStats: jest.fn(),
      getIlmsPolicies: jest.fn(),
    } as unknown as jest.Mocked<MetadataReceiver>;

    sender = {
      reportEBT: jest.fn(),
    } as unknown as jest.Mocked<MetadataSender>;

    subscription = {
      unsubscribe: jest.fn(),
    } as unknown as jest.Mocked<Subscription>;

    (MetadataReceiver as jest.Mock).mockImplementation(() => receiver);
    (MetadataSender as jest.Mock).mockImplementation(() => sender);

    service = new IndicesMetadataService(logger, configurationService);
  });

  describe('constructor', () => {
    it('should create service with proper logger namespace', () => {
      expect(logger.get).toHaveBeenCalledWith('IndicesMetadataService');
    });
  });

  describe('setup', () => {
    it('should register task definitions', () => {
      service.setup(taskManager);

      expect(taskManager.registerTaskDefinitions).toHaveBeenCalledWith({
        'IndicesMetadata:IndicesMetadataTask': expect.objectContaining({
          title: 'Metrics Data Access - Indices Metadata Task',
          description: 'This task periodically pushes indices metadata to the telemetry service.',
          maxAttempts: 1,
          createTaskRunner: expect.any(Function),
        }),
      });
    });

    it('should log debug messages', () => {
      service.setup(taskManager);

      expect(logger.debug).toHaveBeenCalledWith('Setting up indices metadata service');
      expect(logger.debug).toHaveBeenCalledWith('About to register task', {
        task: 'indices-metadata:indices-metadata-task:1.0.0',
      });
      expect(logger.debug).toHaveBeenCalledWith('Task registered', {
        task: 'indices-metadata:indices-metadata-task:1.0.0',
        type: 'IndicesMetadata:IndicesMetadataTask',
      });
    });
  });

  describe('start', () => {
    beforeEach(() => {
      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: jest.fn().mockReturnValue(subscription),
      } as any);

      taskManagerStart.ensureScheduled.mockResolvedValue({
        id: 'test-task',
        schedule: { interval: '24h' },
      } as any);
    });

    it('should initialize receiver and sender', () => {
      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);

      expect(MetadataReceiver).toHaveBeenCalledWith(expect.any(Object), esClient, false);
      expect(MetadataSender).toHaveBeenCalledWith(expect.any(Object), analytics);
    });

    it('should subscribe to configuration updates', () => {
      const mockSubscribe = jest.fn().mockReturnValue(subscription);
      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: mockSubscribe,
      } as any);

      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);

      expect(configurationService.getIndicesMetadataConfiguration$).toHaveBeenCalled();
      expect(mockSubscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should schedule indices metadata task', async () => {
      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(taskManagerStart.ensureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'indices-metadata:indices-metadata-task:1.0.0',
          taskType: 'IndicesMetadata:IndicesMetadataTask',
          params: {},
          state: {},
          scope: ['uptime'],
        })
      );
    });

    it('should handle task scheduling errors', async () => {
      const error = new Error('Failed to schedule task');
      taskManagerStart.ensureScheduled.mockRejectedValue(error);

      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(logger.error).toHaveBeenCalledWith('Failed to schedule Indices Metadata Task', {
        error,
      });
    });

    it('should handle configuration updates', () => {
      const mockSubscribe = jest.fn();
      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: mockSubscribe,
      } as any);

      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);

      const configurationCallback = mockSubscribe.mock.calls[0][0];
      configurationCallback(mockConfiguration);

      expect(logger.debug).toHaveBeenCalledWith('Indices metadata configuration updated', {
        configuration: mockConfiguration,
      });
    });
  });

  describe('stop', () => {
    it('should unsubscribe from configuration updates', () => {
      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: jest.fn().mockReturnValue(subscription),
      } as any);

      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);
      service.stop();

      expect(subscription.unsubscribe).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Stopping indices metadata service');
    });

    it('should handle stop when subscription is undefined', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('publishIndicesMetadata', () => {
    beforeEach(() => {
      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: jest.fn().mockImplementation((callback) => {
          callback(mockConfiguration);
          return subscription;
        }),
      } as any);

      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);

      receiver.getIndices.mockResolvedValue(mockIndexSettings);
      receiver.getDataStreams.mockResolvedValue(mockDataStreams);
      receiver.getIndexTemplatesStats.mockResolvedValue(mockIndexTemplates);
      receiver.getIndicesStats.mockImplementation(async function* () {
        yield* mockIndexStats;
      });
      receiver.isIlmStatsAvailable.mockResolvedValue(true);
      receiver.getIlmsStats.mockImplementation(async function* () {
        yield { index_name: 'test-index-1', phase: 'hot', age: '1d', policy_name: 'policy1' };
      });
      receiver.getIlmsPolicies.mockImplementation(async function* () {
        yield { policy_name: 'policy1', modified_date: '2023-01-01', phases: {} };
      });
    });

    it('should successfully publish all metadata types', async () => {
      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(receiver.getIndices).toHaveBeenCalled();
      expect(receiver.getDataStreams).toHaveBeenCalled();
      expect(receiver.getIndexTemplatesStats).toHaveBeenCalled();
      expect(receiver.getIndicesStats).toHaveBeenCalledWith(['test-index-1'], 10);
      expect(receiver.isIlmStatsAvailable).toHaveBeenCalled();
      expect(receiver.getIlmsStats).toHaveBeenCalledWith(['test-index-1']);
      expect(receiver.getIlmsPolicies).toHaveBeenCalledWith(['policy1'], 30);

      expect(sender.reportEBT).toHaveBeenCalledTimes(6);
    });

    it('should skip publication when configuration is undefined', async () => {
      service['configuration'] = undefined; // eslint-disable-line dot-notation

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(receiver.getIndices).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Index query size is 0, skipping indices metadata publish'
      );
    });

    it('should skip publication when index_query_size is 0', async () => {
      service['configuration'] = { ...mockConfiguration, index_query_size: 0 }; // eslint-disable-line dot-notation

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(receiver.getIndices).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Index query size is 0, skipping indices metadata publish'
      );
    });

    it('should handle ILM stats unavailable', async () => {
      receiver.isIlmStatsAvailable.mockResolvedValue(false);

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(receiver.getIlmsStats).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('ILM explain API is not available');
    });

    it('should apply thresholds correctly', async () => {
      // eslint-disable-next-line dot-notation
      service['configuration'] = {
        ...mockConfiguration,
        datastreams_threshold: 1,
        indices_settings_threshold: 1,
        indices_threshold: 1,
      };

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(receiver.getIndicesStats).toHaveBeenCalledWith(['test-index-1'], 10);
      expect(receiver.getIlmsStats).toHaveBeenCalledWith(['test-index-1']);
    });

    it('should publish datastreams with DSL through full metadata flow', async () => {
      const datastreamsWithDsl: DataStream[] = [
        {
          datastream_name: 'logs-test',
          dsl: {
            enabled: true,
            data_retention: '90d',
          },
          indices: [
            {
              index_name: '.ds-logs-test-000001',
              ilm_policy: 'logs-policy',
            },
          ],
        },
      ];

      receiver.getIndices.mockResolvedValue(mockIndexSettings);
      receiver.getDataStreams.mockResolvedValue(datastreamsWithDsl);
      receiver.getIndexTemplatesStats.mockResolvedValue(mockIndexTemplates);
      receiver.getIndicesStats.mockImplementation(async function* () {
        yield* mockIndexStats;
      });
      receiver.isIlmStatsAvailable.mockResolvedValue(true);
      receiver.getIlmsStats.mockImplementation(async function* () {
        yield {
          index_name: '.ds-logs-test-000001',
          phase: 'hot',
          age: '1d',
          policy_name: 'logs-policy',
        };
      });
      receiver.getIlmsPolicies.mockImplementation(async function* () {
        yield { policy_name: 'logs-policy', modified_date: '2023-01-01', phases: {} };
      });

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(sender.reportEBT).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: DATA_STREAM_EVENT.eventType }),
        {
          items: expect.arrayContaining([
            expect.objectContaining({
              datastream_name: 'logs-test',
              dsl: {
                enabled: true,
                data_retention: '90d',
              },
            }),
          ]),
        }
      );
    });

    it('should throw error when not initialized', async () => {
      const uninitializedService = new IndicesMetadataService(logger, configurationService);

      // eslint-disable-next-line dot-notation
      await expect(uninitializedService['publishIndicesMetadata']()).rejects.toThrow(
        'Indices metadata service not initialized'
      );
    });
  });

  describe('task runner', () => {
    let taskRunner: any;
    let taskInstance: ConcreteTaskInstance;

    beforeEach(() => {
      service.setup(taskManager);

      const taskDefinition =
        taskManager.registerTaskDefinitions.mock.calls[0][0]['IndicesMetadata:IndicesMetadataTask'];
      taskInstance = { state: { lastRun: '2023-01-01' } } as unknown as ConcreteTaskInstance;
      taskRunner = taskDefinition.createTaskRunner(
        taskManagerMock.createRunContext({ taskInstance })
      );

      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: jest.fn().mockImplementation((callback) => {
          callback(mockConfiguration);
          return subscription;
        }),
      } as any);
    });

    it('should run publishIndicesMetadata and return state', async () => {
      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);
      jest.spyOn(service as any, 'publishIndicesMetadata').mockResolvedValue(undefined);

      const result = await taskRunner.run();

      expect(service['publishIndicesMetadata']).toHaveBeenCalled(); // eslint-disable-line dot-notation
      expect(result).toEqual({ state: taskInstance.state });
    });

    it('should skip publishIndicesMetadata when telemetry is opted out', async () => {
      const optedOutProvider = createMockTelemetryConfigProvider(false);
      service.start(taskManagerStart, analytics, esClient, false, optedOutProvider);
      jest.spyOn(service as any, 'publishIndicesMetadata').mockResolvedValue(undefined);

      const result = await taskRunner.run();

      expect(service['publishIndicesMetadata']).not.toHaveBeenCalled(); // eslint-disable-line dot-notation
      expect(logger.debug).toHaveBeenCalledWith('Telemetry opted out, skipping task run');
      expect(result).toEqual({ state: taskInstance.state });
    });

    it('should handle task cancellation', async () => {
      await taskRunner.cancel();

      expect(logger.warn).toHaveBeenCalledWith('Task timed out', {
        task: 'indices-metadata:indices-metadata-task:1.0.0',
      });
    });
  });

  describe('publish EBT', () => {
    beforeEach(() => {
      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: jest.fn().mockImplementation((callback) => {
          callback(mockConfiguration);
          return subscription;
        }),
      } as any);

      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);
    });

    describe('publishDatastreamsStats', () => {
      it('should publish datastreams and return count', () => {
        const result = service['publishDatastreamsStats'](mockDataStreams); // eslint-disable-line dot-notation

        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: DATA_STREAM_EVENT.eventType }),
          { items: mockDataStreams }
        );
        expect(result).toBe(1);
        expect(logger.debug).toHaveBeenCalledWith('Data streams events sent', { count: 1 });
      });

      it('should publish datastreams with DSL enabled and retention', () => {
        const datastreamsWithDsl: DataStream[] = [
          {
            datastream_name: 'logs-app-prod',
            dsl: {
              enabled: true,
              data_retention: '7d',
            },
            indices: [{ index_name: '.ds-logs-app-prod-000001' }],
          },
          {
            datastream_name: 'metrics-system',
            dsl: {
              enabled: false,
              data_retention: undefined,
            },
            indices: [{ index_name: '.ds-metrics-system-000001' }],
          },
        ];

        const result = service['publishDatastreamsStats'](datastreamsWithDsl); // eslint-disable-line dot-notation

        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: DATA_STREAM_EVENT.eventType }),
          {
            items: [
              expect.objectContaining({
                datastream_name: 'logs-app-prod',
                dsl: {
                  enabled: true,
                  data_retention: '7d',
                },
              }),
              expect.objectContaining({
                datastream_name: 'metrics-system',
                dsl: {
                  enabled: false,
                  data_retention: undefined,
                },
              }),
            ],
          }
        );
        expect(result).toBe(2);
      });

      it('should handle datastreams without DSL field', () => {
        const datastreamsWithoutDsl: DataStream[] = [
          {
            datastream_name: 'legacy-datastream',
            indices: [{ index_name: '.ds-legacy-000001' }],
          },
        ];

        const result = service['publishDatastreamsStats'](datastreamsWithoutDsl); // eslint-disable-line dot-notation

        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: DATA_STREAM_EVENT.eventType }),
          {
            items: [
              {
                datastream_name: 'legacy-datastream',
                indices: [{ index_name: '.ds-legacy-000001' }],
              },
            ],
          }
        );
        expect(result).toBe(1);
      });

      it('should publish mixed DSL configurations', () => {
        const mixedDatastreams: DataStream[] = [
          {
            datastream_name: 'with-retention',
            dsl: { enabled: true, data_retention: '365d' },
            indices: [],
          },
          {
            datastream_name: 'enabled-no-retention',
            dsl: { enabled: true, data_retention: undefined },
            indices: [],
          },
          {
            datastream_name: 'disabled',
            dsl: { enabled: false, data_retention: undefined },
            indices: [],
          },
        ];

        const result = service['publishDatastreamsStats'](mixedDatastreams); // eslint-disable-line dot-notation

        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: DATA_STREAM_EVENT.eventType }),
          {
            items: expect.arrayContaining([
              expect.objectContaining({
                dsl: { enabled: true, data_retention: '365d' },
              }),
              expect.objectContaining({
                dsl: { enabled: true, data_retention: undefined },
              }),
              expect.objectContaining({
                dsl: { enabled: false, data_retention: undefined },
              }),
            ]),
          }
        );
        expect(result).toBe(3);
      });
    });

    describe('publishIndicesSettings', () => {
      it('should publish indices settings and return count', () => {
        const result = service['publishIndicesSettings'](mockIndexSettings); // eslint-disable-line dot-notation

        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: INDEX_SETTINGS_EVENT.eventType }),
          { items: mockIndexSettings }
        );
        expect(result).toBe(1);
        expect(logger.debug).toHaveBeenCalledWith('Indices settings sent', { count: 1 });
      });
    });

    describe('publishIndicesStats', () => {
      it('should publish indices stats and return count', async () => {
        receiver.getIndicesStats.mockImplementation(async function* () {
          yield* mockIndexStats;
        });

        const result = await service['publishIndicesStats'](['test-index-1']); // eslint-disable-line dot-notation

        expect(receiver.getIndicesStats).toHaveBeenCalledWith(['test-index-1'], 10);
        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: INDEX_STATS_EVENT.eventType }),
          { items: mockIndexStats }
        );
        expect(result).toBe(1);
        expect(logger.debug).toHaveBeenCalledWith('Indices stats sent', { count: 1 });
      });

      it('should return 0 when configuration is undefined', async () => {
        service['configuration'] = undefined; // eslint-disable-line dot-notation

        const result = await service['publishIndicesStats'](['test-index-1']); // eslint-disable-line dot-notation

        expect(result).toBe(0);
        expect(receiver.getIndicesStats).not.toHaveBeenCalled();
      });
    });

    describe('publishIlmStats', () => {
      it('should publish ILM stats and return policy names', async () => {
        const mockIlmStats = [
          { index_name: 'test-index-1', phase: 'hot', age: '1d', policy_name: 'policy1' },
          { index_name: 'test-index-2', phase: 'warm', age: '7d', policy_name: 'policy2' },
        ];

        receiver.getIlmsStats.mockImplementation(async function* () {
          yield* mockIlmStats;
        });

        const result = await service['publishIlmStats'](['test-index-1', 'test-index-2']); // eslint-disable-line dot-notation

        expect(receiver.getIlmsStats).toHaveBeenCalledWith(['test-index-1', 'test-index-2']);
        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: ILM_STATS_EVENT.eventType }),
          { items: mockIlmStats }
        );
        expect(result).toEqual(new Set(['policy1', 'policy2']));
        expect(result.size).toBe(2);
      });

      it('should skip stats without policy names', async () => {
        const mockIlmStats = [
          { index_name: 'test-index-1', phase: 'hot', age: '1d', policy_name: 'policy1' },
          { index_name: 'test-index-2', phase: 'hot', age: '1d', policy_name: undefined },
        ];

        receiver.getIlmsStats.mockImplementation(async function* () {
          yield* mockIlmStats;
        });

        const result = await service['publishIlmStats'](['test-index-1', 'test-index-2']); // eslint-disable-line dot-notation

        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: ILM_STATS_EVENT.eventType }),
          { items: [mockIlmStats[0]] }
        );
        expect(result).toEqual(new Set(['policy1']));
        expect(result.size).toBe(1);
      });
    });

    describe('publishIlmPolicies', () => {
      it('should publish ILM policies and return count', async () => {
        const mockPolicies = [{ policy_name: 'policy1', modified_date: '2023-01-01', phases: {} }];

        receiver.getIlmsPolicies.mockImplementation(async function* () {
          yield* mockPolicies;
        });

        const result = await service['publishIlmPolicies'](new Set(['policy1'])); // eslint-disable-line dot-notation

        expect(receiver.getIlmsPolicies).toHaveBeenCalledWith(['policy1'], 30);
        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: ILM_POLICY_EVENT.eventType }),
          { items: mockPolicies }
        );
        expect(result).toBe(1);
      });

      it('should return 0 when configuration is undefined', async () => {
        service['configuration'] = undefined; // eslint-disable-line dot-notation

        const result = await service['publishIlmPolicies'](new Set(['policy1'])); // eslint-disable-line dot-notation

        expect(result).toBe(0);
        expect(receiver.getIlmsPolicies).not.toHaveBeenCalled();
      });
    });

    describe('publishIndexTemplatesStats', () => {
      it('should publish index templates stats and return count', async () => {
        const result = await service['publishIndexTemplatesStats'](mockIndexTemplates); // eslint-disable-line dot-notation

        expect(sender.reportEBT).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: INDEX_TEMPLATES_EVENT.eventType }),
          { items: mockIndexTemplates }
        );
        expect(result).toBe(1);
        expect(logger.debug).toHaveBeenCalledWith('Index templates stats sent', { count: 1 });
      });
    });
  });

  describe('error scenarios', () => {
    beforeEach(() => {
      configurationService.getIndicesMetadataConfiguration$.mockReturnValue({
        subscribe: jest.fn().mockImplementation((callback) => {
          callback(mockConfiguration);
          return subscription;
        }),
      } as any);

      service.start(taskManagerStart, analytics, esClient, false, telemetryConfigProvider);
    });

    it('should handle receiver errors during publishIndicesMetadata', async () => {
      const error = new Error('Elasticsearch error');
      receiver.getIndices.mockRejectedValue(error);
      receiver.getDataStreams.mockResolvedValue(mockDataStreams);
      receiver.getIndexTemplatesStats.mockResolvedValue(mockIndexTemplates);

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(logger.error).toHaveBeenCalledWith('Error fetching indices metadata', { error });
      expect(logger.debug).toHaveBeenCalledWith(
        'Skipping indices metadata publish due to fetch errors'
      );
      expect(sender.reportEBT).not.toHaveBeenCalled();
    });

    it('should handle partial receiver errors during publishIndicesMetadata', async () => {
      const error = new Error('DataStream error');
      receiver.getIndices.mockResolvedValue(mockIndexSettings);
      receiver.getDataStreams.mockRejectedValue(error);
      receiver.getIndexTemplatesStats.mockResolvedValue(mockIndexTemplates);

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(logger.error).toHaveBeenCalledWith('Error fetching indices metadata', { error });
      expect(logger.debug).toHaveBeenCalledWith(
        'Skipping indices metadata publish due to fetch errors'
      );
      expect(sender.reportEBT).not.toHaveBeenCalled();
    });

    it('should handle all receiver methods failing during publishIndicesMetadata', async () => {
      const indicesError = new Error('Indices error');
      const dataStreamError = new Error('DataStream error');
      const templatesError = new Error('Templates error');

      receiver.getIndices.mockRejectedValue(indicesError);
      receiver.getDataStreams.mockRejectedValue(dataStreamError);
      receiver.getIndexTemplatesStats.mockRejectedValue(templatesError);

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(logger.error).toHaveBeenCalledWith('Error fetching indices metadata', {
        error: indicesError,
      });
      expect(logger.debug).toHaveBeenCalledWith(
        'Skipping indices metadata publish due to fetch errors'
      );
      expect(sender.reportEBT).not.toHaveBeenCalled();
    });

    it('should continue processing when receiver methods return empty results', async () => {
      receiver.getIndices.mockResolvedValue([]);
      receiver.getDataStreams.mockResolvedValue([]);
      receiver.getIndexTemplatesStats.mockResolvedValue([]);
      receiver.getIndicesStats.mockImplementation(async function* () {
        // yield nothing
      });
      receiver.isIlmStatsAvailable.mockResolvedValue(false);
      receiver.getIlmsPolicies.mockImplementation(async function* () {
        // yield nothing
      });

      await service['publishIndicesMetadata'](); // eslint-disable-line dot-notation

      expect(receiver.getIndices).toHaveBeenCalled();
      expect(receiver.getDataStreams).toHaveBeenCalled();
      expect(receiver.getIndexTemplatesStats).toHaveBeenCalled();
      expect(sender.reportEBT).toHaveBeenCalledTimes(5); // datastreams, indices settings, indices stats, ILM policies (empty), templates
      expect(logger.debug).toHaveBeenCalledWith('ILM explain API is not available');
    });

    it('should handle sender errors during publishDatastreamsStats', () => {
      const error = new Error('Analytics error');
      sender.reportEBT.mockImplementation(() => {
        throw error;
      });

      expect(() => service['publishDatastreamsStats'](mockDataStreams)).toThrow('Analytics error'); // eslint-disable-line dot-notation
    });
  });
});
