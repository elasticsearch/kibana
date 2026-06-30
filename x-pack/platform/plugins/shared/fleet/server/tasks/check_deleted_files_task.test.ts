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
import { loggingSystemMock } from '@kbn/core/server/mocks';

import { getFileDataIndexName, getFileMetadataIndexName } from '../../common';

import { createAppContextStartContractMock } from '../mocks';

import { appContextService } from '../services';

import { CheckDeletedFilesTask, TYPE, VERSION } from './check_deleted_files_task';

const MOCK_FILE_METADATA_INDEX = '.ds-' + getFileMetadataIndexName('mock');
const MOCK_FILE_DATA_INDEX = '.ds-' + getFileDataIndexName('mock');

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

describe('check deleted files task', () => {
  const { createSetup: coreSetupMock } = coreMock;
  const { createSetup: tmSetupMock, createStart: tmStartMock } = taskManagerMock;

  let mockContract: ReturnType<typeof createAppContextStartContractMock>;
  let mockTask: CheckDeletedFilesTask;
  let mockCore: CoreSetup;
  let mockTaskManagerSetup: jest.Mocked<TaskManagerSetupContract>;
  beforeEach(() => {
    mockContract = createAppContextStartContractMock();
    appContextService.start(mockContract);
    mockCore = coreSetupMock();
    mockTaskManagerSetup = tmSetupMock();
    mockTask = new CheckDeletedFilesTask({
      core: mockCore,
      taskManager: mockTaskManagerSetup,
      logFactory: loggingSystemMock.create(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('task lifecycle', () => {
    it('should create task', () => {
      expect(mockTask).toBeInstanceOf(CheckDeletedFilesTask);
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
    const abortController = new AbortController();

    beforeEach(async () => {
      const [{ elasticsearch }] = await mockCore.getStartServices();
      esClient = elasticsearch.client.asInternalUser as ElasticsearchClientMock;
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    const runTask = async (taskInstance = MOCK_TASK_INSTANCE) => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      const createTaskRunner =
        mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0][TYPE].createTaskRunner;
      const taskRunner = createTaskRunner(taskManagerMock.createRunContext({ taskInstance }));
      return taskRunner.run();
    };

    it('should search both metadata indexes', async () => {
      esClient.search.mockResolvedValue({
        took: 5,
        timed_out: false,
        _shards: {
          total: 1,
          successful: 1,
          skipped: 0,
          failed: 0,
        },
        hits: {
          total: {
            value: 0,
            relation: 'eq',
          },
          hits: [],
        },
      });

      await runTask();

      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: ['.fleet-fileds-fromhost-meta-*', '.fleet-fileds-tohost-meta-*'],
        }),
        expect.anything()
      );
    });

    it('should attempt to update deleted files', async () => {
      // mock getReadyFiles search
      esClient.search
        .mockResolvedValueOnce({
          took: 5,
          timed_out: false,
          _shards: {
            total: 1,
            successful: 1,
            skipped: 0,
            failed: 0,
          },
          hits: {
            total: {
              value: 1,
              relation: 'eq',
            },
            hits: [
              {
                _id: 'metadata-testid1',
                _index: MOCK_FILE_METADATA_INDEX,
                _source: { file: { status: 'READY' } },
              },
              {
                _id: 'metadata-testid2',
                _index: MOCK_FILE_METADATA_INDEX,
                _source: { file: { status: 'READY' } },
              },
            ],
          },
        })
        // mock doFilesHaveChunks search
        .mockResolvedValueOnce({
          took: 5,
          timed_out: false,
          _shards: {
            total: 1,
            successful: 1,
            skipped: 0,
            failed: 0,
          },
          hits: {
            total: {
              value: 0,
              relation: 'eq',
            },
            hits: [
              {
                _id: 'data-testid1',
                _index: MOCK_FILE_DATA_INDEX,
                _source: {
                  bid: 'metadata-testid1',
                },
              },
            ],
          },
        });

      await runTask();

      expect(esClient.updateByQuery).toHaveBeenCalledWith(
        {
          index: MOCK_FILE_METADATA_INDEX.replace('.ds-', ''),
          query: {
            ids: {
              values: ['metadata-testid2'],
            },
          },
          refresh: true,
          script: {
            lang: 'painless',
            source: "ctx._source.file.Status = 'DELETED'",
          },
        },
        { signal: abortController.signal }
      );
    });

    it('should not run if task is outdated', async () => {
      const result = await runTask({ ...MOCK_TASK_INSTANCE, id: 'old-id' });

      expect(esClient.search).not.toHaveBeenCalled();
      expect(esClient.updateByQuery).not.toHaveBeenCalled();

      expect(result).toEqual(getDeleteTaskRunResult());
    });
  });
});
