/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  createMockGetExecutionsByIdsResponse,
  createMockStepDataClient,
  createMockWorkflowDataClient,
} from './repositories/data_access_layer/mocks';
import type {
  WorkflowsExecutionEnginePluginSetup,
  WorkflowsExecutionEnginePluginStart,
} from './types';
import { createMockWorkflowEventLoggerService } from './workflow_event_logger/mocks';

export {
  createMockGetExecutionsByIdsResponse,
  createMockStepDataClient,
  createMockWorkflowDataClient,
};

export const workflowsExecutionEngineMock = {
  createSetup: jest.fn().mockReturnValue({} as jest.Mocked<WorkflowsExecutionEnginePluginSetup>),
  createStart: jest.fn().mockReturnValue({
    supportsSynchronousExecution: true,
    __internalStorage: {
      workflowExecutionsDataClient: createMockWorkflowDataClient(),
      stepExecutionsDataClient: createMockStepDataClient(),
    },
    workflowEventLoggerService: createMockWorkflowEventLoggerService(),
    executeWorkflow: jest.fn(),
    executeWorkflowStep: jest.fn(),
    cancelWorkflowExecution: jest.fn(),
    cancelAllActiveWorkflowExecutions: jest.fn().mockResolvedValue(undefined),
    resumeWorkflowExecution: jest.fn(),
    scheduleWorkflow: jest.fn(),
    bulkScheduleWorkflow: jest.fn(),
    triggerEvents: {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      isEnabled: true,
      isLogEventsEnabled: true,
      maxEventChainDepth: 10,
      searchTriggerEventLog: jest.fn().mockResolvedValue({
        hits: [],
        total: 0,
        page: 1,
        size: 10,
      }),
    },
    config: {
      maxWorkflowDepth: 10,
    },
  } as jest.Mocked<WorkflowsExecutionEnginePluginStart>),
};
