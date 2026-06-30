/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TransportResult } from '@elastic/elasticsearch';
import type { TransformGetTransformStatsResponse } from '@elastic/elasticsearch/lib/api/types';
import {
  CheckMetadataTransformsTask,
  TYPE,
  VERSION,
  BASE_NEXT_ATTEMPT_DELAY,
} from './check_metadata_transforms_task';
import { createMockEndpointAppContext } from '../../mocks';
import { coreMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { getDeleteTaskRunResult } from '@kbn/task-manager-plugin/server/task';
import type { CoreSetup } from '@kbn/core/server';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { TRANSFORM_STATES } from '../../../../common/constants';
import { METADATA_TRANSFORMS_PATTERN } from '../../../../common/endpoint/constants';
import type { RunResult } from '@kbn/task-manager-plugin/server/task';
import type { EsAssetReference, Installation } from '@kbn/fleet-plugin/common';
import { ElasticsearchAssetType } from '@kbn/fleet-plugin/common';

import type { EndpointAppContext } from '../../types';
import type { PackagePolicy } from '@kbn/fleet-plugin/common/types/models/package_policy';
import type { PackageClient } from '@kbn/fleet-plugin/server';

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
const failedTransformId = 'failing-transform';
const goodTransformId = 'good-transform';

describe('check metadata transforms task', () => {
  const { createSetup: coreSetupMock } = coreMock;
  const { createSetup: tmSetupMock, createStart: tmStartMock } = taskManagerMock;

  let mockTask: CheckMetadataTransformsTask;
  let mockCore: CoreSetup;
  let mockTaskManagerSetup: jest.Mocked<TaskManagerSetupContract>;
  let mockEndpointAppContext: EndpointAppContext;
  beforeEach(() => {
    mockCore = coreSetupMock();
    mockTaskManagerSetup = tmSetupMock();
    mockEndpointAppContext = createMockEndpointAppContext();
    mockTask = new CheckMetadataTransformsTask({
      endpointAppContext: mockEndpointAppContext,
      core: mockCore,
      taskManager: mockTaskManagerSetup,
    });
    jest
      .spyOn(mockEndpointAppContext.service.getInternalFleetServices().packages, 'getInstallation')
      .mockResolvedValue({
        installed_es: [
          { type: ElasticsearchAssetType.transform } as EsAssetReference,
          { type: ElasticsearchAssetType.transform } as EsAssetReference,
        ],
        version: '8.11.0',
      } as Installation);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('task lifecycle', () => {
    it('should create task', () => {
      expect(mockTask).toBeInstanceOf(CheckMetadataTransformsTask);
    });

    it('should register task', () => {
      expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
    });

    it('should schedule task', async () => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
    });
  });

  describe('task logic', () => {
    let esClient: ElasticsearchClientMock;
    beforeEach(async () => {
      const [{ elasticsearch }] = await mockCore.getStartServices();
      esClient = elasticsearch.client.asInternalUser as ElasticsearchClientMock;
    });

    const runTask = async (taskInstance = MOCK_TASK_INSTANCE) => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      const createTaskRunner =
        mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0][TYPE].createTaskRunner;
      const taskRunner = createTaskRunner(taskManagerMock.createRunContext({ taskInstance }));
      return taskRunner.run();
    };

    const buildFailedStatsResponse = () =>
      ({
        body: {
          transforms: [
            {
              id: goodTransformId,
              state: TRANSFORM_STATES.STARTED,
            },
            {
              id: failedTransformId,
              state: TRANSFORM_STATES.FAILED,
            },
          ],
        },
      } as unknown as TransportResult<TransformGetTransformStatsResponse>);

    it('should not run if task is outdated', async () => {
      const result = await runTask({ ...MOCK_TASK_INSTANCE, id: 'old-id' });

      expect(esClient.transform.getTransformStats).not.toHaveBeenCalled();
      expect(esClient.transform.stopTransform).not.toHaveBeenCalled();
      expect(esClient.transform.startTransform).not.toHaveBeenCalled();

      expect(result).toEqual(getDeleteTaskRunResult());
    });

    describe('transforms restart', () => {
      it('should stop task if transform stats response fails', async () => {
        esClient.transform.getTransformStats.mockRejectedValue({});
        await runTask();
        expect(esClient.transform.getTransformStats).toHaveBeenCalledWith(
          {
            transform_id: METADATA_TRANSFORMS_PATTERN,
          },
          { meta: true }
        );
        expect(esClient.transform.stopTransform).not.toHaveBeenCalled();
        expect(esClient.transform.startTransform).not.toHaveBeenCalled();
      });

      it('should attempt transform restart if failing state', async () => {
        const transformStatsResponseMock = buildFailedStatsResponse();
        esClient.transform.getTransformStats.mockResponse(transformStatsResponseMock.body);

        const taskResponse = (await runTask()) as RunResult;

        expect(esClient.transform.getTransformStats).toHaveBeenCalledWith(
          {
            transform_id: METADATA_TRANSFORMS_PATTERN,
          },
          { meta: true }
        );
        expect(esClient.transform.stopTransform).toHaveBeenCalledWith({
          transform_id: failedTransformId,
          allow_no_match: true,
          wait_for_completion: true,
          force: true,
        });
        expect(esClient.transform.startTransform).toHaveBeenCalledWith({
          transform_id: failedTransformId,
        });
        expect(taskResponse?.state?.restartAttempts).toEqual({
          [goodTransformId]: 0,
          [failedTransformId]: 0,
        });
      });

      it('should correctly track transform restart attempts', async () => {
        const transformStatsResponseMock = buildFailedStatsResponse();
        esClient.transform.getTransformStats.mockResponse(transformStatsResponseMock.body);

        esClient.transform.stopTransform.mockRejectedValueOnce({});
        let taskResponse = (await runTask()) as RunResult;
        expect(taskResponse?.state?.restartAttempts).toEqual({
          [goodTransformId]: 0,
          [failedTransformId]: 1,
        });

        esClient.transform.startTransform.mockRejectedValueOnce({});
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        expect(taskResponse?.state?.restartAttempts).toEqual({
          [goodTransformId]: 0,
          [failedTransformId]: 2,
        });

        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        expect(taskResponse?.state?.restartAttempts).toEqual({
          [goodTransformId]: 0,
          [failedTransformId]: 0,
        });
      });

      it('should correctly back off subsequent restart attempts', async () => {
        let transformStatsResponseMock = buildFailedStatsResponse();
        esClient.transform.getTransformStats.mockResponse(transformStatsResponseMock.body);

        esClient.transform.stopTransform.mockRejectedValueOnce({});
        let taskStartedAt = new Date();
        let taskResponse = (await runTask()) as RunResult;
        let delay = BASE_NEXT_ATTEMPT_DELAY * 60000;
        let expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        let expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        esClient.transform.startTransform.mockRejectedValueOnce({});
        taskStartedAt = new Date();
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        // should be exponential on second+ attempt
        delay = BASE_NEXT_ATTEMPT_DELAY ** 2 * 60000;
        expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        esClient.transform.stopTransform.mockRejectedValueOnce({});
        taskStartedAt = new Date();
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        // should be exponential on second+ attempt
        delay = BASE_NEXT_ATTEMPT_DELAY ** 3 * 60000;
        expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        taskStartedAt = new Date();
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        // back to base delay after success
        delay = BASE_NEXT_ATTEMPT_DELAY * 60000;
        expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        transformStatsResponseMock = {
          body: {
            transforms: [
              {
                id: goodTransformId,
                state: TRANSFORM_STATES.STARTED,
              },
              {
                id: failedTransformId,
                state: TRANSFORM_STATES.STARTED,
              },
            ],
          },
        } as unknown as TransportResult<TransformGetTransformStatsResponse>;
        esClient.transform.getTransformStats.mockResponse(transformStatsResponseMock.body);
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        // no more explicit runAt after subsequent success
        expect(taskResponse?.runAt).toBeUndefined();
      });
    });

    describe('transforms reinstall', () => {
      let getPackageSpy: jest.SpyInstance;
      let reinstallEsAssetsSpy: jest.SpyInstance;
      let mockPackageClient: jest.Mocked<PackageClient>;

      beforeEach(() => {
        jest
          .spyOn(
            mockEndpointAppContext.service.getEndpointMetadataService(),
            'getAllEndpointPackagePolicies'
          )
          .mockResolvedValue([{} as PackagePolicy]);

        mockPackageClient = mockEndpointAppContext.service.getInternalFleetServices()
          .packages as jest.Mocked<PackageClient>;
        getPackageSpy = jest.spyOn(mockPackageClient, 'getPackage');
        reinstallEsAssetsSpy = jest.spyOn(mockPackageClient, 'reinstallEsAssets');

        const transformStatsResponseMock = {
          body: {
            transforms: [
              {
                id: 'transform1',
                state: TRANSFORM_STATES.STARTED,
              },
            ],
            count: 1,
          },
        } as unknown as TransportResult<TransformGetTransformStatsResponse>;
        esClient.transform.getTransformStats.mockResponse(transformStatsResponseMock.body);
      });

      it('should reinstall if missing transforms', async () => {
        const expectedArgs = {
          packageInfo: { name: 'package name' },
          paths: ['some/test/transform/path'],
        };
        getPackageSpy.mockResolvedValue(expectedArgs);
        reinstallEsAssetsSpy.mockResolvedValue([{}]);
        await runTask();

        expect(reinstallEsAssetsSpy).toHaveBeenCalledTimes(1);
        expect(reinstallEsAssetsSpy).toHaveBeenCalledWith(
          expectedArgs.packageInfo,
          expectedArgs.paths
        );
      });

      it('should correctly track attempts on reinstall', async () => {
        reinstallEsAssetsSpy.mockRejectedValueOnce({}).mockRejectedValueOnce({});

        let taskResponse = (await runTask()) as RunResult;
        expect(taskResponse?.state.reinstallAttempts).toEqual(1);

        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        expect(taskResponse?.state.reinstallAttempts).toEqual(2);
      });

      it('should return correct runAt', async () => {
        getPackageSpy.mockResolvedValue({
          packageInfo: { name: 'package name' },
          paths: ['some/test/transform/path'],
        });
        reinstallEsAssetsSpy
          .mockRejectedValueOnce([])
          .mockRejectedValueOnce([])
          .mockRejectedValueOnce([])
          .mockResolvedValueOnce([{}]);

        let taskStartedAt = new Date();
        let taskResponse = (await runTask()) as RunResult;

        expect(reinstallEsAssetsSpy).toHaveBeenCalledTimes(1);

        let delay = BASE_NEXT_ATTEMPT_DELAY * 60000;
        let expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        let expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        taskStartedAt = new Date();
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        expect(reinstallEsAssetsSpy).toHaveBeenCalledTimes(2);

        // should be exponential on second+ attempt
        delay = BASE_NEXT_ATTEMPT_DELAY ** 2 * 60000;
        expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        taskStartedAt = new Date();
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        expect(reinstallEsAssetsSpy).toHaveBeenCalledTimes(3);

        // should be exponential on second+ attempt
        delay = BASE_NEXT_ATTEMPT_DELAY ** 3 * 60000;
        expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        taskStartedAt = new Date();
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        expect(reinstallEsAssetsSpy).toHaveBeenCalledTimes(4);

        // back to base delay after success
        delay = BASE_NEXT_ATTEMPT_DELAY * 60000;
        expectedRunAt = taskStartedAt.getTime() + delay;
        expect(taskResponse?.runAt?.getTime()).toBeGreaterThanOrEqual(expectedRunAt);
        // we don't have the exact timestamp it uses so give a buffer
        expectedRunAtUpperBound = expectedRunAt + 1000;
        expect(taskResponse?.runAt?.getTime()).toBeLessThanOrEqual(expectedRunAtUpperBound);

        const goodTransformStatsResponseMock = {
          body: {
            transforms: [
              {
                id: 'transform1',
                state: TRANSFORM_STATES.STARTED,
              },
              {
                id: 'transform2',
                state: TRANSFORM_STATES.STARTED,
              },
            ],
            count: 2,
          },
        } as unknown as TransportResult<TransformGetTransformStatsResponse>;
        esClient.transform.getTransformStats.mockResponse(goodTransformStatsResponseMock.body);
        taskResponse = (await runTask({
          ...MOCK_TASK_INSTANCE,
          state: taskResponse.state,
        })) as RunResult;
        // same since shouldn't call it when transforms are good
        expect(reinstallEsAssetsSpy).toHaveBeenCalledTimes(4);
        // no more explicit runAt after subsequent success
        expect(taskResponse?.runAt).toBeUndefined();
      });
    });
  });
});
