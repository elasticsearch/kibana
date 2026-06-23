/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RuleExecutionPipeline } from './execution_pipeline';
import type { RulePipelineState } from './types';
import type { RuleExecutionMiddleware } from './middleware';
import { createLoggerService } from '../services/logger_service/logger_service.mock';
import { pipeStream } from './stream_utils';
import {
  createRuleExecutionPipelineInput,
  createMockStep,
  createQueryPayload,
  createRuleResponse,
} from './test_utils';

describe('RuleExecutionPipeline', () => {
  describe('execute', () => {
    it('executes all steps in order when all continue', async () => {
      const { loggerService } = createLoggerService();
      const executionOrder: string[] = [];

      const step1 = createMockStep('step1', (input) =>
        pipeStream(input, (state) => {
          executionOrder.push('step1');
          return { type: 'continue', state };
        })
      );

      const step2 = createMockStep('step2', (input) =>
        pipeStream(input, (state) => {
          executionOrder.push('step2');
          return { type: 'continue', state };
        })
      );

      const step3 = createMockStep('step3', (input) =>
        pipeStream(input, (state) => {
          executionOrder.push('step3');
          return { type: 'continue', state };
        })
      );

      const pipeline = new RuleExecutionPipeline(loggerService, [step1, step2, step3], []);
      const input = createRuleExecutionPipelineInput();

      const result = await pipeline.execute(input);

      expect(result.completed).toBe(true);
      expect(result.haltReason).toBeUndefined();
      expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
    });

    it('stops execution when a step returns halt', async () => {
      const { loggerService } = createLoggerService();
      const executionOrder: string[] = [];

      const step1 = createMockStep('step1', (input) =>
        pipeStream(input, (state) => {
          executionOrder.push('step1');
          return { type: 'continue', state };
        })
      );

      const step2 = createMockStep('step2', (input) =>
        pipeStream(input, (state) => {
          executionOrder.push('step2');
          return { type: 'halt', reason: 'rule_deleted', state };
        })
      );

      const step3 = createMockStep('step3', (input) =>
        pipeStream(input, (state) => {
          executionOrder.push('step3');
          return { type: 'continue', state };
        })
      );

      const pipeline = new RuleExecutionPipeline(loggerService, [step1, step2, step3], []);
      const input = createRuleExecutionPipelineInput();

      const result = await pipeline.execute(input);

      expect(result.completed).toBe(false);
      expect(result.haltReason).toBe('rule_deleted');
      // step3 handler was never invoked even though executeStream was called during chain construction
      expect(executionOrder).toEqual(['step1', 'step2']);
    });

    it('accumulates state across steps correctly', async () => {
      const { loggerService } = createLoggerService();
      const statesReceived: RulePipelineState[] = [];

      const step1 = createMockStep('step1', (input) =>
        pipeStream(input, (state) => {
          statesReceived.push({ ...state });
          return { type: 'continue', state: { ...state, rule: createRuleResponse() } };
        })
      );

      const step2 = createMockStep('step2', (input) =>
        pipeStream(input, (state) => {
          statesReceived.push({ ...state });
          return { type: 'continue', state: { ...state, queryPayload: createQueryPayload() } };
        })
      );

      const step3 = createMockStep('step3', (input) =>
        pipeStream(input, (state) => {
          statesReceived.push({ ...state });
          return { type: 'continue', state };
        })
      );

      const pipeline = new RuleExecutionPipeline(loggerService, [step1, step2, step3], []);
      const input = createRuleExecutionPipelineInput();

      const result = await pipeline.execute(input);

      // Step 1 receives only input (with executionContext created by pipeline)
      expect(statesReceived[0].input.ruleId).toBe(input.ruleId);
      expect(statesReceived[0].input.executionContext).toBeDefined();
      expect(statesReceived[0].rule).toBeUndefined();

      // Step 2 receives input + rule from step 1
      expect(statesReceived[1].input.ruleId).toBe(input.ruleId);
      expect(statesReceived[1].rule).toBeDefined();
      expect(statesReceived[1].queryPayload).toBeUndefined();

      // Step 3 receives input + rule + queryPayload
      expect(statesReceived[2].input.ruleId).toBe(input.ruleId);
      expect(statesReceived[2].rule).toBeDefined();
      expect(statesReceived[2].queryPayload).toBeDefined();

      // Final state includes all accumulated data
      expect(result.finalState.rule).toBeDefined();
      expect(result.finalState.queryPayload).toBeDefined();
    });

    it('propagates errors from steps', async () => {
      const { loggerService } = createLoggerService();
      const error = new Error('Step failed');

      const step1 = createMockStep('step1', (input) =>
        pipeStream(input, () => {
          throw error;
        })
      );

      const step2 = createMockStep('step2', (input) =>
        pipeStream(input, (state) => ({ type: 'continue', state }))
      );

      const pipeline = new RuleExecutionPipeline(loggerService, [step1, step2], []);
      const input = createRuleExecutionPipelineInput();

      await expect(pipeline.execute(input)).rejects.toThrow('Step failed');
    });

    it('returns empty completed result when no steps', async () => {
      const { loggerService } = createLoggerService();
      const pipeline = new RuleExecutionPipeline(loggerService, [], []);
      const input = createRuleExecutionPipelineInput();

      const result = await pipeline.execute(input);

      expect(result.completed).toBe(true);
      expect(result.finalState.input.ruleId).toBe(input.ruleId);
      expect(result.finalState.input.executionContext).toBeDefined();
    });

    it('executes middleware chain around each step', async () => {
      const { loggerService } = createLoggerService();
      const executionOrder: string[] = [];

      const middleware1: RuleExecutionMiddleware = {
        name: 'middleware1',
        execute: (ctx, next, stream) => {
          executionOrder.push(`middleware1:before:${ctx.step.name}`);
          const output = next(stream);
          return (async function* () {
            for await (const result of output) {
              executionOrder.push(`middleware1:after:${ctx.step.name}`);
              yield result;
            }
          })();
        },
      };

      const middleware2: RuleExecutionMiddleware = {
        name: 'middleware2',
        execute: (ctx, next, stream) => {
          executionOrder.push(`middleware2:before:${ctx.step.name}`);
          const output = next(stream);
          return (async function* () {
            for await (const result of output) {
              executionOrder.push(`middleware2:after:${ctx.step.name}`);
              yield result;
            }
          })();
        },
      };

      const step1 = createMockStep('step1', (input) =>
        pipeStream(input, (state) => {
          executionOrder.push('step1:execute');
          return { type: 'continue', state };
        })
      );

      const pipeline = new RuleExecutionPipeline(
        loggerService,
        [step1],
        [middleware1, middleware2]
      );
      const input = createRuleExecutionPipelineInput();

      await pipeline.execute(input);

      // Middleware1 is outermost, middleware2 is inner, step is innermost
      expect(executionOrder).toEqual([
        'middleware1:before:step1',
        'middleware2:before:step1',
        'step1:execute',
        'middleware2:after:step1',
        'middleware1:after:step1',
      ]);
    });

    it('creates ExecutionContext and attaches it to pipeline state', async () => {
      const { loggerService } = createLoggerService();

      const step = createMockStep('step1', (input) =>
        pipeStream(input, (state) => {
          expect(state.input.executionContext).toBeDefined();
          expect(typeof state.input.executionContext.throwIfAborted).toBe('function');
          expect(typeof state.input.executionContext.createScope).toBe('function');
          expect(typeof state.input.executionContext.onAbort).toBe('function');
          expect(state.input.executionContext.signal).toBeDefined();
          return { type: 'continue', state };
        })
      );

      const pipeline = new RuleExecutionPipeline(loggerService, [step], []);
      const input = createRuleExecutionPipelineInput();

      const result = await pipeline.execute(input);

      expect(result.completed).toBe(true);
      expect(result.finalState.input.executionContext).toBeDefined();
    });

    it('uses the abort signal from pipeline input for the execution context', async () => {
      const { loggerService } = createLoggerService();
      const abortController = new AbortController();

      const step = createMockStep('step1', (input) =>
        pipeStream(input, (state) => {
          expect(state.input.executionContext.signal).toBe(abortController.signal);
          return { type: 'continue', state };
        })
      );

      const pipeline = new RuleExecutionPipeline(loggerService, [step], []);
      const input = createRuleExecutionPipelineInput({ abortSignal: abortController.signal });

      await pipeline.execute(input);
    });

    it('middleware can intercept errors', async () => {
      const { loggerService } = createLoggerService();
      const errorHandlerCalled = jest.fn();

      const errorMiddleware: RuleExecutionMiddleware = {
        name: 'error_handler',
        execute: (_ctx, next, stream) => {
          const output = next(stream);
          return (async function* () {
            try {
              yield* output;
            } catch (error) {
              errorHandlerCalled(error);
              throw error;
            }
          })();
        },
      };

      const step1 = createMockStep('step1', (input) =>
        pipeStream(input, () => {
          throw new Error('Step error');
        })
      );

      const pipeline = new RuleExecutionPipeline(loggerService, [step1], [errorMiddleware]);
      const input = createRuleExecutionPipelineInput();

      await expect(pipeline.execute(input)).rejects.toThrow('Step error');
      expect(errorHandlerCalled).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
