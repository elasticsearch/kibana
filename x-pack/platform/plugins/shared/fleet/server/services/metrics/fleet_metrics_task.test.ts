/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { getDeleteTaskRunResult } from '@kbn/task-manager-plugin/server/task';
import type { CoreSetup } from '@kbn/core/server';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';

import { appContextService } from '../app_context';
import { createAppContextStartContractMock } from '../../mocks';

import { FleetMetricsTask, TYPE, VERSION } from './fleet_metrics_task';

const MOCK_TASK_INSTANCE = {
  id: `${TYPE}:${VERSION}`,
  runAt: new Date(),
  attempts: 0,
  ownerId: '',
  status: TaskStatus.Running,
  startedAt: new Date(),
  scheduledAt: new Date(),
  retryAt: new Date(),
  params: {},
  state: {},
  taskType: TYPE,
};

describe('fleet metrics task', () => {
  const { createSetup: coreSetupMock } = coreMock;
  const { createSetup: tmSetupMock, createStart: tmStartMock } = taskManagerMock;

  let mockContract: ReturnType<typeof createAppContextStartContractMock>;
  let mockTask: FleetMetricsTask;
  let mockCore: CoreSetup;
  let mockTaskManagerSetup: jest.Mocked<TaskManagerSetupContract>;
  let mockFetchAgentMetrics: jest.Mock;

  let esClient: ElasticsearchClientMock;
  beforeEach(async () => {
    mockContract = createAppContextStartContractMock();
    appContextService.start(mockContract);
    mockCore = coreSetupMock();
    mockTaskManagerSetup = tmSetupMock();
    const [{ elasticsearch }] = await mockCore.getStartServices();
    esClient = elasticsearch.client.asInternalUser as ElasticsearchClientMock;
    mockFetchAgentMetrics = jest.fn();
    mockTask = new FleetMetricsTask(mockTaskManagerSetup, async () => mockFetchAgentMetrics());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('task lifecycle', () => {
    it('should create task', () => {
      expect(mockTask).toBeInstanceOf(FleetMetricsTask);
    });

    it('should register task', () => {
      expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
    });

    it('should schedule task', async () => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start(mockTaskManagerStart, esClient);
      expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
    });
  });

  describe('task logic', () => {
    beforeEach(async () => {
      esClient.info.mockResolvedValue({
        cluster_uuid: 'cluster1',
      } as any);

      mockFetchAgentMetrics.mockResolvedValue({
        agents: {
          total_all_statuses: 10,
          total_enrolled: 5,
          unenrolled: 5,
          healthy: 1,
          offline: 1,
          updating: 1,
          unhealthy: 1,
          inactive: 1,
        },
        upgrading_step: {
          scheduled: 1,
          requested: 1,
        },
        agents_per_version: [
          {
            version: '8.12.0',
            count: 3,
          },
          {
            version: '8.11.0',
            count: 2,
          },
        ],
        unhealthy_reason: {
          input: 2,
          output: 1,
          other: 3,
        },
      });
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    const runTask = async (taskInstance = MOCK_TASK_INSTANCE) => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start(mockTaskManagerStart, esClient);
      const createTaskRunner =
        mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0][TYPE].createTaskRunner;
      const taskRunner = createTaskRunner(taskManagerMock.createRunContext({ taskInstance }));
      return taskRunner.run();
    };

    it('should publish agent metrics', async () => {
      await runTask();

      expect(esClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'metrics-fleet_server.agent_status-default',
          body: expect.objectContaining({
            '@timestamp': expect.any(String),
            data_stream: {
              dataset: 'fleet_server.agent_status',
              type: 'metrics',
              namespace: 'default',
            },
            cluster: { id: 'cluster1' },
            agent: { id: '1', version: '8.99.0', type: 'kibana' },
            fleet: {
              agents: {
                total: 10,
                enrolled: 5,
                unenrolled: 5,
                healthy: 1,
                offline: 1,
                updating: 1,
                unhealthy: 1,
                inactive: 1,
                upgrading_step: {
                  scheduled: 1,
                  requested: 1,
                },
                unhealthy_reason: {
                  input: 2,
                  output: 1,
                  other: 3,
                },
              },
            },
          }),
        })
      );

      expect(esClient.bulk).toHaveBeenCalledWith({
        index: 'metrics-fleet_server.agent_versions-default',
        operations: [
          { create: {} },
          {
            '@timestamp': expect.any(String),
            agent: { id: '1', type: 'kibana', version: '8.99.0' },
            cluster: { id: 'cluster1' },
            data_stream: {
              dataset: 'fleet_server.agent_versions',
              namespace: 'default',
              type: 'metrics',
            },
            fleet: { agent: { count: 3, version: '8.12.0' } },
          },
          { create: {} },
          {
            '@timestamp': expect.any(String),
            agent: { id: '1', type: 'kibana', version: '8.99.0' },
            cluster: { id: 'cluster1' },
            data_stream: {
              dataset: 'fleet_server.agent_versions',
              namespace: 'default',
              type: 'metrics',
            },
            fleet: { agent: { count: 2, version: '8.11.0' } },
          },
        ],
        refresh: true,
      });
    });

    it('should not run if task is outdated', async () => {
      const result = await runTask({ ...MOCK_TASK_INSTANCE, id: 'old-id' });

      expect(esClient.index).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();

      expect(appContextService.getLogger().info).toHaveBeenCalledWith(
        'Outdated task version: Got [old-id] from task instance. Current version is [Fleet-Metrics-Task:1.1.1]'
      );
      expect(result).toEqual(getDeleteTaskRunResult());
    });

    it('should log errors from bulk create', async () => {
      esClient.bulk.mockResolvedValue({
        errors: true,
        items: [
          {
            create: {
              error: {
                reason: 'error from es',
              },
            },
          },
          {
            create: {
              error: {
                reason: 'error from es',
              },
            },
          },
        ],
      } as any);

      await runTask();

      expect(appContextService.getLogger().warn).toHaveBeenCalledWith(
        'Error occurred while publishing Fleet metrics: Error: error from es'
      );
    });
  });
});
