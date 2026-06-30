/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowApi } from './workflows_api';

export type MockWorkflowApi = jest.Mocked<WorkflowApi>;

export const createMockWorkflowApi = (): MockWorkflowApi =>
  ({
    getWorkflows: jest.fn(),
    getWorkflow: jest.fn(),
    createWorkflow: jest.fn(),
    updateWorkflow: jest.fn(),
    deleteWorkflow: jest.fn(),

    bulkCreateWorkflows: jest.fn(),
    bulkDeleteWorkflows: jest.fn(),
    mgetWorkflows: jest.fn(),

    cloneWorkflow: jest.fn(),
    validateWorkflow: jest.fn(),
    exportWorkflows: jest.fn(),
    getStats: jest.fn(),
    getAggs: jest.fn(),
    getConnectors: jest.fn(),
    getSchema: jest.fn(),

    runWorkflow: jest.fn(),
    testWorkflow: jest.fn(),
    testStep: jest.fn(),
    getWorkflowExecutions: jest.fn(),
    getWorkflowStepExecutions: jest.fn(),
    getExecution: jest.fn(),
    cancelExecution: jest.fn(),
    cancelAllWorkflowExecutions: jest.fn(),
    getStepExecution: jest.fn(),
    resumeExecution: jest.fn(),
    getExecutionLogs: jest.fn(),
    getChildrenExecutions: jest.fn(),

    getConfig: jest.fn(),
    searchTriggerEvents: jest.fn(),
    restoreWorkflowVersion: jest.fn(),
  } as unknown as MockWorkflowApi);
