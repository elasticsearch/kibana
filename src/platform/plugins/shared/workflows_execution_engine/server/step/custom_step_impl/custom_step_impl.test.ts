/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { CustomStepImpl } from './custom_step_impl';
import { OneShotStepDefinitionHandler, PollPolicyStepHandler } from './step_definition_handlers';

const mockOneShotRun = jest.fn();
const mockOneShotOnCancel = jest.fn();
const mockPollRun = jest.fn();
const mockPollOnCancel = jest.fn();

jest.mock('./step_definition_handlers', () => ({
  OneShotStepDefinitionHandler: jest.fn().mockImplementation(() => ({
    run: mockOneShotRun,
    onCancel: mockOneShotOnCancel,
  })),
  PollPolicyStepHandler: jest.fn().mockImplementation(() => ({
    run: mockPollRun,
    onCancel: mockPollOnCancel,
  })),
}));

const MockedOneShotStepDefinitionHandler = OneShotStepDefinitionHandler as jest.MockedClass<
  typeof OneShotStepDefinitionHandler
>;
const MockedPollPolicyStepHandler = PollPolicyStepHandler as jest.MockedClass<
  typeof PollPolicyStepHandler
>;

const createMocks = () => {
  const stepExecutionRuntime = {
    contextManager: {
      renderValueAccordingToContext: jest.fn((v: unknown) => v),
      getContext: jest.fn(() => ({})),
      getEsClientAsUser: jest.fn(() => ({})),
      getFakeRequest: jest.fn(() => null),
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
    getCurrentStepState: jest.fn(),
    setCurrentStepState: jest.fn(),
    enterWaitUntil: jest.fn(),
  };

  return {
    stepExecutionRuntime,
    connectorExecutor: {},
    workflowRuntime: { navigateToNextNode: jest.fn() },
    workflowLogger: {
      logInfo: jest.fn(),
      logError: jest.fn(),
      logDebug: jest.fn(),
      logWarn: jest.fn(),
    },
  };
};

interface TestNode {
  stepId: string;
  stepType: string;
  configuration: {
    with?: Record<string, unknown>;
    'max-step-size'?: undefined;
    [key: string]: unknown;
  };
}

const defaultNode: TestNode = {
  stepId: 'custom-step',
  stepType: 'my-custom-type',
  configuration: { with: { key: 'value' }, 'max-step-size': undefined },
};

const buildImpl = (
  stepDefinition: Record<string, unknown>,
  mocks = createMocks(),
  node: TestNode = defaultNode
) =>
  new CustomStepImpl(
    node as any,
    stepDefinition as any,
    mocks.stepExecutionRuntime as any,
    mocks.connectorExecutor as any,
    mocks.workflowRuntime as any,
    mocks.workflowLogger as any
  );

describe('CustomStepImpl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOneShotRun.mockReset();
    mockOneShotOnCancel.mockReset();
    mockPollRun.mockReset();
    mockPollOnCancel.mockReset();
  });

  describe('resolveStepHandler', () => {
    it('constructs OneShotStepDefinitionHandler for handler definitions', () => {
      const mocks = createMocks();
      const stepDefinition = { handler: jest.fn() };

      buildImpl(stepDefinition, mocks);

      expect(MockedOneShotStepDefinitionHandler).toHaveBeenCalledTimes(1);
      expect(MockedOneShotStepDefinitionHandler).toHaveBeenCalledWith(
        stepDefinition,
        defaultNode,
        mocks.stepExecutionRuntime,
        mocks.workflowLogger
      );
      expect(MockedPollPolicyStepHandler).not.toHaveBeenCalled();
    });

    it('constructs PollPolicyStepHandler for poll-only definitions', () => {
      const mocks = createMocks();
      const stepDefinition = {
        poll: jest.fn(),
        policy: { strategy: 'fixed', intervalMs: 1000 },
      };

      buildImpl(stepDefinition, mocks);

      expect(MockedPollPolicyStepHandler).toHaveBeenCalledTimes(1);
      expect(MockedPollPolicyStepHandler).toHaveBeenCalledWith(
        stepDefinition,
        defaultNode,
        mocks.stepExecutionRuntime,
        mocks.workflowLogger
      );
      expect(MockedOneShotStepDefinitionHandler).not.toHaveBeenCalled();
    });

    it('constructs PollPolicyStepHandler for start + poll definitions', () => {
      const mocks = createMocks();
      const stepDefinition = {
        start: jest.fn(),
        poll: jest.fn(),
        policy: { strategy: 'fixed', intervalMs: 1000 },
      };

      buildImpl(stepDefinition, mocks);

      expect(MockedPollPolicyStepHandler).toHaveBeenCalledTimes(1);
      expect(MockedOneShotStepDefinitionHandler).not.toHaveBeenCalled();
    });

    it('throws when the definition has no handler or poll lifecycle', () => {
      const mocks = createMocks();

      expect(() => buildImpl({ start: jest.fn() }, mocks)).toThrow(/Unknown step definition type/);
    });
  });

  describe('_run', () => {
    it('delegates to the one-shot handler run with input, raw with, and config', async () => {
      const runResult = { input: { key: 'value' }, output: { ok: true }, error: undefined };
      mockOneShotRun.mockResolvedValue(runResult);

      const impl = buildImpl({ handler: jest.fn() });
      const result = await (impl as any)._run({ key: 'value' });

      expect(mockOneShotRun).toHaveBeenCalledTimes(1);
      expect(mockOneShotRun).toHaveBeenCalledWith(
        { key: 'value' },
        defaultNode.configuration.with,
        {}
      );
      expect(result).toBe(runResult);
      expect(mockPollRun).not.toHaveBeenCalled();
    });

    it('delegates to the poll handler run with input, raw with, and config', async () => {
      const runResult = { suspended: true, input: {} };
      mockPollRun.mockResolvedValue(runResult);

      const impl = buildImpl({
        poll: jest.fn(),
        policy: { strategy: 'fixed', intervalMs: 1000 },
      });
      const result = await (impl as any)._run({});

      expect(mockPollRun).toHaveBeenCalledTimes(1);
      expect(mockPollRun).toHaveBeenCalledWith({}, defaultNode.configuration.with, {});
      expect(result).toBe(runResult);
      expect(mockOneShotRun).not.toHaveBeenCalled();
    });

    it('returns ExecutionError when the delegated handler run throws', async () => {
      mockOneShotRun.mockRejectedValue(new Error('handler blew up'));

      const impl = buildImpl({ handler: jest.fn() });
      const result = await (impl as any)._run({ key: 'value' });

      expect(result.input).toEqual({ key: 'value' });
      expect(result.output).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('handler blew up');
    });
  });

  describe('onCancel', () => {
    it('delegates to the one-shot handler onCancel with rendered input, raw with, and config', async () => {
      mockOneShotOnCancel.mockResolvedValue(undefined);
      const mocks = createMocks();
      (
        mocks.stepExecutionRuntime.contextManager.renderValueAccordingToContext as jest.Mock
      ).mockReturnValue({
        rendered: true,
      });

      const impl = buildImpl({ handler: jest.fn() }, mocks);
      await impl.onCancel();

      expect(mockOneShotOnCancel).toHaveBeenCalledTimes(1);
      expect(mockOneShotOnCancel).toHaveBeenCalledWith(
        { rendered: true },
        defaultNode.configuration.with,
        {}
      );
      expect(mockPollOnCancel).not.toHaveBeenCalled();
    });

    it('delegates to the poll handler onCancel with rendered input, raw with, and config', async () => {
      mockPollOnCancel.mockResolvedValue(undefined);

      const impl = buildImpl({
        poll: jest.fn(),
        policy: { strategy: 'fixed', intervalMs: 1000 },
      });
      await impl.onCancel();

      expect(mockPollOnCancel).toHaveBeenCalledTimes(1);
      expect(mockPollOnCancel).toHaveBeenCalledWith(
        { key: 'value' },
        defaultNode.configuration.with,
        {}
      );
      expect(mockOneShotOnCancel).not.toHaveBeenCalled();
    });
  });

  describe('getRenderedConfig', () => {
    it('passes rendered schema-defined config to the handler', async () => {
      const mocks = createMocks();
      const renderedConfig = {
        'agent-id': 'elastic-ai-agent',
        'connector-id': 'my-connector',
        'create-conversation': true,
      };
      (
        mocks.stepExecutionRuntime.contextManager.renderValueAccordingToContext as jest.Mock
      ).mockReturnValueOnce(renderedConfig);

      mockOneShotRun.mockResolvedValue({ input: {}, output: { result: 42 }, error: undefined });

      const stepDefinition = {
        configSchema: z.object({
          'agent-id': z.string().optional(),
          'connector-id': z.string().optional(),
          'create-conversation': z.boolean().optional(),
        }),
        handler: jest.fn(),
      };

      const node: TestNode = {
        stepId: 'custom-step',
        stepType: 'ai.agent',
        configuration: {
          with: { message: 'hello' },
          'max-step-size': undefined,
          'agent-id': '{{ consts.agent_id }}',
          'connector-id': '{{ inputs.connector_id }}',
          'create-conversation': true,
          name: 'custom-step',
          type: 'ai.agent',
          unexpected: '{{ consts.unexpected }}',
        },
      };

      const impl = buildImpl(stepDefinition, mocks, node);
      await (impl as any)._run({ message: 'hello' });

      expect(
        mocks.stepExecutionRuntime.contextManager.renderValueAccordingToContext
      ).toHaveBeenCalledWith({
        'agent-id': '{{ consts.agent_id }}',
        'connector-id': '{{ inputs.connector_id }}',
        'create-conversation': true,
      });
      expect(mockOneShotRun).toHaveBeenCalledWith(
        { message: 'hello' },
        { message: 'hello' },
        renderedConfig
      );
    });

    it('filters config to keys declared by the config schema', async () => {
      const mocks = createMocks();
      mockOneShotRun.mockResolvedValue({ input: {}, output: { result: 42 }, error: undefined });

      const stepDefinition = {
        configSchema: z.object({
          source: z.unknown(),
        }),
        handler: jest.fn(),
      };

      const node: TestNode = {
        stepId: 'custom-step',
        stepType: 'data.parse_json',
        configuration: {
          with: { foo: 'bar' },
          'max-step-size': undefined,
          name: 'custom-step',
          type: 'data.parse_json',
          source: '{{ steps.previous.output }}',
          if: '{{ condition }}',
          timeout: '1m',
          'on-failure': { continue: true },
        },
      };

      const impl = buildImpl(stepDefinition, mocks, node);
      await (impl as any)._run({ foo: 'bar' });

      expect(
        mocks.stepExecutionRuntime.contextManager.renderValueAccordingToContext
      ).toHaveBeenCalledWith({
        source: '{{ steps.previous.output }}',
      });
      expect(mockOneShotRun).toHaveBeenCalledWith(
        { foo: 'bar' },
        { foo: 'bar' },
        {
          source: '{{ steps.previous.output }}',
        }
      );
    });
  });

  describe('getInput', () => {
    it('renders node configuration with data via the execution runtime', () => {
      const mocks = createMocks();
      const node = {
        ...defaultNode,
        configuration: { with: { foo: 'bar' }, 'max-step-size': undefined },
      };

      const impl = buildImpl({ handler: jest.fn() }, mocks, node);
      const input = impl.getInput();

      expect(input).toEqual({ foo: 'bar' });
      expect(
        mocks.stepExecutionRuntime.contextManager.renderValueAccordingToContext
      ).toHaveBeenCalledWith({ foo: 'bar' });
    });
  });
});
