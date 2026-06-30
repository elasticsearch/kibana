/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type {
  ConcreteTaskInstance,
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { AnalyticsServiceStart, ElasticsearchClient } from '@kbn/core/server';
import { OtelTelemetryService } from './otel_telemetry';
import { OtelTelemetryReceiver } from './receiver';
import { OtelTelemetrySender } from './sender';
import type { CompositeBucket } from './receiver';
import { createMockTelemetryConfigProvider } from '../__mocks__';
import {
  TASK_TYPE,
  TASK_ID,
  TASK_INTERVAL,
  TASK_TIMEOUT,
  DEFAULT_OTEL_TELEMETRY_CONFIGURATION,
} from '../constants';
import type { ConfigurationService } from './configuration';

jest.mock('./receiver');
jest.mock('./sender');

const makeBucket = (
  serviceName: string,
  environment: string | null,
  overrides: Partial<{
    doc_count: number;
    sdk_names: string[];
    sdk_languages: string[];
    scope_names: string[];
    has_k8s: number;
    has_container: number;
  }> = {}
): CompositeBucket => {
  const termsBuckets = (values: string[]) => ({
    buckets: values.map((key) => ({ key, doc_count: 1 })),
  });
  const emptyTerms = { buckets: [] };

  return {
    key: { service_name: serviceName, environment },
    doc_count: overrides.doc_count ?? 100,
    sample: {
      sdk_names: termsBuckets(overrides.sdk_names ?? ['opentelemetry']),
      sdk_languages: termsBuckets(overrides.sdk_languages ?? []),
      sdk_versions: emptyTerms,
      distro_names: emptyTerms,
      distro_versions: emptyTerms,
      cloud_providers: emptyTerms,
      cloud_platforms: emptyTerms,
      cloud_regions: emptyTerms,
      cloud_az: emptyTerms,
      host_archs: emptyTerms,
      os_types: emptyTerms,
      os_names: emptyTerms,
      os_versions: emptyTerms,
      os_descriptions: emptyTerms,
      device_manufacturers: emptyTerms,
      device_model_names: emptyTerms,
      browser_platforms: emptyTerms,
      user_agent_originals: emptyTerms,
      runtime_names: emptyTerms,
      runtime_versions: emptyTerms,
      runtime_descriptions: emptyTerms,
      executable_names: emptyTerms,
      webengine_names: emptyTerms,
      webengine_versions: emptyTerms,
      webengine_descriptions: emptyTerms,
      scope_names: termsBuckets(overrides.scope_names ?? []),
      upstream_cluster: emptyTerms,
    },
    has_k8s: { doc_count: overrides.has_k8s ?? 0 },
    has_container: { doc_count: overrides.has_container ?? 0 },
  };
};

const createMockConfigurationService = (): jest.Mocked<ConfigurationService> =>
  ({
    start: jest.fn(),
    stop: jest.fn(),
    getOtelTelemetryConfiguration$: jest
      .fn()
      .mockReturnValue(of(DEFAULT_OTEL_TELEMETRY_CONFIGURATION)),
  } as any);

describe('OtelTelemetryService', () => {
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let service: OtelTelemetryService;
  let taskManager: jest.Mocked<TaskManagerSetupContract>;
  let taskManagerStart: jest.Mocked<TaskManagerStartContract>;
  let analytics: jest.Mocked<AnalyticsServiceStart>;
  let esClient: jest.Mocked<ElasticsearchClient>;
  let receiver: jest.Mocked<OtelTelemetryReceiver>;
  let sender: jest.Mocked<OtelTelemetrySender>;
  let configurationService: jest.Mocked<ConfigurationService>;
  const telemetryConfigProvider = createMockTelemetryConfigProvider();

  beforeEach(() => {
    jest.clearAllMocks();

    logger = loggingSystemMock.createLogger();

    taskManager = {
      registerTaskDefinitions: jest.fn(),
    } as unknown as jest.Mocked<TaskManagerSetupContract>;

    taskManagerStart = {
      ensureScheduled: jest.fn().mockResolvedValue({
        id: TASK_ID,
        schedule: { interval: TASK_INTERVAL },
      }),
    } as unknown as jest.Mocked<TaskManagerStartContract>;

    analytics = {
      reportEvent: jest.fn(),
    } as unknown as jest.Mocked<AnalyticsServiceStart>;

    esClient = {} as jest.Mocked<ElasticsearchClient>;

    receiver = {
      fetchAllSignals: jest.fn(),
    } as unknown as jest.Mocked<OtelTelemetryReceiver>;

    sender = {
      report: jest.fn(),
    } as unknown as jest.Mocked<OtelTelemetrySender>;

    (OtelTelemetryReceiver as jest.Mock).mockImplementation(() => receiver);
    (OtelTelemetrySender as jest.Mock).mockImplementation(() => sender);

    configurationService = createMockConfigurationService();
    service = new OtelTelemetryService(logger, configurationService);
  });

  describe('setup', () => {
    it('should register task definitions', () => {
      service.setup(taskManager);

      expect(taskManager.registerTaskDefinitions).toHaveBeenCalledWith({
        [TASK_TYPE]: expect.objectContaining({
          title: 'OTel Telemetry Collection - Per Service Task',
          timeout: TASK_TIMEOUT,
          maxAttempts: 1,
          createTaskRunner: expect.any(Function),
        }),
      });
    });
  });

  describe('start', () => {
    it('should initialize receiver and sender', () => {
      service.setup(taskManager);
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);

      expect(OtelTelemetryReceiver).toHaveBeenCalledWith(expect.any(Object), esClient);
      expect(OtelTelemetrySender).toHaveBeenCalledWith(expect.any(Object), analytics);
    });

    it('should schedule the task', async () => {
      service.setup(taskManager);
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(taskManagerStart.ensureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          id: TASK_ID,
          taskType: TASK_TYPE,
          schedule: { interval: TASK_INTERVAL },
          scope: ['otelTelemetryCollection'],
        })
      );
    });

    it('should subscribe to CDN configuration', () => {
      service.setup(taskManager);
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);

      expect(configurationService.getOtelTelemetryConfiguration$).toHaveBeenCalled();
    });

    it('should handle task scheduling errors', async () => {
      const error = new Error('Failed to schedule');
      taskManagerStart.ensureScheduled.mockRejectedValue(error);

      service.setup(taskManager);
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(logger.error).toHaveBeenCalledWith('Failed to schedule OTel per-service task', {
        error,
      });
    });
  });

  describe('task runner', () => {
    let taskRunner: { run: () => Promise<unknown> };
    let taskAbortController: AbortController;

    beforeEach(() => {
      service.setup(taskManager);

      const taskDef = taskManager.registerTaskDefinitions.mock.calls[0][0][TASK_TYPE];
      const taskInstance = { state: {} } as unknown as ConcreteTaskInstance;
      taskAbortController = new AbortController();
      taskRunner = taskDef.createTaskRunner(
        taskManagerMock.createRunContext({ taskInstance, abortController: taskAbortController })
      );
    });

    it('should call publishOtelPerServiceStats when opted in', async () => {
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);

      receiver.fetchAllSignals.mockResolvedValue({ traces: [], metrics: [], logs: [] });

      const result = await taskRunner.run();

      expect(receiver.fetchAllSignals).toHaveBeenCalledWith(
        DEFAULT_OTEL_TELEMETRY_CONFIGURATION,
        expect.any(AbortSignal)
      );
      expect(result).toEqual({ state: {} });
    });

    it('should skip when telemetry is opted out', async () => {
      const optedOutProvider = createMockTelemetryConfigProvider(false);
      service.start(taskManagerStart, analytics, esClient, optedOutProvider);

      const result = await taskRunner.run();

      expect(receiver.fetchAllSignals).not.toHaveBeenCalled();
      expect(result).toEqual({ state: {} });
    });

    it('should skip collection when disabled via CDN config (kill switch)', async () => {
      configurationService.getOtelTelemetryConfiguration$.mockReturnValue(
        of({ ...DEFAULT_OTEL_TELEMETRY_CONFIGURATION, enabled: false })
      );
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);

      await taskRunner.run();

      expect(receiver.fetchAllSignals).not.toHaveBeenCalled();
      expect(sender.report).not.toHaveBeenCalled();
    });

    it('should pass abort signal to receiver and respond to external abort', async () => {
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);

      receiver.fetchAllSignals.mockImplementation(async (_config, abortSignal) => {
        expect(abortSignal).toBeDefined();
        expect(abortSignal!.aborted).toBe(false);

        taskAbortController.abort();

        expect(abortSignal!.aborted).toBe(true);
        return { traces: [], metrics: [], logs: [] };
      });

      await taskRunner.run();
    });
  });

  describe('per-signal reporting', () => {
    beforeEach(() => {
      service.setup(taskManager);
      service.start(taskManagerStart, analytics, esClient, telemetryConfigProvider);
    });

    it('should send one event per signal with non-empty buckets', async () => {
      receiver.fetchAllSignals.mockResolvedValue({
        traces: [makeBucket('checkout', null, { doc_count: 618 })],
        metrics: [makeBucket('checkout', null, { doc_count: 1111 })],
        logs: [makeBucket('checkout', null, { doc_count: 514 })],
      });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      expect(sender.report).toHaveBeenCalledTimes(3);

      const tracesResults = sender.report.mock.calls[0][0];
      expect(tracesResults).toHaveLength(1);
      expect(tracesResults[0].signal).toBe('traces');
      expect(tracesResults[0].doc_count).toBe(618);

      const metricsResults = sender.report.mock.calls[1][0];
      expect(metricsResults[0].signal).toBe('metrics');
      expect(metricsResults[0].doc_count).toBe(1111);

      const logsResults = sender.report.mock.calls[2][0];
      expect(logsResults[0].signal).toBe('logs');
      expect(logsResults[0].doc_count).toBe(514);
    });

    it('should skip signals with no buckets', async () => {
      receiver.fetchAllSignals.mockResolvedValue({
        traces: [],
        metrics: [makeBucket('kafka', null, { doc_count: 1592 })],
        logs: [makeBucket('kafka', null, { doc_count: 2072 })],
      });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      expect(sender.report).toHaveBeenCalledTimes(2);
      expect(sender.report.mock.calls[0][0][0].signal).toBe('metrics');
      expect(sender.report.mock.calls[1][0][0].signal).toBe('logs');
    });

    it('should extract array values from term buckets', async () => {
      receiver.fetchAllSignals.mockResolvedValue({
        traces: [
          makeBucket('svc', null, {
            sdk_names: ['opentelemetry'],
            sdk_languages: ['go'],
            scope_names: ['otelgrpc', 'otelhttp'],
          }),
        ],
        metrics: [],
        logs: [],
      });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      const result = sender.report.mock.calls[0][0][0];
      expect(result.sdk_names).toEqual(['opentelemetry']);
      expect(result.sdk_languages).toEqual(['go']);
      expect(result.scope_names).toEqual(['otelgrpc', 'otelhttp']);
    });

    it('should convert boolean filter aggs correctly', async () => {
      receiver.fetchAllSignals.mockResolvedValue({
        traces: [makeBucket('svc', null, { has_k8s: 3, has_container: 0 })],
        metrics: [],
        logs: [],
      });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      const result = sender.report.mock.calls[0][0][0];
      expect(result.has_k8s).toBe(true);
      expect(result.has_container).toBe(false);
    });

    it('should handle multiple services per signal', async () => {
      receiver.fetchAllSignals.mockResolvedValue({
        traces: [
          makeBucket('svc-a', 'prod', { doc_count: 100 }),
          makeBucket('svc-b', 'staging', { doc_count: 50 }),
        ],
        metrics: [],
        logs: [],
      });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      const results = sender.report.mock.calls[0][0];
      expect(results).toHaveLength(2);
      expect(results[0].environment).toBe('prod');
      expect(results[0].doc_count).toBe(100);
      expect(results[1].environment).toBe('staging');
      expect(results[1].doc_count).toBe(50);
    });

    it('should coerce null environment to empty string', async () => {
      receiver.fetchAllSignals.mockResolvedValue({
        traces: [makeBucket('svc', null, { doc_count: 10 })],
        metrics: [],
        logs: [],
      });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      expect(sender.report.mock.calls[0][0][0].environment).toBe('');
    });

    it('should use raw service name as service_id', async () => {
      receiver.fetchAllSignals.mockResolvedValue({
        traces: [makeBucket('my-service', null, { doc_count: 1 })],
        metrics: [],
        logs: [],
      });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      expect(sender.report.mock.calls[0][0][0].service_id).toBe('my-service');
    });

    it('should not report when all signals are empty', async () => {
      receiver.fetchAllSignals.mockResolvedValue({ traces: [], metrics: [], logs: [] });

      // eslint-disable-next-line dot-notation
      await service['publishOtelPerServiceStats']();

      expect(sender.report).not.toHaveBeenCalled();
    });
  });
});
