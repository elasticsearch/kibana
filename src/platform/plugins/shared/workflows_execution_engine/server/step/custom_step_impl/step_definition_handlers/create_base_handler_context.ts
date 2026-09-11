/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AtomicGraphNode } from '@kbn/workflows/graph';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import type { StepExecutionRuntime } from '../../../workflow_context_manager/step_execution_runtime';
import type { IWorkflowEventLogger } from '../../../workflow_event_logger';

export type BaseHandlerNode = Pick<AtomicGraphNode, 'stepId' | 'stepType'>;
export interface BaseHandlerStepExecutionRuntime {
  abortController: StepExecutionRuntime['abortController'];
  contextManager: Pick<
    StepExecutionRuntime['contextManager'],
    | 'callKibanaApi'
    | 'getContext'
    | 'getEsClientAsUser'
    | 'getExecutionCapabilities'
    | 'getFakeRequest'
    | 'renderValueAccordingToContext'
  >;
}
export type BaseHandlerWorkflowLogger = Pick<
  IWorkflowEventLogger,
  'logDebug' | 'logError' | 'logInfo' | 'logWarn'
>;

export function createBaseHandlerContext(
  input: unknown,
  rawInput: unknown,
  config: Record<string, unknown>,
  node: BaseHandlerNode,
  stepExecutionRuntime: BaseHandlerStepExecutionRuntime,
  workflowLogger: BaseHandlerWorkflowLogger
): StepHandlerContext {
  return {
    input,
    rawInput: rawInput || {},
    config: config || {}, // TODO: pick only the config properties that are defined in the step definition
    contextManager: {
      getContext: () => {
        return stepExecutionRuntime.contextManager.getContext();
      },
      getScopedEsClient: () => {
        return stepExecutionRuntime.contextManager.getEsClientAsUser();
      },
      renderInputTemplate: (value, additionalContext) => {
        return stepExecutionRuntime.contextManager.renderValueAccordingToContext(
          value,
          additionalContext
        );
      },
      getFakeRequest: () => {
        return stepExecutionRuntime.contextManager.getFakeRequest();
      },
      callKibanaApi: (params) => {
        return stepExecutionRuntime.contextManager.callKibanaApi({
          ...params,
          signal: stepExecutionRuntime.abortController.signal,
        });
      },
    },
    logger: {
      debug: (message, meta) => workflowLogger.logDebug(message, meta),
      info: (message, meta) => workflowLogger.logInfo(message, meta),
      warn: (message, meta) => workflowLogger.logWarn(message, meta),
      error: (message, error) => workflowLogger.logError(message, error),
    },
    abortSignal: stepExecutionRuntime.abortController.signal,
    stepId: node.stepId,
    stepType: node.stepType,
    capabilities: stepExecutionRuntime.contextManager.getExecutionCapabilities(),
  };
}
