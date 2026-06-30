/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { SuccessfulRunResult } from '@kbn/task-manager-plugin/server/task';
import { OsqueryTelemetryTask } from './task';
import {
  createMockTaskInstance,
  createMockTelemetryEventsSender,
  createMockTelemetryReceiver,
  createMockOsqueryTelemetryTask,
} from './__mocks__';

describe('test osquery telemetry task', () => {
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
  });

  test('telemetry task should be constructed', () => {
    const telemetryTask = new OsqueryTelemetryTask(
      createMockOsqueryTelemetryTask(),
      logger,
      createMockTelemetryEventsSender(true),
      createMockTelemetryReceiver()
    );

    expect(telemetryTask).toBeInstanceOf(OsqueryTelemetryTask);
  });

  test('telemetry task should be registered and scheduled', async () => {
    const mockTaskManagerSetup = taskManagerMock.createSetup();
    const mockTaskManagerStart = taskManagerMock.createStart();
    const telemetryTask = new OsqueryTelemetryTask(
      createMockOsqueryTelemetryTask(),
      logger,
      createMockTelemetryEventsSender(true),
      createMockTelemetryReceiver()
    );
    telemetryTask.register(mockTaskManagerSetup);
    await telemetryTask.start(mockTaskManagerStart);

    expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
    expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
  });

  test('telemetry task should run', async () => {
    const {
      testLastTimestamp,
      testResult,
      telemetryTask,
      mockTelemetryTaskConfig,
      mockTelemetryEventsSender,
      mockTelemetryReceiver,
    } = await testTelemetryTaskRun(true);

    expect(mockTelemetryTaskConfig.runTask).toHaveBeenCalledWith(
      telemetryTask.getTaskId(),
      logger,
      mockTelemetryReceiver,
      mockTelemetryEventsSender,
      {
        last: testLastTimestamp,
        current: testResult.state.lastExecutionTimestamp,
      }
    );
  });

  async function testTelemetryTaskRun(optedIn: boolean) {
    const now = new Date();
    const testType = 'security:test-task';
    const testLastTimestamp = now.toISOString();
    const mockTaskManagerSetup = taskManagerMock.createSetup();
    const mockTelemetryTaskConfig = createMockOsqueryTelemetryTask(testType, testLastTimestamp);
    const mockTelemetryEventsSender = createMockTelemetryEventsSender(optedIn);
    const mockTelemetryReceiver = createMockTelemetryReceiver();
    const telemetryTask = new OsqueryTelemetryTask(
      mockTelemetryTaskConfig,
      logger,
      mockTelemetryEventsSender,
      mockTelemetryReceiver
    );
    const mockTaskInstance = createMockTaskInstance(telemetryTask.getTaskId(), testType);

    telemetryTask.register(mockTaskManagerSetup);
    expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();

    const createTaskRunner =
      mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0][testType].createTaskRunner;

    const taskRunner = createTaskRunner(
      taskManagerMock.createRunContext({ taskInstance: mockTaskInstance })
    );
    const testResult = (await taskRunner.run()) as SuccessfulRunResult;

    expect(mockTelemetryTaskConfig.getLastExecutionTime).toHaveBeenCalled();

    expect(testResult).not.toBeNull();
    expect(testResult).toHaveProperty('state.lastExecutionTimestamp');

    return {
      testLastTimestamp,
      testResult,
      telemetryTask,
      mockTelemetryTaskConfig,
      mockTelemetryEventsSender,
      mockTelemetryReceiver,
    };
  }
});
