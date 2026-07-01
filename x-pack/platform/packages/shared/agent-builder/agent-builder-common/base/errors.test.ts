/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  isAgentBuilderError,
  createInternalError,
  createBadRequestError,
  createToolNotFoundError,
  isInternalError,
  isToolNotFoundError,
  AgentBuilderErrorCode,
  createAgentBuilderError,
  isAgentNotFoundError,
  isAgentUnavailableError,
  createAgentUnavailableError,
  createAgentNotFoundError,
  createHooksExecutionError,
  createWorkflowExecutionError,
  isHooksExecutionError,
  isWorkflowExecutionError,
} from './errors';
import { HookLifecycle, HookExecutionMode } from '../hooks/lifecycle';

describe('AgentBuilder errors', () => {
  describe('isAgentBuilderError', () => {
    it('should return true for a AgentBuilderError instance', () => {
      const error = createInternalError('test error');
      expect(isAgentBuilderError(error)).toBe(true);
    });

    it('should return false for a regular Error', () => {
      const error = new Error('test error');
      expect(isAgentBuilderError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isAgentBuilderError(null)).toBe(false);
      expect(isAgentBuilderError(undefined)).toBe(false);
      expect(isAgentBuilderError('string')).toBe(false);
      expect(isAgentBuilderError({})).toBe(false);
    });
  });

  describe('isInternalError', () => {
    it('should return true for an internal error', () => {
      const error = createInternalError('test error');
      expect(isInternalError(error)).toBe(true);
    });

    it('should return false for a tool not found error', () => {
      const error = createToolNotFoundError({ toolId: 'test-tool' });
      expect(isInternalError(error)).toBe(false);
    });

    it('should return false for a regular Error', () => {
      const error = new Error('test error');
      expect(isInternalError(error)).toBe(false);
    });
  });

  describe('isToolNotFoundError', () => {
    it('should return true for a tool not found error', () => {
      const error = createToolNotFoundError({ toolId: 'test-tool' });
      expect(isToolNotFoundError(error)).toBe(true);
    });

    it('should return false for an internal error', () => {
      const error = createInternalError('test error');
      expect(isToolNotFoundError(error)).toBe(false);
    });

    it('should return false for a regular Error', () => {
      const error = new Error('test error');
      expect(isToolNotFoundError(error)).toBe(false);
    });
  });

  describe('createInternalError', () => {
    it('should create an error with the correct code and message', () => {
      const error = createInternalError('test error');
      expect(error.code).toBe(AgentBuilderErrorCode.internalError);
      expect(error.message).toBe('test error');
    });

    it('should include optional metadata', () => {
      const meta = { foo: 'bar' };
      const error = createInternalError('test error', meta);
      expect(error.meta).toEqual(meta);
    });

    it('should use empty object as default metadata', () => {
      const error = createInternalError('test error');
      expect(error.meta).toEqual({});
    });
  });

  describe('createToolNotFoundError', () => {
    it('should create an error with the correct code and default message', () => {
      const error = createToolNotFoundError({ toolId: 'test-tool' });
      expect(error.code).toBe(AgentBuilderErrorCode.toolNotFound);
      expect(error.message).toBe(`Tool test-tool not found`);
      expect(error.meta).toEqual({
        toolId: 'test-tool',
        statusCode: 404,
      });
    });

    it('should use custom message when provided', () => {
      const error = createToolNotFoundError({
        toolId: 'test-tool',
        customMessage: 'Custom error message',
      });
      expect(error.message).toBe('Custom error message');
      expect(error.meta).toEqual({
        toolId: 'test-tool',
        statusCode: 404,
      });
    });
  });

  describe('createAgentBuilderError', () => {
    it('should create an error with the correct code and message', () => {
      const error = createAgentBuilderError(AgentBuilderErrorCode.internalError, 'test error');
      expect(error.code).toBe(AgentBuilderErrorCode.internalError);
      expect(error.message).toBe('test error');
    });

    it('should include optional metadata', () => {
      const meta = { foo: 'bar' };
      const error = createAgentBuilderError(
        AgentBuilderErrorCode.internalError,
        'test error',
        meta
      );
      expect(error.meta).toEqual(meta);
    });

    it('should use empty object as default metadata', () => {
      const error = createAgentBuilderError(AgentBuilderErrorCode.internalError, 'test error');
      expect(error.meta).toEqual({});
    });
  });

  describe('isAgentNotFoundError', () => {
    it('should return true for an agent not found error', () => {
      const error = createAgentNotFoundError({
        agentId: 'test-agent',
      });
      expect(isAgentNotFoundError(error)).toBe(true);
    });

    it('should return false for an internal error', () => {
      const error = createInternalError('test error');
      expect(isAgentNotFoundError(error)).toBe(false);
    });

    it('should return false for a regular Error', () => {
      const error = new Error('test error');
      expect(isAgentNotFoundError(error)).toBe(false);
    });
  });

  describe('isAgentUnavailableError', () => {
    it('should return true for an agent unavailable error regardless of message', () => {
      const error = createAgentUnavailableError({
        agentId: 'test-agent',
        customMessage: 'Custom unavailable message',
      });

      expect(isAgentUnavailableError(error, 'test-agent')).toBe(true);
    });

    it('should return false for a bad request with the legacy agent unavailable message', () => {
      const error = createBadRequestError('Agent test-agent is not available');

      expect(isAgentUnavailableError(error, 'test-agent')).toBe(false);
    });

    it('should return false for an agent not found error', () => {
      const error = createAgentNotFoundError({
        agentId: 'test-agent',
      });

      expect(isAgentUnavailableError(error, 'test-agent')).toBe(false);
    });
  });

  describe('createAgentNotFoundError', () => {
    it('should create an error with the correct code and default message', () => {
      const error = createAgentNotFoundError({
        agentId: 'test-agent',
      });
      expect(error.code).toBe(AgentBuilderErrorCode.agentNotFound);
      expect(error.message).toBe(`Agent test-agent not found`);
      expect(error.meta).toEqual({
        agentId: 'test-agent',
        statusCode: 404,
      });
    });

    it('should use custom message when provided', () => {
      const error = createAgentNotFoundError({
        agentId: 'test-agent',
        customMessage: 'Custom error message',
      });
      expect(error.message).toBe('Custom error message');
      expect(error.meta).toEqual({
        agentId: 'test-agent',
        statusCode: 404,
      });
    });

    it('should include additional metadata when provided', () => {
      const meta = { foo: 'bar' };
      const error = createAgentNotFoundError({
        agentId: 'test-agent',
        meta,
      });
      expect(error.meta).toEqual({
        agentId: 'test-agent',
        statusCode: 404,
        foo: 'bar',
      });
    });
  });

  describe('isHooksExecutionError', () => {
    it('should return true for a hooks execution error', () => {
      const error = createHooksExecutionError(
        'hook failed',
        HookLifecycle.beforeToolCall,
        'my-hook',
        HookExecutionMode.blocking
      );
      expect(isHooksExecutionError(error)).toBe(true);
    });

    it('should return false for an internal error', () => {
      const error = createInternalError('test error');
      expect(isHooksExecutionError(error)).toBe(false);
    });

    it('should return false for a regular Error', () => {
      const error = new Error('test error');
      expect(isHooksExecutionError(error)).toBe(false);
    });
  });

  describe('createHooksExecutionError', () => {
    it('should create an error with the correct code, message and hook metadata', () => {
      const error = createHooksExecutionError(
        'hook failed',
        HookLifecycle.beforeToolCall,
        'my-hook',
        HookExecutionMode.blocking
      );
      expect(error.code).toBe(AgentBuilderErrorCode.hookExecutionError);
      expect(error.message).toBe('hook failed');
      expect(error.meta).toEqual({
        hookLifecycle: HookLifecycle.beforeToolCall,
        hookId: 'my-hook',
        hookMode: HookExecutionMode.blocking,
      });
    });

    it('should merge optional meta with hook metadata', () => {
      const meta = { foo: 'bar' };
      const error = createHooksExecutionError(
        'hook failed',
        HookLifecycle.afterToolCall,
        'my-hook',
        HookExecutionMode.nonBlocking,
        meta
      );
      expect(error.meta).toEqual({
        foo: 'bar',
        hookLifecycle: HookLifecycle.afterToolCall,
        hookId: 'my-hook',
        hookMode: HookExecutionMode.nonBlocking,
      });
    });

    it('should use empty object as default metadata when meta is omitted', () => {
      const error = createHooksExecutionError(
        'hook failed',
        HookLifecycle.beforeAgent,
        'my-hook',
        HookExecutionMode.blocking
      );
      expect(error.meta).toEqual({
        hookLifecycle: HookLifecycle.beforeAgent,
        hookId: 'my-hook',
        hookMode: HookExecutionMode.blocking,
      });
    });
  });

  describe('isWorkflowExecutionError', () => {
    it('should return true for a workflow execution error', () => {
      const error = createWorkflowExecutionError('workflow failed', {
        workflow: 'workflow-1',
      });
      expect(isWorkflowExecutionError(error)).toBe(true);
    });

    it('should return false for a hooks execution error', () => {
      const error = createHooksExecutionError(
        'hook failed',
        HookLifecycle.beforeToolCall,
        'my-hook',
        HookExecutionMode.blocking
      );
      expect(isWorkflowExecutionError(error)).toBe(false);
    });
  });

  describe('createWorkflowExecutionError', () => {
    it('should create an error with the correct code and message', () => {
      const error = createWorkflowExecutionError('workflow failed', {
        workflow: 'workflow-1',
      });
      expect(error.code).toBe(AgentBuilderErrorCode.workflowExecutionFailed);
      expect(error.message).toBe('workflow failed');
      expect(error.meta).toEqual({ workflow: 'workflow-1' });
    });
  });
});
