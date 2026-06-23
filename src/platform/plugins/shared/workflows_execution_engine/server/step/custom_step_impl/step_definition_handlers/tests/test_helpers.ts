/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DURABLE_STEP_STATE_KEY, type DurableStepState } from '../durable_step_state';

export { DURABLE_STEP_STATE_KEY, type DurableStepState };

export const getDurableState = (persisted: Record<string, unknown> | undefined): DurableStepState =>
  (persisted?.[DURABLE_STEP_STATE_KEY] ?? {}) as DurableStepState;

export interface TestNode {
  stepId: string;
  stepType: string;
  configuration: {
    with?: Record<string, unknown>;
    'max-step-size'?: undefined;
  };
}

export const defaultTestNode: TestNode = {
  stepId: 'custom-step',
  stepType: 'my-custom-type',
  configuration: { with: { key: 'value' }, 'max-step-size': undefined },
};

export const createHandlerTestMocks = (initialPersistedState?: Record<string, unknown>) => {
  const persistedState: { value: Record<string, unknown> | undefined } = {
    value: initialPersistedState,
  };

  const stepExecutionRuntime = {
    contextManager: {
      renderValueAccordingToContext: jest.fn((v: unknown) => v),
      getContext: jest.fn(() => ({})),
      getEsClientAsUser: jest.fn(() => ({})),
      getFakeRequest: jest.fn(() => null),
      callKibanaApi: jest.fn(),
    },
    abortController: new AbortController(),
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
  };

  return {
    stepExecutionRuntime,
    workflowLogger,
    persistedState,
  };
};
