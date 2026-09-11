/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type {
  ScopedRunnerRunToolsParams,
  ScopedRunnerRunAgentParams,
  RunToolParams,
  RunAgentParams,
  ToolHandlerFn,
  RunApprovals,
} from '@kbn/agent-builder-server';
import type {
  CreateScopedRunnerDepsMock,
  MockedTool,
  MockedInternalAgent,
  AgentRegistryMock,
  ToolRegistryMock,
} from '../../../test_utils';
import {
  createScopedRunnerDepsMock,
  createRunnerDepsMock,
  createMockedTool,
  createMockedInternalAgent,
  createMockedAgentRegistry,
  createToolRegistryMock,
} from '../../../test_utils';
import { createScopedRunner, createRunner } from './runner';
import { createAgentHandler } from '../run_agent/create_handler';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { getToolResultId } from '@kbn/agent-builder-server/tools/utils';
import { HookLifecycle } from '@kbn/agent-builder-common';
import type { AutoApprovedApi, InteractivityConfig } from '@kbn/agent-builder-common';
import {
  AGENT_BUILDER_BASH_SUPPORT_SETTING_ID,
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';

jest.mock('../run_agent/create_handler');
jest.mock('@kbn/agent-builder-server/tools/utils');

const getToolResultIdMock = getToolResultId as jest.MockedFn<typeof getToolResultId>;
const createAgentHandlerMock = createAgentHandler as jest.MockedFn<typeof createAgentHandler>;

describe('AgentBuilder runner', () => {
  let scopedRunnerDeps: CreateScopedRunnerDepsMock;
  let toolHandler: jest.MockedFunction<ToolHandlerFn>;

  beforeEach(() => {
    scopedRunnerDeps = createScopedRunnerDepsMock();
    getToolResultIdMock.mockReturnValue('some-result-id');
  });

  describe('runTool', () => {
    let tool: MockedTool;
    let registry: ToolRegistryMock;

    beforeEach(() => {
      registry = createToolRegistryMock();
      const {
        toolsService: { getRegistry },
      } = scopedRunnerDeps;
      getRegistry.mockResolvedValue(registry);

      toolHandler = jest.fn().mockReturnValue({ results: [] });

      tool = createMockedTool({});
      tool.getSchema.mockReturnValue(
        z.object({
          foo: z.string(),
        })
      );
      tool.getHandler.mockReturnValue(toolHandler);
      registry.get.mockResolvedValue(tool);
    });

    it('can be invoked through a scoped runner', async () => {
      toolHandler.mockReturnValue({
        results: [{ type: ToolResultType.other, data: { someProp: 'someValue' } }],
      });

      const params: ScopedRunnerRunToolsParams = {
        toolId: 'test-tool',
        toolParams: { foo: 'bar' },
      };

      const runner = createScopedRunner(scopedRunnerDeps);
      const response = await runner.runTool(params);

      expect(toolHandler).toHaveBeenCalledTimes(1);
      expect(toolHandler).toHaveBeenCalledWith(params.toolParams, expect.any(Object));

      expect(response).toEqual({
        results: [
          {
            tool_result_id: 'some-result-id',
            type: ToolResultType.other,
            data: { someProp: 'someValue' },
          },
        ],
      });
    });

    it('can be invoked through a runner', async () => {
      toolHandler.mockReturnValue({
        results: [{ type: ToolResultType.other, data: { someProp: 'someValue' } }],
      });

      const runnerDeps = createRunnerDepsMock();
      runnerDeps.toolsService.getRegistry.mockResolvedValue(registry);

      const params: RunToolParams = {
        toolId: 'test-tool',
        toolParams: { foo: 'bar' },
        request: scopedRunnerDeps.request,
      };

      const runner = createRunner(runnerDeps);
      const response = await runner.runTool(params);

      expect(toolHandler).toHaveBeenCalledTimes(1);
      expect(toolHandler).toHaveBeenCalledWith(params.toolParams, expect.any(Object));

      expect(response).toEqual({
        results: [
          {
            tool_result_id: 'some-result-id',
            type: ToolResultType.other,
            data: { someProp: 'someValue' },
          },
        ],
      });
    });

    const runToolWithApprovals = async (approvals?: RunApprovals) => {
      const runnerDeps = createRunnerDepsMock();
      runnerDeps.toolsService.getRegistry.mockResolvedValue(registry);

      const params: RunToolParams = {
        toolId: 'test-tool',
        toolParams: { foo: 'bar' },
        request: scopedRunnerDeps.request,
        approvals,
      };

      return { run: () => createRunner(runnerDeps).runTool(params), params };
    };

    it.each<{
      description: string;
      approvals?: RunApprovals;
      expected: InteractivityConfig;
    }>([
      {
        description:
          'carries the API pre-approvals of a runner-level call into the handler context',
        approvals: { autoApprovedApis: [{ target: 'elasticsearch', api: 'indices.create' }] },
        expected: {
          enabled: false,
          auto_approved_apis: [{ target: 'elasticsearch', api: 'indices.create' }],
        },
      },
      {
        description: 'carries a wildcard grant through unexpanded',
        approvals: { autoApprovedApis: [{ target: 'elasticsearch', api: 'indices.*' }] },
        expected: {
          enabled: false,
          auto_approved_apis: [{ target: 'elasticsearch', api: 'indices.*' }],
        },
      },
      {
        description: 'defaults a runner-level call to the non-interactive config with no grants',
        approvals: undefined,
        expected: { enabled: false },
      },
    ])('$description', async ({ approvals, expected }) => {
      const { run, params } = await runToolWithApprovals(approvals);

      await run();

      expect(toolHandler).toHaveBeenCalledWith(
        params.toolParams,
        expect.objectContaining({ interactivity: expected })
      );
    });

    it.each<{ description: string; autoApprovedApis: AutoApprovedApi[]; expected: string }>([
      {
        description: 'names no real API',
        autoApprovedApis: [{ target: 'elasticsearch', api: 'indices.crate' }],
        expected: 'Unknown auto_approved_apis: "indices.crate" (elasticsearch)',
      },
      {
        description: 'only exists on the other target',
        autoApprovedApis: [{ target: 'kibana', api: 'indices.delete' }],
        expected: '"indices.delete" (kibana)',
      },
      {
        description: 'wildcards a namespace the target does not ship',
        autoApprovedApis: [{ target: 'elasticsearch', api: 'nonsense.*' }],
        expected: '"nonsense.*" (elasticsearch)',
      },
    ])(
      'rejects a pre-approval that $description, without running the tool',
      async ({ autoApprovedApis, expected }) => {
        const { run } = await runToolWithApprovals({ autoApprovedApis });

        await expect(run()).rejects.toThrow(expected);

        expect(toolHandler).not.toHaveBeenCalled();
      }
    );

    it('executes beforeToolCall hook and aborts when it throws', async () => {
      scopedRunnerDeps.hooks.run = jest.fn(async () => {
        throw new Error('blocked by beforeToolCall');
      });

      const params: ScopedRunnerRunToolsParams = {
        toolId: 'test-tool',
        toolParams: { foo: 'bar' },
      };

      const runner = createScopedRunner(scopedRunnerDeps);
      await expect(runner.runTool(params)).rejects.toMatchObject({
        message: 'blocked by beforeToolCall',
      });
      expect(scopedRunnerDeps.hooks.run).toHaveBeenCalledWith(
        HookLifecycle.beforeToolCall,
        expect.objectContaining({ toolId: 'test-tool' })
      );
    });
  });

  describe('runAgent', () => {
    let agent: MockedInternalAgent;
    let agentClient: AgentRegistryMock;
    let agentHandler: jest.MockedFn<any>;

    beforeEach(() => {
      agent = createMockedInternalAgent();

      agentClient = createMockedAgentRegistry();
      agentClient.get.mockResolvedValue(agent);

      const {
        agentsService: { getRegistry },
      } = scopedRunnerDeps;
      getRegistry.mockResolvedValue(agentClient);

      agentHandler = jest.fn();
      agentHandler.mockResolvedValue({
        result: { success: true },
      });
      createAgentHandlerMock.mockReturnValue(agentHandler);
    });

    afterEach(() => {
      createAgentHandlerMock.mockReset();
    });

    it('can be invoked through a scoped runner', async () => {
      agentHandler.mockResolvedValue({ result: 'someResult' as any });

      const params: ScopedRunnerRunAgentParams = {
        agentId: 'test-tool',
        agentParams: { nextInput: { message: 'dolly' } },
      };

      const runner = createScopedRunner(scopedRunnerDeps);
      const response = await runner.runAgent(params);

      expect(agentHandler).toHaveBeenCalledTimes(1);
      expect(agentHandler).toHaveBeenCalledWith(
        {
          runId: expect.any(String),
          agentParams: params.agentParams,
          abortSignal: undefined,
        },
        expect.any(Object)
      );

      expect(response).toEqual({
        result: 'someResult',
      });
    });

    it('can be invoked through a runner', async () => {
      agentHandler.mockResolvedValue({ result: 'someResult' as any });

      const runnerDeps = createRunnerDepsMock();
      runnerDeps.agentsService.getRegistry.mockResolvedValue(agentClient);

      const params: RunAgentParams = {
        agentId: 'test-tool',
        agentParams: { nextInput: { message: 'dolly' } },
        request: scopedRunnerDeps.request,
      };

      const runner = createRunner(runnerDeps);
      const response = await runner.runAgent(params);

      expect(agentHandler).toHaveBeenCalledTimes(1);
      expect(agentHandler).toHaveBeenCalledWith(
        {
          runId: expect.any(String),
          agentParams: params.agentParams,
          abortSignal: undefined,
        },
        expect.any(Object)
      );

      expect(response).toEqual({
        result: 'someResult',
      });
    });

    it.each([
      {
        experimentalEnabled: false,
        contextEngineEnabled: false,
        expectedAiIndices: false,
      },
      {
        experimentalEnabled: false,
        contextEngineEnabled: true,
        expectedAiIndices: false,
      },
      {
        experimentalEnabled: true,
        contextEngineEnabled: false,
        expectedAiIndices: false,
      },
      {
        experimentalEnabled: true,
        contextEngineEnabled: true,
        expectedAiIndices: true,
      },
    ])(
      'sets AI index instructions to $expectedAiIndices when experimental=$experimentalEnabled and contextEngine=$contextEngineEnabled',
      async ({ experimentalEnabled, contextEngineEnabled, expectedAiIndices }) => {
        const runnerDeps = createRunnerDepsMock();
        runnerDeps.agentsService.getRegistry.mockResolvedValue(agentClient);
        (runnerDeps.uiSettings.asScopedToClient as jest.Mock).mockReturnValue({
          get: jest.fn((settingId: string) => {
            if (settingId === AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID) {
              return Promise.resolve(experimentalEnabled);
            }
            if (settingId === CONTEXT_ENGINE_ENABLED_SETTING_ID) {
              return Promise.resolve(contextEngineEnabled);
            }
            if (settingId === AGENT_BUILDER_BASH_SUPPORT_SETTING_ID) {
              return Promise.resolve(false);
            }
            return Promise.resolve(false);
          }),
        } as any);

        const runner = createRunner(runnerDeps);
        await runner.runAgent({
          agentId: 'test-tool',
          agentParams: { nextInput: { message: 'dolly' } },
          request: scopedRunnerDeps.request,
        });

        expect(agentHandler).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            experimentalFeatures: expect.objectContaining({
              aiIndices: expectedAiIndices,
            }),
          })
        );
      }
    );

    it('passes agentId to the model provider factory', async () => {
      const runnerDeps = createRunnerDepsMock();
      runnerDeps.agentsService.getRegistry.mockResolvedValue(agentClient);

      const params: RunAgentParams = {
        agentId: 'root-agent',
        agentParams: {
          nextInput: { message: 'hello' },
          conversation: { id: 'conv-123', rounds: [] } as any,
        },
        request: scopedRunnerDeps.request,
      };

      const runner = createRunner(runnerDeps);
      await runner.runAgent(params);

      expect(runnerDeps.modelProviderFactory).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'root-agent' })
      );
    });
  });
});
