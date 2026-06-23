/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TaskManagerPlugin } from './plugin';
import { KibanaDiscoveryService } from './kibana_discovery_service';

import { coreMock } from '@kbn/core/server/mocks';
import { ApiKeyType, type TaskManagerConfig } from './config';
import { cloudMock } from '@kbn/cloud-plugin/public/mocks';
import { taskPollingLifecycleMock } from './polling_lifecycle.mock';
import { TaskPollingLifecycle } from './polling_lifecycle';
import type { TaskPollingLifecycle as TaskPollingLifecycleClass } from './polling_lifecycle';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';

let mockTaskPollingLifecycle = taskPollingLifecycleMock.create({});
jest.mock('./polling_lifecycle', () => {
  return {
    TaskPollingLifecycle: jest.fn().mockImplementation(() => {
      return mockTaskPollingLifecycle;
    }),
  };
});

const deleteCurrentNodeSpy = jest.spyOn(KibanaDiscoveryService.prototype, 'deleteCurrentNode');
const discoveryIsStarted = jest.spyOn(KibanaDiscoveryService.prototype, 'isStarted');

const coreStart = coreMock.createStart();
const pluginInitializerContextParams = {
  max_attempts: 9,
  poll_interval: 3000,
  version_conflict_threshold: 80,
  invalidate_api_key_task: {
    interval: '5m',
    removalDelay: '1h',
  },
  request_capacity: 1000,
  allow_reading_invalid_state: false,
  discovery: {
    active_nodes_lookback: '30s',
    interval: 10000,
  },
  kibanas_per_partition: 2,
  monitored_aggregated_stats_refresh_rate: 5000,
  monitored_stats_health_verbose_log: {
    enabled: false,
    level: 'debug' as const,
    warn_delayed_task_start_in_seconds: 60,
  },
  monitored_stats_required_freshness: 5000,
  monitored_stats_running_average_window: 50,
  monitored_task_execution_thresholds: {
    default: {
      error_threshold: 90,
      warn_threshold: 80,
    },
    custom: {},
  },
  unsafe: {
    exclude_task_types: [],
    authenticate_background_task_utilization: true,
  },
  event_loop_delay: {
    monitor: true,
    warn_threshold: 5000,
  },
  worker_utilization_running_average_window: 5,
  metrics_reset_interval: 3000,
  claim_strategy: 'update_by_query',
  request_timeouts: {
    update_by_query: 1000,
  },
  auto_calculate_default_ech_capacity: false,
  api_key_type: ApiKeyType.ES,
  grant_uiam_api_keys: false,
};

describe('TaskManagerPlugin', () => {
  beforeEach(() => {
    mockTaskPollingLifecycle = taskPollingLifecycleMock.create({});
    (TaskPollingLifecycle as jest.Mock<TaskPollingLifecycleClass>).mockClear();
  });

  describe('setup', () => {
    test('throws if no valid UUID is available', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>(
        pluginInitializerContextParams
      );

      pluginInitializerContext.env.instanceUuid = '';

      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      expect(() =>
        taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined })
      ).toThrow(
        new Error(`TaskManager is unable to start as Kibana has no valid UUID assigned to it.`)
      );
    });

    test('it logs a warning when the unsafe `exclude_task_types` config is used', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>({
        ...pluginInitializerContextParams,
        unsafe: {
          exclude_task_types: ['*'],
          authenticate_background_task_utilization: true,
        },
      });

      const logger = pluginInitializerContext.logger.get();
      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined });
      expect((logger.warn as jest.Mock).mock.calls.length).toBe(1);
      expect((logger.warn as jest.Mock).mock.calls[0][0]).toBe(
        'Excluding task types from execution: *'
      );
    });

    test('it logs a warning when the unsafe `authenticate_background_task_utilization` config is set to false', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>({
        ...pluginInitializerContextParams,
        unsafe: {
          exclude_task_types: [],
          authenticate_background_task_utilization: false,
        },
      });

      const logger = pluginInitializerContext.logger.get();
      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined });
      expect((logger.warn as jest.Mock).mock.calls.length).toBe(1);
      expect((logger.warn as jest.Mock).mock.calls[0][0]).toBe(
        'Disabling authentication for background task utilization API'
      );
    });
  });

  describe('start', () => {
    test('should initialize task polling lifecycle if node.roles.backgroundTasks is true', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>(
        pluginInitializerContextParams
      );
      pluginInitializerContext.node.roles.backgroundTasks = true;
      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined });
      taskManagerPlugin.start(coreStart, {
        cloud: cloudMock.createStart(),
        licensing: licensingMock.createStart(),
      });

      expect(TaskPollingLifecycle as jest.Mock<TaskPollingLifecycleClass>).toHaveBeenCalledTimes(1);
    });

    test('should not initialize task polling lifecycle if node.roles.backgroundTasks is false', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>(
        pluginInitializerContextParams
      );
      pluginInitializerContext.node.roles.backgroundTasks = false;
      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined });
      taskManagerPlugin.start(coreStart, {
        cloud: cloudMock.createStart(),
        licensing: licensingMock.createStart(),
      });

      expect(TaskPollingLifecycle as jest.Mock<TaskPollingLifecycleClass>).not.toHaveBeenCalled();
    });

    test('passes the fake request enricher obtained at setup to TaskPollingLifecycle', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>(
        pluginInitializerContextParams
      );
      pluginInitializerContext.node.roles.backgroundTasks = true;

      const coreSetup = coreMock.createSetup();
      const enricher = jest.fn();
      (coreSetup.security.acquireFakeRequestEnricher as jest.Mock).mockReturnValue(enricher);

      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreSetup, { usageCollection: undefined });
      taskManagerPlugin.start(coreStart, {
        cloud: cloudMock.createStart(),
        licensing: licensingMock.createStart(),
      });

      expect(coreSetup.security.acquireFakeRequestEnricher).toHaveBeenCalledTimes(1);
      const pollingLifecycleOpts = (TaskPollingLifecycle as jest.Mock).mock.calls[0][0];
      expect(pollingLifecycleOpts.enrichFakeRequest).toBe(enricher);
    });
  });

  describe('stop', () => {
    test('should stop task polling lifecycle if it is defined', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>(
        pluginInitializerContextParams
      );
      pluginInitializerContext.node.roles.backgroundTasks = true;
      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined });
      taskManagerPlugin.start(coreStart, {
        cloud: cloudMock.createStart(),
        licensing: licensingMock.createStart(),
      });

      expect(TaskPollingLifecycle as jest.Mock<TaskPollingLifecycleClass>).toHaveBeenCalledTimes(1);

      await taskManagerPlugin.stop();

      expect(mockTaskPollingLifecycle.stop).toHaveBeenCalled();
    });

    test('should not call stop task polling lifecycle if it is not defined', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>(
        pluginInitializerContextParams
      );
      pluginInitializerContext.node.roles.backgroundTasks = false;
      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined });
      taskManagerPlugin.start(coreStart, {
        cloud: cloudMock.createStart(),
        licensing: licensingMock.createStart(),
      });

      await taskManagerPlugin.stop();

      expect(mockTaskPollingLifecycle.stop).not.toHaveBeenCalled();
    });

    test('should remove the current from discovery service', async () => {
      const pluginInitializerContext = coreMock.createPluginInitializerContext<TaskManagerConfig>(
        pluginInitializerContextParams
      );
      pluginInitializerContext.node.roles.backgroundTasks = true;
      const taskManagerPlugin = new TaskManagerPlugin(pluginInitializerContext);
      taskManagerPlugin.setup(coreMock.createSetup(), { usageCollection: undefined });
      taskManagerPlugin.start(coreStart, {
        cloud: cloudMock.createStart(),
        licensing: licensingMock.createStart(),
      });

      discoveryIsStarted.mockReturnValueOnce(true);
      await taskManagerPlugin.stop();

      expect(deleteCurrentNodeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
