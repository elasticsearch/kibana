/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ServerSentEventError } from '@kbn/sse-utils';
import { AgentExecutionErrorCode } from '../agents/execution_errors';
import type { ExecutionErrorMetaOf } from '../agents/execution_errors';
import type { HookExecutionMode, HookLifecycle } from '../hooks/lifecycle';

/**
 * Code to identify agentBuilder errors
 */
export enum AgentBuilderErrorCode {
  internalError = 'internalError',
  badRequest = 'badRequest',
  toolNotFound = 'toolNotFound',
  skillNotFound = 'skillNotFound',
  agentNotFound = 'agentNotFound',
  agentUnavailable = 'agentUnavailable',
  conversationNotFound = 'conversationNotFound',
  pluginNotFound = 'pluginNotFound',
  agentExecutionError = 'agentExecutionError',
  requestAborted = 'requestAborted',
  hookExecutionError = 'hookExecutionError',
  workflowAborted = 'workflowAborted',
  workflowExecutionFailed = 'workflowExecutionFailed',
}

const AgentBuilderError = ServerSentEventError;

/**
 * Base error class used for all agentBuilder errors.
 */
export type AgentBuilderError<
  TCode extends AgentBuilderErrorCode,
  TMeta extends Record<string, any> = Record<string, any>
> = ServerSentEventError<TCode, TMeta>;

export type SerializedAgentBuilderError = ReturnType<
  AgentBuilderError<AgentBuilderErrorCode>['toJSON']
>;

export const isAgentBuilderError = (
  err: unknown
): err is AgentBuilderError<AgentBuilderErrorCode> => {
  return err instanceof AgentBuilderError;
};

export const createAgentBuilderError = (
  errorCode: AgentBuilderErrorCode,
  message: string,
  meta?: Record<string, any>
): AgentBuilderError<AgentBuilderErrorCode> => {
  return new AgentBuilderError(errorCode, message, meta ?? {});
};

/**
 * Represents an internal error
 */
export type AgentBuilderInternalError = AgentBuilderError<AgentBuilderErrorCode.internalError>;

/**
 * Checks if the given error is a {@link AgentBuilderInternalError}
 */
export const isInternalError = (err: unknown): err is AgentBuilderInternalError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.internalError;
};

export const createInternalError = (
  message: string,
  meta?: Record<string, any>
): AgentBuilderInternalError => {
  return new AgentBuilderError(AgentBuilderErrorCode.internalError, message, meta ?? {});
};

/**
 * Represents a generic bad request error
 */
export type AgentBuilderBadRequestError = AgentBuilderError<AgentBuilderErrorCode.badRequest>;

/**
 * Checks if the given error is a {@link AgentBuilderInternalError}
 */
export const isBadRequestError = (err: unknown): err is AgentBuilderBadRequestError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.badRequest;
};

export const createBadRequestError = (
  message: string,
  meta: Record<string, any> = {}
): AgentBuilderBadRequestError => {
  return new AgentBuilderError(AgentBuilderErrorCode.badRequest, message, {
    ...meta,
    statusCode: 400,
  });
};

/**
 * Error thrown when trying to retrieve or execute a tool not present or available in the current context.
 */
export type AgentBuilderToolNotFoundError = AgentBuilderError<AgentBuilderErrorCode.toolNotFound>;

/**
 * Checks if the given error is a {@link AgentBuilderToolNotFoundError}
 */
export const isToolNotFoundError = (err: unknown): err is AgentBuilderToolNotFoundError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.toolNotFound;
};

export const createToolNotFoundError = ({
  toolId,
  customMessage,
  meta = {},
}: {
  toolId: string;
  customMessage?: string;
  meta?: Record<string, any>;
}): AgentBuilderToolNotFoundError => {
  return new AgentBuilderError(
    AgentBuilderErrorCode.toolNotFound,
    customMessage ?? `Tool ${toolId} not found`,
    { ...meta, toolId, statusCode: 404 }
  );
};

/**
 * Error thrown when trying to retrieve a skill not present or available in the current context.
 */
export type AgentBuilderSkillNotFoundError = AgentBuilderError<AgentBuilderErrorCode.skillNotFound>;

/**
 * Checks if the given error is a {@link AgentBuilderSkillNotFoundError}
 */
export const isSkillNotFoundError = (err: unknown): err is AgentBuilderSkillNotFoundError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.skillNotFound;
};

export const createSkillNotFoundError = ({
  skillId,
  customMessage,
  meta = {},
}: {
  skillId: string;
  customMessage?: string;
  meta?: Record<string, any>;
}): AgentBuilderSkillNotFoundError => {
  return new AgentBuilderError(
    AgentBuilderErrorCode.skillNotFound,
    customMessage ?? `Skill ${skillId} not found`,
    { ...meta, skillId, statusCode: 404 }
  );
};

/**
 * Error thrown when trying to retrieve an agent not present in the current context.
 */
export type AgentBuilderAgentNotFoundError = AgentBuilderError<AgentBuilderErrorCode.agentNotFound>;

/**
 * Checks if the given error is a {@link AgentBuilderInternalError}
 */
export const isAgentNotFoundError = (err: unknown): err is AgentBuilderAgentNotFoundError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.agentNotFound;
};

export const createAgentNotFoundError = ({
  agentId,
  customMessage,
  meta = {},
}: {
  agentId: string;
  customMessage?: string;
  meta?: Record<string, any>;
}): AgentBuilderAgentNotFoundError => {
  return new AgentBuilderError(
    AgentBuilderErrorCode.agentNotFound,
    customMessage ?? `Agent ${agentId} not found`,
    { ...meta, agentId, statusCode: 404 }
  );
};

/**
 * Error thrown when trying to retrieve an agent that exists but is not currently available.
 */
export type AgentBuilderAgentUnavailableError =
  AgentBuilderError<AgentBuilderErrorCode.agentUnavailable>;

export const isAgentUnavailableError = (
  err: unknown,
  _agentId?: string
): err is AgentBuilderAgentUnavailableError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.agentUnavailable;
};

export const createAgentUnavailableError = ({
  agentId,
  customMessage,
  meta = {},
}: {
  agentId: string;
  customMessage?: string;
  meta?: Record<string, any>;
}): AgentBuilderAgentUnavailableError => {
  return new AgentBuilderError(
    AgentBuilderErrorCode.agentUnavailable,
    customMessage ?? `Agent ${agentId} is not available`,
    { ...meta, agentId, statusCode: 400 }
  );
};

/**
 * Error thrown when trying to retrieve or execute a tool not present or available in the current context.
 */
export type AgentBuilderConversationNotFoundError =
  AgentBuilderError<AgentBuilderErrorCode.conversationNotFound>;

/**
 * Checks if the given error is a {@link AgentBuilderConversationNotFoundError}
 */
export const isConversationNotFoundError = (
  err: unknown
): err is AgentBuilderConversationNotFoundError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.conversationNotFound;
};

export const createConversationNotFoundError = ({
  conversationId,
  customMessage,
  meta = {},
}: {
  conversationId: string;
  customMessage?: string;
  meta?: Record<string, any>;
}): AgentBuilderConversationNotFoundError => {
  return new AgentBuilderError(
    AgentBuilderErrorCode.conversationNotFound,
    customMessage ?? `Conversation ${conversationId} not found`,
    { ...meta, conversationId, statusCode: 404 }
  );
};

/**
 * Error thrown when trying to retrieve a plugin not present in the current context.
 */
export type AgentBuilderPluginNotFoundError =
  AgentBuilderError<AgentBuilderErrorCode.pluginNotFound>;

/**
 * Checks if the given error is a {@link AgentBuilderPluginNotFoundError}
 */
export const isPluginNotFoundError = (err: unknown): err is AgentBuilderPluginNotFoundError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.pluginNotFound;
};

export const createPluginNotFoundError = ({
  pluginId,
  customMessage,
  meta = {},
}: {
  pluginId: string;
  customMessage?: string;
  meta?: Record<string, any>;
}): AgentBuilderPluginNotFoundError => {
  return new AgentBuilderError(
    AgentBuilderErrorCode.pluginNotFound,
    customMessage ?? `Plugin ${pluginId} not found`,
    { ...meta, pluginId, statusCode: 404 }
  );
};

/**
 * Represents an internal error
 */
export type AgentBuilderRequestAbortedError =
  AgentBuilderError<AgentBuilderErrorCode.requestAborted>;

/**
 * Checks if the given error is a {@link AgentBuilderRequestAbortedError}
 */
export const isRequestAbortedError = (err: unknown): err is AgentBuilderRequestAbortedError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.requestAborted;
};

export const createRequestAbortedError = (
  message: string,
  meta?: Record<string, any>
): AgentBuilderRequestAbortedError => {
  return new AgentBuilderError(AgentBuilderErrorCode.requestAborted, message, meta ?? {});
};

/**
 * Represents execution aborted by a workflow.
 */
export type AgentBuilderWorkflowAbortedError =
  AgentBuilderError<AgentBuilderErrorCode.workflowAborted>;

/**
 * Checks if the given error is a {@link AgentBuilderWorkflowAbortedError}
 */
export const isWorkflowAbortedError = (err: unknown): err is AgentBuilderWorkflowAbortedError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.workflowAborted;
};

/**
 * Represents an unexpected error in the workflow execution.
 */
export const createWorkflowAbortedError = (
  message: string,
  meta?: { workflow?: string }
): AgentBuilderWorkflowAbortedError => {
  return new AgentBuilderError(AgentBuilderErrorCode.workflowAborted, message, meta ?? {});
};

/**
 * Represents a workflow execution failure (workflow ran but finished with status FAILED).
 */
export type AgentBuilderWorkflowExecutionError =
  AgentBuilderError<AgentBuilderErrorCode.workflowExecutionFailed>;

/**
 * Checks if the given error is a {@link AgentBuilderWorkflowExecutionError}
 */
export const isWorkflowExecutionError = (
  err: unknown
): err is AgentBuilderWorkflowExecutionError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.workflowExecutionFailed;
};

/**
 * Creates an error when a workflow execution fails (e.g. step error, timeout).
 */
export const createWorkflowExecutionError = (
  message: string,
  meta?: { workflow?: string }
): AgentBuilderWorkflowExecutionError => {
  return new AgentBuilderError(AgentBuilderErrorCode.workflowExecutionFailed, message, meta ?? {});
};

/**
 * Represents an error related to agent execution
 */
export type AgentBuilderAgentExecutionError<
  ErrCode extends AgentExecutionErrorCode = AgentExecutionErrorCode
> = AgentBuilderError<
  AgentBuilderErrorCode.agentExecutionError,
  { errCode: ErrCode } & ExecutionErrorMetaOf<ErrCode>
>;

/**
 * Checks if the given error is a {@link AgentBuilderInternalError}
 */
export const isAgentExecutionError = (err: unknown): err is AgentBuilderAgentExecutionError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.agentExecutionError;
};

export const createAgentExecutionError = <ErrCode extends AgentExecutionErrorCode>(
  message: string,
  code: ErrCode,
  meta: ExecutionErrorMetaOf<ErrCode>
): AgentBuilderAgentExecutionError<ErrCode> => {
  return new AgentBuilderError(AgentBuilderErrorCode.agentExecutionError, message, {
    ...meta,
    errCode: code,
  });
};

/**
 * Checks if the given error is a context length exceeded error
 */
export const isContextLengthExceededAgentError = (
  err: unknown
): err is AgentBuilderAgentExecutionError<AgentExecutionErrorCode.contextLengthExceeded> => {
  return (
    isAgentExecutionError(err) && err.meta.errCode === AgentExecutionErrorCode.contextLengthExceeded
  );
};

/**
 * Represents an error related to hook execution
 */
export type AgentBuilderHooksExecutionError =
  AgentBuilderError<AgentBuilderErrorCode.hookExecutionError>;

export const createHooksExecutionError = (
  message: string,
  hookLifecycle: HookLifecycle,
  hookId: string,
  hookMode: HookExecutionMode,
  meta: Record<string, any> = {}
): AgentBuilderHooksExecutionError => {
  return new AgentBuilderError(AgentBuilderErrorCode.hookExecutionError, message, {
    ...meta,
    hookLifecycle,
    hookId,
    hookMode,
  });
};

/**
 * Checks if the given error is a {@link AgentBuilderHooksExecutionError}
 */
export const isHooksExecutionError = (err: unknown): err is AgentBuilderHooksExecutionError => {
  return isAgentBuilderError(err) && err.code === AgentBuilderErrorCode.hookExecutionError;
};

/**
 * Global utility exposing all error utilities from a single export.
 */
export const AgentBuilderErrorUtils = {
  isAgentBuilderError,
  isInternalError,
  isToolNotFoundError,
  isSkillNotFoundError,
  isAgentNotFoundError,
  isAgentUnavailableError,
  isConversationNotFoundError,
  isPluginNotFoundError,
  isWorkflowAbortedError,
  isWorkflowExecutionError,
  isAgentExecutionError,
  isContextLengthExceededAgentError,
  createInternalError,
  createToolNotFoundError,
  createSkillNotFoundError,
  createAgentNotFoundError,
  createAgentUnavailableError,
  createConversationNotFoundError,
  createPluginNotFoundError,
  createWorkflowAbortedError,
  createWorkflowExecutionError,
  createAgentExecutionError,
  createHooksExecutionError,
  isHooksExecutionError,
};
