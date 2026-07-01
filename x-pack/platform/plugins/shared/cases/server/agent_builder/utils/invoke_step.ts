/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import type {
  ServerHandlerStepDefinition,
  StepHandlerContext,
} from '@kbn/workflows-extensions/server';

/**
 * Invokes a Cases workflow step handler from an agent builder tool context.
 *
 * Builds a minimal StepHandlerContext stub — Cases step handlers only access
 * `contextManager.getFakeRequest()`, `context.input`, `context.config`, and `context.logger`.
 */
export async function invokeStepHandler(
  stepDef: ServerHandlerStepDefinition,
  input: Record<string, unknown>,
  toolContext: ToolHandlerContext,
  extraConfig: Record<string, unknown> = {}
) {
  const fakeContextManager = {
    getFakeRequest: () => toolContext.request,
    getContext: () => {
      throw new Error('getContext is not available in the agent builder execution context');
    },
    getScopedEsClient: () => {
      throw new Error('getScopedEsClient is not available in the agent builder execution context');
    },
    renderInputTemplate: <T>(v: T) => v,
    callKibanaApi: () => {
      throw new Error('callKibanaApi is not available in the agent builder execution context');
    },
  };

  const fakeStepCtx = {
    input,
    config: { 'push-case': false, ...extraConfig },
    rawInput: input,
    contextManager: fakeContextManager,
    logger: toolContext.logger,
    // ToolHandlerContext does not expose an AbortSignal, so step handlers
    // cannot be cancelled when the HTTP request is aborted. Using a fresh
    // (never-aborted) signal satisfies the StepHandlerContext type contract.
    abortSignal: new AbortController().signal,
    stepId: stepDef.id,
    stepType: stepDef.id,
  } as StepHandlerContext;

  const result = await stepDef.handler(fakeStepCtx);

  if (result.error) {
    throw result.error;
  }

  return { results: [{ type: 'other' as const, data: result.output ?? {} }] };
}
