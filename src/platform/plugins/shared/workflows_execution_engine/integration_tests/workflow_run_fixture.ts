/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import YAML from 'yaml';
import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { EsWorkflowExecution, WorkflowYaml } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { StepExecutionRepositoryMock, WorkflowExecutionRepositoryMock } from './mocks';
import { ScopedActionsClientMock, UnsecuredActionsClientMock } from './mocks/actions_plugin_mock';
import { TaskManagerMock } from './mocks/task_manager.mock';
import type { WorkflowsExecutionEngineConfig } from '../server/config';
import { resumeWorkflow } from '../server/execution_functions';
import { mockContextDependencies } from '../server/execution_functions/__mock__/context_dependencies';
import { createMockWorkflowExecutionEngineConfig } from '../server/execution_functions/execution_functions_test_utils';
import { runWorkflow } from '../server/execution_functions/run_workflow';
import { workflowsExecutionEngineMock } from '../server/mocks';

// Mock the repository classes so setupDependencies uses our mocks
jest.mock('../server/repositories/workflow_execution_repository');
jest.mock('../server/repositories/step_execution_repository');

export class WorkflowRunFixture {
  public readonly taskAbortController = new AbortController();
  public readonly dependencies = mockContextDependencies();
  public readonly loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  } as unknown as Logger;
  // Create shared execute mock so tests can verify calls regardless of which client is used
  private readonly sharedExecuteMock = jest.fn();
  public readonly unsecuredActionsClientMock = new UnsecuredActionsClientMock();
  public readonly scopedActionsClientMock = new ScopedActionsClientMock();
  public readonly actionsClientMock = jest.mocked<ActionsPluginStartContract>({
    getUnsecuredActionsClient: jest.fn().mockReturnValue(this.unsecuredActionsClientMock),
    getActionsClientWithRequest: jest.fn().mockResolvedValue(this.scopedActionsClientMock),
  } as unknown as ActionsPluginStartContract);
  public readonly configMock: WorkflowsExecutionEngineConfig =
    createMockWorkflowExecutionEngineConfig();
  public readonly fakeKibanaRequest = {} as KibanaRequest;
  public readonly workflowExecutionRepositoryMock = new WorkflowExecutionRepositoryMock();
  public readonly stepExecutionRepositoryMock = new StepExecutionRepositoryMock();
  public readonly taskManagerMock = TaskManagerMock.create();
  public readonly workflowsExecutionEngineMock = workflowsExecutionEngineMock.createStart();
  public readonly internalResumeWorkflowExecutionMock = jest.fn().mockResolvedValue(undefined);

  constructor() {
    // Mock repository constructors to return our mock instances
    const workflowRepoModule = jest.requireMock(
      '../server/repositories/workflow_execution_repository'
    );
    const stepRepoModule = jest.requireMock('../server/repositories/step_execution_repository');
    (workflowRepoModule.WorkflowExecutionRepository as jest.Mock).mockImplementation(
      () => this.workflowExecutionRepositoryMock
    );
    (stepRepoModule.StepExecutionRepository as jest.Mock).mockImplementation(
      () => this.stepExecutionRepositoryMock
    );

    // Wire both clients to use the same shared execute mock with normalized parameters
    this.unsecuredActionsClientMock.execute = this.sharedExecuteMock.mockImplementation((options) =>
      this.unsecuredActionsClientMock.returnMockedConnectorResult(options)
    );
    this.scopedActionsClientMock.execute = this.sharedExecuteMock.mockImplementation((options) => {
      const normalizedOptions = { ...options, id: options.actionId };
      this.sharedExecuteMock.mock.calls[this.sharedExecuteMock.mock.calls.length - 1][0] =
        normalizedOptions;
      return this.scopedActionsClientMock.returnMockedConnectorResult(options);
    });

    this.dependencies.actions = this.actionsClientMock;
    this.dependencies.taskManager = this.taskManagerMock;
  }

  public runWorkflow({
    workflowYaml,
    inputs,
    event,
  }: {
    workflowYaml: string;
    inputs?: Record<string, unknown>;
    event?: Record<string, unknown>;
  }) {
    // clean up before running workflow
    this.cleanup();
    const workflowDefinition = YAML.parseDocument(workflowYaml).toJSON() as WorkflowYaml;
    const workflowExecution: Partial<EsWorkflowExecution> = {
      id: 'fake_workflow_execution_id',
      spaceId: 'fake_space_id',
      workflowId: 'fake_foreach_id',
      isTestRun: false,
      workflowDefinition,
      context: {
        inputs,
        event,
      },
      status: ExecutionStatus.PENDING,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      triggeredBy: 'system', // <-- new field for scheduled workflows
    };
    this.workflowExecutionRepositoryMock.workflowExecutions.set(
      'fake_workflow_execution_id',
      workflowExecution as EsWorkflowExecution
    );
    return runWorkflow({
      workflowRunId: 'fake_workflow_execution_id',
      spaceId: 'fake_space_id',
      taskAbortController: this.taskAbortController,
      dependencies: this.dependencies,
      logger: this.loggerMock,
      config: this.configMock,
      fakeRequest: this.fakeKibanaRequest,
      workflowsExecutionEngine: this.workflowsExecutionEngineMock,
      internalResumeWorkflowExecution: this.internalResumeWorkflowExecutionMock,
    });
  }

  public resumeWorkflow() {
    return resumeWorkflow({
      workflowRunId: 'fake_workflow_execution_id',
      spaceId: 'fake_space_id',
      taskAbortController: this.taskAbortController,
      logger: this.loggerMock,
      config: this.configMock,
      fakeRequest: this.fakeKibanaRequest,
      dependencies: this.dependencies,
      workflowsExecutionEngine: this.workflowsExecutionEngineMock,
      internalResumeWorkflowExecution: this.internalResumeWorkflowExecutionMock,
    });
  }

  public runSingleStep({
    workflowYaml,
    stepId,
    contextOverride,
  }: {
    workflowYaml: string;
    stepId: string;
    contextOverride?: Record<string, unknown>;
  }) {
    // clean up before running workflow
    this.cleanup();
    const workflowDefinition = YAML.parseDocument(workflowYaml).toJSON() as WorkflowYaml;
    const workflowExecution: Partial<EsWorkflowExecution> = {
      id: 'fake_workflow_execution_id',
      spaceId: 'fake_space_id',
      stepId,
      workflowId: 'fake_foreach_id',
      isTestRun: false,
      workflowDefinition,
      context: {
        contextOverride,
      },
      status: ExecutionStatus.PENDING,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      triggeredBy: 'system', // <-- new field for scheduled workflows
    };
    this.workflowExecutionRepositoryMock.workflowExecutions.set(
      'fake_workflow_execution_id',
      workflowExecution as EsWorkflowExecution
    );
    return runWorkflow({
      workflowRunId: 'fake_workflow_execution_id',
      spaceId: 'fake_space_id',
      taskAbortController: this.taskAbortController,
      dependencies: this.dependencies,
      logger: this.loggerMock,
      config: this.configMock,
      fakeRequest: this.fakeKibanaRequest,
      workflowsExecutionEngine: this.workflowsExecutionEngineMock,
      internalResumeWorkflowExecution: this.internalResumeWorkflowExecutionMock,
    });
  }

  private cleanup() {
    jest.clearAllMocks();
    this.workflowExecutionRepositoryMock.workflowExecutions.clear();
    this.stepExecutionRepositoryMock.stepExecutions.clear();
  }
}
