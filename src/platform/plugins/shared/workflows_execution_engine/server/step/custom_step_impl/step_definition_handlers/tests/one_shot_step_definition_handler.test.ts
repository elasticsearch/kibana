/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHandlerTestMocks, defaultTestNode, type TestNode } from './test_helpers';
import type { CustomStepDefinitionHandler } from '../../types';
import { OneShotStepDefinitionHandler } from '../one_shot_step_definition_handler';

const buildHandler = (
  stepDefinition: { handler: jest.Mock; onCancel?: jest.Mock },
  mocks = createHandlerTestMocks(),
  node: TestNode = defaultTestNode
) =>
  new OneShotStepDefinitionHandler(
    stepDefinition as any,
    node as any,
    mocks.stepExecutionRuntime as any,
    mocks.workflowLogger as any
  );

describe('OneShotStepDefinitionHandler', () => {
  describe('run', () => {
    it('invokes the step handler with a context built from input, rawInput, and config', async () => {
      const handler = jest.fn().mockResolvedValue({ output: { result: 42 } });
      const stepHandler = buildHandler({ handler });

      const result = await stepHandler.run({ key: 'value' }, { key: 'value' }, {});

      expect(result.output).toEqual({ result: 42 });
      expect(result.error).toBeUndefined();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { key: 'value' },
          rawInput: { key: 'value' },
          config: {},
          stepId: 'custom-step',
          stepType: 'my-custom-type',
        })
      );
    });

    it('exposes callKibanaApi on the handler contextManager and forwards calls', async () => {
      const mocks = createHandlerTestMocks();
      mocks.stepExecutionRuntime.contextManager.callKibanaApi.mockResolvedValue({
        status: 200,
        headers: {},
        body: { ok: true },
      });

      let observedCallKibanaApi: unknown;
      const handler = jest.fn(async (ctx: { contextManager: { callKibanaApi: jest.Mock } }) => {
        observedCallKibanaApi = ctx.contextManager.callKibanaApi;
        const apiResult = await ctx.contextManager.callKibanaApi({
          method: 'GET',
          path: '/api/status',
        });
        return { output: apiResult };
      });
      const stepHandler = buildHandler({ handler }, mocks);

      const result = await stepHandler.run({}, {}, {});

      expect(typeof observedCallKibanaApi).toBe('function');
      expect(mocks.stepExecutionRuntime.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'GET',
        path: '/api/status',
        signal: mocks.stepExecutionRuntime.abortController.signal,
      });
      expect(result.output).toEqual({ status: 200, headers: {}, body: { ok: true } });
    });

    it('serializes handler errors into the run result', async () => {
      const handler = jest
        .fn()
        .mockResolvedValue({ output: undefined, error: new Error('handler error') });
      const stepHandler = buildHandler({ handler });

      const result = await stepHandler.run({}, {}, {});

      expect(result.error).toBeDefined();
      expect(result.output).toBeUndefined();
    });

    it('throws when the step definition has no handler', async () => {
      const stepHandler = buildHandler({ handler: undefined as unknown as jest.Mock });

      await expect(stepHandler.run({}, {}, {})).rejects.toThrow(/has no "handler"/);
    });
  });

  describe('onCancel', () => {
    const asHandler = (h: OneShotStepDefinitionHandler): CustomStepDefinitionHandler => h;

    it('does nothing when the step definition has no onCancel', async () => {
      const handler = jest.fn().mockResolvedValue({ output: {} });
      const stepHandler = buildHandler({ handler });

      await asHandler(stepHandler).onCancel({}, {}, {});
    });

    it('invokes onCancel with context from the last run', async () => {
      const handler = jest.fn().mockResolvedValue({ output: { ok: true } });
      const onCancel = jest.fn();
      const stepHandler = buildHandler({ handler, onCancel });

      await stepHandler.run({ ran: true }, { ran: true }, {});
      await asHandler(stepHandler).onCancel({ ran: true }, { ran: true }, {});

      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { ran: true },
          rawInput: { ran: true },
          config: {},
        })
      );
    });

    it('forwards input, rawInput, and config passed to onCancel', async () => {
      const onCancel = jest.fn();
      const node: TestNode = {
        stepId: 'custom-step',
        stepType: 'my-custom-type',
        configuration: { with: { fromNode: true }, 'max-step-size': undefined },
      };
      const stepHandler = buildHandler(
        { handler: jest.fn(), onCancel },
        createHandlerTestMocks(),
        node
      );

      await asHandler(stepHandler).onCancel(
        {},
        { fromNode: true },
        node.configuration as Record<string, unknown>
      );

      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {},
          rawInput: { fromNode: true },
          config: node.configuration,
        })
      );
    });
  });
});
