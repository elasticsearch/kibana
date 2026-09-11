/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { elasticsearchServiceMock, httpServerMock } from '@kbn/core/server/mocks';
import type { StepContext } from '@kbn/workflows';
import type {
  BaseHandlerNode,
  BaseHandlerStepExecutionRuntime,
  BaseHandlerWorkflowLogger,
} from '../create_base_handler_context';
import { DURABLE_STEP_STATE_KEY, type DurableStepState } from '../durable_step_state';

export { DURABLE_STEP_STATE_KEY, type DurableStepState };

export const getDurableState = (persisted: Record<string, unknown> | undefined): DurableStepState =>
  (persisted?.[DURABLE_STEP_STATE_KEY] ?? {}) as DurableStepState;

export interface TestNode extends BaseHandlerNode {
  configuration: {
    with?: Record<string, unknown>;
    'max-step-size'?: undefined;
  };
}

export const defaultTestNode = {
  stepId: 'custom-step',
  stepType: 'my-custom-type',
  configuration: { with: { key: 'value' }, 'max-step-size': undefined },
} satisfies TestNode;

export const createHandlerTestMocks = (initialPersistedState?: Record<string, unknown>) => {
  const persistedState: { value: Record<string, unknown> | undefined } = {
    value: initialPersistedState,
  };

  const renderValueAccordingToContext = jest.fn();
  const stepContext: StepContext = {
    execution: {
      id: 'workflow-execution-1',
      isTestRun: false,
      startedAt: new Date(0),
      url: '',
    },
    workflow: {
      id: 'workflow-1',
      name: 'Test workflow',
      enabled: true,
      spaceId: 'default',
    },
    kibanaUrl: '',
    steps: {},
  };
  const baseHandlerStepExecutionRuntime = {
    contextManager: {
      renderValueAccordingToContext: <T>(value: T, additionalContext?: Record<string, unknown>) => {
        renderValueAccordingToContext(value, additionalContext);
        return value;
      },
      getContext: jest.fn(() => stepContext),
      getEsClientAsUser: jest.fn(() => elasticsearchServiceMock.createElasticsearchClient()),
      getFakeRequest: jest.fn(() => httpServerMock.createKibanaRequest()),
      getExecutionCapabilities: jest.fn(() => undefined),
      callKibanaApi: jest.fn(),
    },
    abortController: new AbortController(),
  } satisfies BaseHandlerStepExecutionRuntime;
  const stepExecutionRuntime = {
    ...baseHandlerStepExecutionRuntime,
    node: { configuration: { with: { key: 'value' } } },
    startStep: jest.fn(),
    flushEventLogs: jest.fn().mockResolvedValue(undefined),
    finishStep: jest.fn(),
    failStep: jest.fn(),
    setInput: jest.fn(),
    stepExecutionId: 'step-exec-1',
    workflowExecution: { workflowDefinition: {} },
    getCurrentStepState: jest.fn(() => persistedState.value),
    setCurrentStepState: jest.fn((state: Record<string, unknown> | undefined) => {
      persistedState.value = state;
    }),
    enterWaitUntil: jest.fn(),
  };

  const workflowLogger = {
    logInfo: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn(),
    logWarn: jest.fn(),
  } satisfies BaseHandlerWorkflowLogger;

  return {
    stepExecutionRuntime,
    workflowLogger,
    persistedState,
    renderValueAccordingToContext,
  };
};
