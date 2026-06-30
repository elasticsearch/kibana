/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { assign } from 'lodash';

import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import type { CoreSetup, ElasticsearchClient } from '@kbn/core/server';
import type {
  TaskManagerSetupContract,
  ConcreteTaskInstance,
} from '@kbn/task-manager-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';

import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { getDeleteTaskRunResult } from '@kbn/task-manager-plugin/server/task';
import { coreMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';

import type { ServerlessSecurityConfig } from '../config';
import type { SecurityUsageReportingTaskSetupContract, UsageRecord } from '../types';

import { ProductLine, ProductTier } from '../../common/product';
import { SecurityUsageReportingTask } from './usage_reporting_task';
import { endpointMeteringService } from '../endpoint/services';

describe('SecurityUsageReportingTask', () => {
  const TITLE = 'test-task-title';
  const TYPE = 'test-task-type';
  const VERSION = 'test-task-version';
  const TASK_ID = `${TYPE}:${VERSION}`;
  const USAGE_TYPE = 'test-usage-type';
  const PROJECT_ID = 'test-project-id';

  const { createSetup: coreSetupMock } = coreMock;
  const { createSetup: tmSetupMock, createStart: tmStartMock } = taskManagerMock;

  let mockTask: SecurityUsageReportingTask;
  let mockEsClient: jest.Mocked<ElasticsearchClient>;
  let mockCore: CoreSetup;
  let mockTaskManagerSetup: jest.Mocked<TaskManagerSetupContract>;
  let reportUsageMock: jest.Mock;
  let meteringCallbackMock: jest.Mock;
  let taskArgs: SecurityUsageReportingTaskSetupContract;
  let usageRecord: UsageRecord;

  function buildMockTaskInstance(overrides?: Partial<ConcreteTaskInstance>): ConcreteTaskInstance {
    const timestamp = new Date(new Date().setMinutes(-15)).toISOString();
    return assign(
      {
        id: `${TYPE}:${VERSION}`,
        runAt: timestamp,
        attempts: 0,
        ownerId: '',
        status: TaskStatus.Running,
        startedAt: timestamp,
        scheduledAt: timestamp,
        retryAt: timestamp,
        params: {},
        state: {
          lastSuccessfulReport: timestamp,
        },
        taskType: TYPE,
      },
      overrides
    );
  }

  function buildUsageRecord() {
    const ts = new Date().toISOString();
    return {
      id: `endpoint-agentId-${ts}`,
      usage_timestamp: ts,
      creation_timestamp: ts,
      usage: {
        type: USAGE_TYPE,
        period_seconds: 3600,
        quantity: 1,
      },
      source: {
        id: TASK_ID,
        instance_group_id: PROJECT_ID,
        metadata: {
          tier: ProductTier.complete,
        },
      },
    };
  }

  function buildTaskArgs(
    overrides?: Partial<SecurityUsageReportingTaskSetupContract>
  ): SecurityUsageReportingTaskSetupContract {
    return assign(
      {
        core: mockCore,
        logFactory: loggingSystemMock.create(),
        config: {
          productTypes: [
            {
              product_line: ProductLine.security,
              product_tier: ProductTier.complete,
            },
          ],
        } as ServerlessSecurityConfig,
        taskManager: mockTaskManagerSetup,
        cloudSetup: {
          serverless: {
            projectId: PROJECT_ID,
          },
        } as CloudSetup,
        taskType: TYPE,
        taskTitle: TITLE,
        version: VERSION,
        meteringCallback: meteringCallbackMock,
        usageReportingService: {
          reportUsage: reportUsageMock,
        },
      },
      overrides
    );
  }

  const USAGE_API_CONFIG = {
    enabled: true,
    url: 'https://usage-api-url',
    tls: {
      certificate: '',
      key: '',
      ca: '',
    },
  };

  async function runTask(taskInstance = buildMockTaskInstance(), callNum: number = 0) {
    const mockTaskManagerStart = tmStartMock();
    await mockTask.start({ taskManager: mockTaskManagerStart, interval: '5m' });
    const createTaskRunner =
      mockTaskManagerSetup.registerTaskDefinitions.mock.calls[callNum][0][TYPE].createTaskRunner;
    const taskRunner = createTaskRunner(taskManagerMock.createRunContext({ taskInstance }));
    return taskRunner.run();
  }

  async function setupBaseMocks() {
    mockCore = coreSetupMock();
    mockEsClient = (await mockCore.getStartServices())[0].elasticsearch.client
      .asInternalUser as jest.Mocked<ElasticsearchClient>;
    mockTaskManagerSetup = tmSetupMock();
    usageRecord = buildUsageRecord();
    reportUsageMock = jest.fn();
  }

  describe.skip('meteringCallback integration', () => {
    async function setupMocks() {
      await setupBaseMocks();
      taskArgs = buildTaskArgs({
        meteringCallback: endpointMeteringService.getUsageRecords,
        config: {
          productTypes: [
            { product_line: ProductLine.endpoint, product_tier: ProductTier.complete },
          ],
          usageApi: USAGE_API_CONFIG,
        } as ServerlessSecurityConfig,
      });
      mockTask = new SecurityUsageReportingTask(taskArgs);
    }
    beforeEach(async () => {
      await setupMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('Multiple batches', () => {
      async function runTasksUntilNoRunAt() {
        let task = await runTask();
        while (task?.runAt !== undefined) {
          task = await runTask({ ...buildMockTaskInstance({ runAt: task.runAt }) });
        }
      }

      const heartBeats = Array.from({ length: 2001 }, (_, i) => ({
        _source: {
          agent: {
            id: `test-${i}`,
          },
          event: {
            ingested: '2021-09-01T00:00:00.000Z',
          },
        },
      }));

      const batches = [
        heartBeats.slice(0, 1000),
        heartBeats.slice(1000, 2000),
        heartBeats.slice(2000),
      ];

      it('properly reports multiple batches', async () => {
        batches.forEach((batch) => {
          mockEsClient.search.mockResolvedValueOnce({
            hits: {
              hits: batch,
            },
          } as SearchResponse);
        });

        await runTasksUntilNoRunAt();

        expect(reportUsageMock).toHaveBeenCalledTimes(3);
        batches.forEach((batch, i) => {
          expect(reportUsageMock).toHaveBeenNthCalledWith(
            i + 1,
            expect.arrayContaining(
              batch.map(({ _source }) =>
                expect.objectContaining({
                  id: `endpoint-${_source.agent.id}-2021-09-01T00:00:00.000Z`,
                })
              )
            )
          );
        });
      });
    });
  });

  describe('Mocked meteringCallback', () => {
    async function setupMocks(backfillConfig?: { enabled: boolean; maxRecords?: number }) {
      await setupBaseMocks();
      meteringCallbackMock = jest.fn().mockResolvedValueOnce({
        latestRecordTimestamp: usageRecord.usage_timestamp,
        records: [usageRecord],
        shouldRunAgain: false,
      });
      taskArgs = buildTaskArgs({
        config: {
          usageApi: USAGE_API_CONFIG,
        } as ServerlessSecurityConfig,
        backfillConfig,
      });
      mockTask = new SecurityUsageReportingTask(taskArgs);
    }

    beforeEach(async () => {
      await setupMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('task lifecycle', () => {
      it('should create task', () => {
        expect(mockTask).toBeInstanceOf(SecurityUsageReportingTask);
      });

      it('should register task', () => {
        expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
      });

      it('should schedule task', async () => {
        const mockTaskManagerStart = tmStartMock();
        await mockTask.start({ taskManager: mockTaskManagerStart, interval: '5m' });
        expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
      });
    });

    describe('task logic', () => {
      it('should call metering callback', async () => {
        const task = await runTask();
        expect(meteringCallbackMock).toHaveBeenCalledWith(
          expect.objectContaining({
            esClient: mockEsClient,
            cloudSetup: taskArgs.cloudSetup,
            taskId: TASK_ID,
            config: taskArgs.config,
            lastSuccessfulReport: new Date(task?.state.lastSuccessfulReport as string),
          })
        );
      });

      it('should report metering records', async () => {
        await runTask();
        expect(reportUsageMock).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              creation_timestamp: usageRecord.creation_timestamp,
              id: usageRecord.id,
              source: {
                id: TASK_ID,
                instance_group_id: PROJECT_ID,
                metadata: { tier: ProductTier.complete },
              },
              usage: { period_seconds: 3600, quantity: 1, type: USAGE_TYPE },
              usage_timestamp: usageRecord.usage_timestamp,
            }),
          ])
        );
      });

      it('should do nothing if task instance id is outdated', async () => {
        const result = await runTask({ ...buildMockTaskInstance(), id: 'old-id' });

        expect(result).toEqual(getDeleteTaskRunResult());

        expect(reportUsageMock).not.toHaveBeenCalled();
        expect(meteringCallbackMock).not.toHaveBeenCalled();
      });

      describe('backfill configuration', () => {
        it('should throw error when backfill is enabled without maxRecords', async () => {
          await expect(setupMocks({ enabled: true })).rejects.toThrow(
            'maxRecords is required when backfill is enabled'
          );
        });

        it('should create task successfully with valid backfill config', async () => {
          await setupMocks({ enabled: true, maxRecords: 1000 });
          expect(mockTask).toBeInstanceOf(SecurityUsageReportingTask);
        });
      });

      describe('backfill functionality', () => {
        beforeEach(async () => {
          await setupMocks({ enabled: true, maxRecords: 1000 });
        });

        it('should store records in state when API call fails', async () => {
          reportUsageMock.mockRejectedValueOnce(new Error('API Error'));

          const task = await runTask();

          expect(task?.state.backfillRecords).toEqual([usageRecord]);
        });

        it('should prepend existing backfill records to new records', async () => {
          const oldRecord = { ...usageRecord, id: 'old-record' };
          const taskInstance = buildMockTaskInstance({
            state: {
              backfillRecords: [oldRecord],
              lastSuccessfulReport: new Date().toISOString(),
            },
          });

          await runTask(taskInstance);

          expect(reportUsageMock).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({ id: oldRecord.id }),
              expect.objectContaining({ id: usageRecord.id }),
            ])
          );
        });

        it('should clear backfill records after successful API call', async () => {
          reportUsageMock.mockResolvedValueOnce({ ok: true, status: 201 });
          const oldRecord = { ...usageRecord, id: 'old-record' };
          const taskInstance = buildMockTaskInstance({
            state: {
              backfillRecords: [oldRecord],
              lastSuccessfulReport: new Date().toISOString(),
            },
          });

          const task = await runTask(taskInstance);

          expect(task?.state.backfillRecords).toEqual([]);
        });

        it('should send all backfill records along with new records', async () => {
          const backfillRecords = Array.from({ length: 2 }, (_, i) => ({
            ...usageRecord,
            id: `backfill-${i + 1}`,
          }));

          const newRecord = { ...usageRecord, id: 'new-record' };

          reportUsageMock.mockReset();
          reportUsageMock.mockResolvedValueOnce({ ok: true, status: 201 });

          meteringCallbackMock.mockReset();
          meteringCallbackMock.mockResolvedValueOnce({
            latestRecordTimestamp: new Date().toISOString(),
            records: [newRecord],
            shouldRunAgain: false,
          });

          const taskInstance = buildMockTaskInstance({
            state: {
              backfillRecords,
              lastSuccessfulReport: new Date().toISOString(),
            },
          });

          await runTask(taskInstance);

          // Verify all records are sent
          const expectedRecords = [
            expect.objectContaining({ id: 'backfill-1' }),
            expect.objectContaining({ id: 'backfill-2' }),
            expect.objectContaining({ id: 'new-record' }),
          ];

          expect(reportUsageMock).toHaveBeenCalledWith(expect.arrayContaining(expectedRecords));
          expect(reportUsageMock.mock.calls[0][0]).toHaveLength(3);
        });

        it('should enforce maxRecords limit on backfill records', async () => {
          const maxRecords = 2;
          await setupMocks({ enabled: true, maxRecords });

          reportUsageMock.mockReset();
          reportUsageMock.mockRejectedValueOnce(new Error('API Error'));

          const existingBackfillRecords = Array.from({ length: 2 }, (_, i) => ({
            ...usageRecord,
            id: `old-${i + 1}`,
            usage_timestamp: new Date(Date.now() - 1000).toISOString(),
          }));

          const newRecords = Array.from({ length: 2 }, (_, i) => ({
            ...usageRecord,
            id: `new-${i + 1}`,
            usage_timestamp: new Date().toISOString(),
          }));

          meteringCallbackMock.mockReset();
          meteringCallbackMock.mockResolvedValueOnce({
            latestRecordTimestamp: new Date().toISOString(),
            records: newRecords,
            shouldRunAgain: false,
          });

          const taskInstance = buildMockTaskInstance({
            state: {
              backfillRecords: existingBackfillRecords,
              lastSuccessfulReport: new Date().toISOString(),
            },
          });

          const task = await runTask(taskInstance);

          // should only keep the last 2 records
          expect(task?.state.backfillRecords).toHaveLength(maxRecords);
          expect(task?.state.backfillRecords).toEqual([
            expect.objectContaining({ id: 'new-1' }),
            expect.objectContaining({ id: 'new-2' }),
          ]);
        });
      });

      describe('lastSuccessfulReport', () => {
        it('should set lastSuccessfulReport correctly if report success', async () => {
          reportUsageMock.mockResolvedValueOnce({ status: 201 });
          const taskInstance = buildMockTaskInstance();
          const task = await runTask(taskInstance);
          const newLastSuccessfulReport = task?.state.lastSuccessfulReport;
          expect(newLastSuccessfulReport).toEqual(expect.any(String));
          expect(newLastSuccessfulReport).not.toEqual(taskInstance.state.lastSuccessfulReport);
        });

        it('should set lastSuccessfulReport correctly if no usage records found', async () => {
          meteringCallbackMock.mockResolvedValueOnce([]);
          const taskInstance = buildMockTaskInstance({ state: { lastSuccessfulReport: null } });
          const task = await runTask(taskInstance);
          const newLastSuccessfulReport = task?.state.lastSuccessfulReport;
          expect(newLastSuccessfulReport).toEqual(expect.any(String));
          expect(newLastSuccessfulReport).not.toEqual(taskInstance.state.lastSuccessfulReport);
        });

        describe('and response is NOT 201', () => {
          beforeEach(() => {
            reportUsageMock.mockResolvedValueOnce({ status: 500 });
          });

          it('should set lastSuccessfulReport correctly', async () => {
            const lastSuccessfulReport = new Date(new Date().setMinutes(-15)).toISOString();
            const taskInstance = buildMockTaskInstance({ state: { lastSuccessfulReport } });
            const task = await runTask(taskInstance);
            const newLastSuccessfulReport = task?.state.lastSuccessfulReport;

            expect(newLastSuccessfulReport).toEqual(taskInstance.state.lastSuccessfulReport);
          });

          it('should set lastSuccessfulReport correctly if previously null', async () => {
            const taskInstance = buildMockTaskInstance({ state: { lastSuccessfulReport: null } });
            const task = await runTask(taskInstance);
            const newLastSuccessfulReport = task?.state.lastSuccessfulReport;

            expect(newLastSuccessfulReport).toEqual(expect.any(String));
          });
        });
      });
    });
  });
});
