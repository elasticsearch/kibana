/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { SuccessfulRunResult } from '@kbn/task-manager-plugin/server/task';
import { SecurityTelemetryTask } from './task';
import {
  createMockTaskInstance,
  createMockTelemetryEventsSender,
  createMockTelemetryReceiver,
  createMockTaskMetrics,
  createMockSecurityTelemetryTask,
} from './__mocks__';
import { newTelemetryLogger } from './helpers';

describe('test security telemetry task', () => {
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
  });

  test('telemetry task should be constructed', () => {
    const telemetryTask = new SecurityTelemetryTask(
      createMockSecurityTelemetryTask(),
      logger,
      createMockTelemetryEventsSender(true),
      createMockTelemetryReceiver(),
      createMockTaskMetrics()
    );

    expect(telemetryTask).toBeInstanceOf(SecurityTelemetryTask);
  });

  test('telemetry task should be registered and scheduled', async () => {
    const mockTaskManagerSetup = taskManagerMock.createSetup();
    const mockTaskManagerStart = taskManagerMock.createStart();
    const telemetryTask = new SecurityTelemetryTask(
      createMockSecurityTelemetryTask(),
      logger,
      createMockTelemetryEventsSender(true),
      createMockTelemetryReceiver(),
      createMockTaskMetrics()
    );
    telemetryTask.register(mockTaskManagerSetup);
    await telemetryTask.start(mockTaskManagerStart);

    expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
    expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
  });

  test('telemetry task should run if opted in', async () => {
    const {
      testLastTimestamp,
      testResult,
      telemetryTask,
      mockTelemetryTaskConfig,
      mockTelemetryEventsSender,
      mockTelemetryReceiver,
      mockTaskMetrics,
    } = await testTelemetryTaskRun(true, true);

    expect(mockTelemetryTaskConfig.runTask).toHaveBeenCalledWith(
      telemetryTask.getTaskId(),
      newTelemetryLogger(logger.get('task')),
      mockTelemetryReceiver,
      mockTelemetryEventsSender,
      mockTaskMetrics,
      {
        last: testLastTimestamp,
        current: testResult.state.lastExecutionTimestamp,
      }
    );
  });

  test('security telemetry task should not run if opted out', async () => {
    const { mockTelemetryTaskConfig } = await testTelemetryTaskRun(false, true);

    expect(mockTelemetryTaskConfig.runTask).not.toHaveBeenCalled();
  });

  test('security telemetry tasks should not run if opted in but cannot phone home', async () => {
    const { mockTelemetryTaskConfig } = await testTelemetryTaskRun(true, false);

    expect(mockTelemetryTaskConfig.runTask).not.toHaveBeenCalled();
  });

  async function testTelemetryTaskRun(optedIn: boolean, canConnect: boolean) {
    const now = new Date();
    const testType = 'security:test-task';
    const testLastTimestamp = now.toISOString();
    const mockTaskManagerSetup = taskManagerMock.createSetup();
    const mockTelemetryTaskConfig = createMockSecurityTelemetryTask(testType, testLastTimestamp);
    const mockTelemetryEventsSender = createMockTelemetryEventsSender(optedIn, canConnect);
    const mockTelemetryReceiver = createMockTelemetryReceiver();
    const mockTaskMetrics = createMockTaskMetrics();
    const telemetryTask = new SecurityTelemetryTask(
      mockTelemetryTaskConfig,
      logger,
      mockTelemetryEventsSender,
      mockTelemetryReceiver,
      mockTaskMetrics
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
    expect(mockTelemetryEventsSender.isTelemetryOptedIn).toHaveBeenCalled();

    expect(testResult).not.toBeNull();
    expect(testResult).toHaveProperty('state.lastExecutionTimestamp');

    return {
      testLastTimestamp,
      testResult,
      telemetryTask,
      mockTelemetryTaskConfig,
      mockTelemetryEventsSender,
      mockTelemetryReceiver,
      mockTaskMetrics,
    };
  }
});
