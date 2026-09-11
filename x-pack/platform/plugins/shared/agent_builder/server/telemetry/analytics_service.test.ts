/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core/server';
import type { MockedLogger } from '@kbn/logging-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { ATTACHMENT_REF_ACTOR, AttachmentType } from '@kbn/agent-builder-common/attachments';
import {
  AGENT_BUILDER_EVENT_TYPES,
  agentBuilderServerEbtEvents,
  ConversationRoundStatus,
  ConversationRoundStepType,
  agentBuilderDefaultAgentId,
  attachmentTools,
  ToolType,
  type ConversationRound,
  type VersionedAttachment,
} from '@kbn/agent-builder-common';
import { ModelProvider } from '@kbn/inference-common';
import type { ExecutionTelemetry } from '../services/execution/utils/report_round_telemetry';
import { AnalyticsService } from './analytics_service';

describe('AnalyticsService', () => {
  let analytics: jest.Mocked<Pick<AnalyticsServiceSetup, 'registerEventType' | 'reportEvent'>>;
  let logger: MockedLogger;
  let service: AnalyticsService;

  beforeEach(() => {
    analytics = {
      registerEventType: jest.fn(),
      reportEvent: jest.fn(),
    };
    logger = loggerMock.create();
    service = new AnalyticsService(analytics as unknown as AnalyticsServiceSetup, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerAgentBuilderEventTypes', () => {
    beforeEach(() => {
      service.registerAgentBuilderEventTypes();
    });

    describe.each(agentBuilderServerEbtEvents)('eventType: $eventType', (eventConfig) => {
      it('registers the event type', () => {
        expect(analytics.registerEventType).toHaveBeenCalledWith(eventConfig);
      });
    });
  });

  describe('reportRoundComplete', () => {
    const modelProvider = ModelProvider.OpenAI;
    const imageAttachments: VersionedAttachment[] = [
      {
        id: 'image-1',
        type: AttachmentType.image,
        versions: [],
        current_version: 1,
      },
      {
        id: 'image-2',
        type: AttachmentType.image,
        versions: [],
        current_version: 1,
      },
    ];
    const round: ConversationRound = {
      id: 'round-1',
      input: { message: 'hi' },
      steps: [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tool-call-1',
          tool_id: 'my_custom_tool',
          params: {},
          results: [],
        },
      ],
      response: { message: 'response' },
      started_at: '2025-01-01T00:00:00.000Z',
      time_to_first_token: 1,
      time_to_last_token: 2,
      model_usage: {
        connector_id: 'connector-id',
        llm_calls: 3,
        input_tokens: 4,
        output_tokens: 5,
        model: 'gpt-97q',
      },
      status: ConversationRoundStatus.completed,
      trace_id: 'trace-1',
    };

    it('reports the RoundComplete event', () => {
      service.reportRoundComplete({
        agentId: agentBuilderDefaultAgentId,
        conversationId: 'conversation-1',
        round,
        roundCount: 2,
        modelProvider,
        conversationAttachments: [],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.RoundComplete, {
        agent_id: agentBuilderDefaultAgentId,
        attachments: undefined,
        conversation_id: 'conversation-1',
        execution_id: undefined,
        input_tokens: 4,
        llm_calls: 3,
        message_length: 2,
        model: 'gpt-97q',
        model_provider: ModelProvider.OpenAI,
        output_tokens: 5,
        round_id: 'round-1',
        round_status: ConversationRoundStatus.completed,
        response_length: round.response.message.length,
        round_number: 2,
        started_at: '2025-01-01T00:00:00.000Z',
        time_to_first_token: 1,
        time_to_last_token: 2,
        tool_calls: 1,
        tool_call_errors: 0,
        tools_invoked: ['custom-3c9388baa67aef90'],
      });
    });

    it('reports attachments.read in tools_invoked', () => {
      const roundWithBuiltinTool: ConversationRound = {
        ...round,
        steps: [
          {
            type: ConversationRoundStepType.toolCall,
            tool_call_id: 'tool-call-1',
            tool_id: attachmentTools.read,
            tool_type: ToolType.builtin,
            params: {},
            results: [],
          },
        ],
      };

      service.reportRoundComplete({
        agentId: agentBuilderDefaultAgentId,
        conversationId: 'conversation-1',
        round: roundWithBuiltinTool,
        roundCount: 2,
        modelProvider,
        conversationAttachments: [],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.RoundComplete,
        expect.objectContaining({
          tools_invoked: [attachmentTools.read],
        })
      );
    });

    it('reports image attachments referenced by the user', () => {
      const roundWithImageAttachments: ConversationRound = {
        ...round,
        input: {
          message: 'What is in these images?',
          attachment_refs: [
            {
              attachment_id: 'image-1',
              version: 1,
              actor: ATTACHMENT_REF_ACTOR.user,
            },
            {
              attachment_id: 'image-2',
              version: 1,
              actor: ATTACHMENT_REF_ACTOR.user,
            },
          ],
        },
      };

      service.reportRoundComplete({
        agentId: agentBuilderDefaultAgentId,
        conversationId: 'conversation-1',
        round: roundWithImageAttachments,
        roundCount: 2,
        modelProvider,
        conversationAttachments: imageAttachments,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.RoundComplete,
        expect.objectContaining({
          attachments: [AttachmentType.image, AttachmentType.image],
        })
      );
    });

    it('does not report image attachments referenced by the agent', () => {
      const roundWithAgentImageReference: ConversationRound = {
        ...round,
        input: {
          message: 'Continue',
          attachment_refs: [
            {
              attachment_id: 'image-1',
              version: 1,
              actor: ATTACHMENT_REF_ACTOR.agent,
            },
          ],
        },
      };

      service.reportRoundComplete({
        agentId: agentBuilderDefaultAgentId,
        conversationId: 'conversation-1',
        round: roundWithAgentImageReference,
        roundCount: 2,
        modelProvider,
        conversationAttachments: imageAttachments,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.RoundComplete,
        expect.objectContaining({ attachments: undefined })
      );
    });

    it('reports a hashed agent_id for custom agents', () => {
      service.reportRoundComplete({
        agentId: 'my_custom_agent',
        conversationId: 'conversation-1',
        round,
        roundCount: 2,
        modelProvider,
        conversationAttachments: [],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.RoundComplete, {
        agent_id: 'custom-da3031a511e7fadf',
        attachments: undefined,
        conversation_id: 'conversation-1',
        execution_id: undefined,
        input_tokens: 4,
        llm_calls: 3,
        message_length: 2,
        model: 'gpt-97q',
        model_provider: ModelProvider.OpenAI,
        output_tokens: 5,
        round_id: 'round-1',
        round_status: ConversationRoundStatus.completed,
        response_length: round.response.message.length,
        round_number: 2,
        started_at: '2025-01-01T00:00:00.000Z',
        time_to_first_token: 1,
        time_to_last_token: 2,
        tool_calls: 1,
        tool_call_errors: 0,
        tools_invoked: ['custom-3c9388baa67aef90'],
      });
    });

    it('does not throw when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() =>
        service.reportRoundComplete({
          agentId: agentBuilderDefaultAgentId,
          conversationId: 'conversation-1',
          round,
          roundCount: 2,
          modelProvider,
          conversationAttachments: [],
        })
      ).not.toThrow();
    });

    it('logs debug when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      service.reportRoundComplete({
        agentId: agentBuilderDefaultAgentId,
        conversationId: 'conversation-1',
        round,
        roundCount: 2,
        modelProvider,
        conversationAttachments: [],
      });

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('reportAgentCreated', () => {
    it('reports the AgentCreated event', () => {
      service.reportAgentCreated({
        agentId: agentBuilderDefaultAgentId,
        toolSelection: [
          {
            tool_ids: ['my_custom_tool', 'my_custom_tool'],
          },
        ],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.AgentCreated, {
        agent_id: agentBuilderDefaultAgentId,
        tool_ids: ['custom-3c9388baa67aef90'],
      });
    });

    it('reports a hashed agent_id for custom agents', () => {
      service.reportAgentCreated({
        agentId: 'my_custom_agent',
        toolSelection: [
          {
            tool_ids: [],
          },
        ],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.AgentCreated, {
        agent_id: 'custom-da3031a511e7fadf',
        tool_ids: [],
      });
    });
  });

  describe('reportAgentUpdated', () => {
    it('reports the AgentUpdated event', () => {
      service.reportAgentUpdated({
        agentId: agentBuilderDefaultAgentId,
        toolSelection: [
          {
            tool_ids: ['my_custom_tool', 'my_custom_tool'],
          },
        ],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.AgentUpdated, {
        agent_id: agentBuilderDefaultAgentId,
        tool_ids: ['custom-3c9388baa67aef90'],
      });
    });
  });

  describe('reportToolCreated', () => {
    it('reports the ToolCreated event', () => {
      service.reportToolCreated({ toolId: 'my_custom_tool', toolType: 'esql' });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.ToolCreated, {
        tool_id: 'custom-3c9388baa67aef90',
        tool_type: 'esql',
      });
    });
  });

  describe.each([
    {
      method: 'reportSkillCreated' as const,
      eventType: AGENT_BUILDER_EVENT_TYPES.SkillCreated,
      report: (args: { skillId: string; origin?: 'custom'; toolIds: string[] }) =>
        service.reportSkillCreated(args),
    },
    {
      method: 'reportSkillUpdated' as const,
      eventType: AGENT_BUILDER_EVENT_TYPES.SkillUpdated,
      report: (args: { skillId: string; origin?: 'custom'; toolIds: string[] }) =>
        service.reportSkillUpdated(args),
    },
  ])('$method', ({ method, eventType, report }) => {
    it('reports the event with normalized skill_id and deduplicated tool_ids', () => {
      report({
        skillId: 'custom-skill-1',
        origin: 'custom',
        toolIds: ['my_custom_tool', 'my_custom_tool'],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(eventType, {
        skill_id: 'custom-a1c01b755b74d7bd',
        origin: 'custom',
        tool_ids: ['custom-3c9388baa67aef90'],
      });
    });

    it('reports empty tool_ids when no tools are attached', () => {
      report({ skillId: 'custom-skill-1', origin: 'custom', toolIds: [] });

      expect(analytics.reportEvent).toHaveBeenCalledWith(eventType, {
        skill_id: 'custom-a1c01b755b74d7bd',
        origin: 'custom',
        tool_ids: [],
      });
    });

    it('uses a composite `plugin-<hash>-<hash>` id when a pluginId is provided', () => {
      service[method]({
        skillId: 'plugin-skill',
        origin: 'plugin',
        pluginId: 'plugin-uuid-1',
        toolIds: [],
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(eventType, {
        skill_id: 'plugin-f3a4ba6782682a47-eabadf06389e747c',
        origin: 'plugin',
        tool_ids: [],
      });
    });

    it('does not throw when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() => report({ skillId: 'custom-skill-1', toolIds: [] })).not.toThrow();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe.each([
    { method: 'reportSkillDeleted' as const, eventType: AGENT_BUILDER_EVENT_TYPES.SkillDeleted },
  ])('$method', ({ method, eventType }) => {
    it('normalizes the skill_id and passes origin for custom skills', () => {
      service[method]({ skillId: 'custom-skill-1', origin: 'custom' });

      expect(analytics.reportEvent).toHaveBeenCalledWith(eventType, {
        skill_id: 'custom-a1c01b755b74d7bd',
        origin: 'custom',
      });
    });

    it('uses a composite `plugin-<hash>-<hash>` id when a pluginId is provided', () => {
      service[method]({ skillId: 'plugin-skill', origin: 'plugin', pluginId: 'plugin-uuid-1' });

      expect(analytics.reportEvent).toHaveBeenCalledWith(eventType, {
        skill_id: 'plugin-f3a4ba6782682a47-eabadf06389e747c',
        origin: 'plugin',
      });
    });

    it('does not throw when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() => service[method]({ skillId: 'custom-skill-1' })).not.toThrow();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('reportSkillInvoked', () => {
    it('reports the SkillInvoked event for a built-in skill (keeps original skill_id, normalizes agent_id)', () => {
      service.reportSkillInvoked({
        skillId: 'builtin-skill-1',
        origin: 'builtin',
        solutionArea: 'platform',
        agentId: agentBuilderDefaultAgentId,
        conversationId: 'conv-1',
        executionId: 'exec-1',
        toolCount: 3,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.SkillInvoked, {
        skill_id: 'builtin-skill-1',
        origin: 'builtin',
        solution_area: 'platform',
        plugin_id: undefined,
        agent_id: agentBuilderDefaultAgentId,
        conversation_id: 'conv-1',
        execution_id: 'exec-1',
        tool_count: 3,
      });
    });

    it('reports the SkillInvoked event for a plugin-backed skill (composite skill_id, hashed plugin_id)', () => {
      service.reportSkillInvoked({
        skillId: 'plugin-skill',
        origin: 'plugin',
        solutionArea: 'plugin',
        pluginId: 'plugin-uuid-1',
        agentId: 'my_custom_agent',
        toolCount: 0,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.SkillInvoked, {
        skill_id: 'plugin-f3a4ba6782682a47-eabadf06389e747c',
        origin: 'plugin',
        solution_area: 'plugin',
        plugin_id: 'plugin-f3a4ba6782682a47',
        agent_id: 'custom-da3031a511e7fadf',
        conversation_id: undefined,
        execution_id: undefined,
        tool_count: 0,
      });
    });

    it('reports the SkillInvoked event for a custom skill (hashed skill_id, undefined plugin/agent)', () => {
      service.reportSkillInvoked({
        skillId: 'custom-skill-1',
        origin: 'custom',
        solutionArea: 'custom',
        toolCount: 1,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.SkillInvoked, {
        skill_id: 'custom-a1c01b755b74d7bd',
        origin: 'custom',
        solution_area: 'custom',
        plugin_id: undefined,
        agent_id: undefined,
        conversation_id: undefined,
        execution_id: undefined,
        tool_count: 1,
      });
    });

    it('does not throw when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() =>
        service.reportSkillInvoked({
          skillId: 'custom-skill-1',
          origin: 'custom',
          solutionArea: 'custom',
          toolCount: 0,
        })
      ).not.toThrow();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('reportPluginImported', () => {
    it('reports source_type `url` when sourceType is "url" and hashes the plugin id', () => {
      service.reportPluginImported({
        pluginId: 'plugin-uuid-1',
        sourceType: 'url',
        skillCount: 2,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.PluginImported, {
        plugin_id: 'plugin-f3a4ba6782682a47',
        source_type: 'url',
        skill_count: 2,
      });
    });

    it('reports source_type `upload` when sourceType is "file"', () => {
      service.reportPluginImported({
        pluginId: 'plugin-uuid-1',
        sourceType: 'file',
        skillCount: 0,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.PluginImported,
        expect.objectContaining({ source_type: 'upload' })
      );
    });

    it('reports plugin_id as `unknown` when the input plugin id is empty', () => {
      service.reportPluginImported({
        pluginId: '',
        sourceType: 'url',
        skillCount: 0,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.PluginImported,
        expect.objectContaining({ plugin_id: 'unknown' })
      );
    });

    it('does not throw when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() =>
        service.reportPluginImported({
          pluginId: 'plugin-uuid-1',
          sourceType: 'url',
          skillCount: 1,
        })
      ).not.toThrow();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('reportExecutionComplete', () => {
    const modelProvider = ModelProvider.OpenAI;

    const buildRound = (parts: Partial<ConversationRound> = {}): ConversationRound =>
      ({
        id: 'round-1',
        status: ConversationRoundStatus.completed,
        input: { message: 'hi' },
        response: { message: 'there' },
        steps: [],
        started_at: '2026-01-01T00:00:00.000Z',
        time_to_first_token: 10,
        time_to_last_token: 20,
        model_usage: { connector_id: 'c1', llm_calls: 1, input_tokens: 4, output_tokens: 2 },
        ...parts,
      } as ConversationRound);

    const telemetry = (parts: Partial<ExecutionTelemetry> = {}): ExecutionTelemetry => ({
      roundId: 'round-1',
      roundCount: 2,
      executionIndex: 1,
      executionRound: buildRound(),
      roundTotals: buildRound({
        model_usage: {
          connector_id: 'c1',
          llm_calls: 3,
          input_tokens: 10,
          output_tokens: 5,
        },
      }),
      isRoundTerminal: true,
      isResume: true,
      pendingPromptTypes: [],
      promptResponseTypes: [],
      promptResponseOutcomes: [],
      ...parts,
    });

    it("reports this execution's own usage, not the round totals", () => {
      service.reportExecutionComplete({
        agentId: 'my-agent',
        conversationId: 'conversation-1',
        executionId: 'execution-1',
        modelProvider,
        telemetry: telemetry(),
      });

      expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
      const [eventType, payload] = analytics.reportEvent.mock.calls[0];
      expect(eventType).toBe(AGENT_BUILDER_EVENT_TYPES.ExecutionComplete);
      expect(payload).toEqual(
        expect.objectContaining({
          round_id: 'round-1',
          round_number: 2,
          execution_index: 1,
          trigger: 'prompt_response',
          outcome: 'responded',
          input_tokens: 4,
          output_tokens: 2,
          llm_calls: 1,
          // the round's message, which only the first execution carries
          message_length: 2,
          response_length: 5,
        })
      );
    });

    it('marks a pause and carries the prompt types it paused on', () => {
      service.reportExecutionComplete({
        agentId: 'my-agent',
        modelProvider,
        telemetry: telemetry({
          isRoundTerminal: false,
          isResume: false,
          executionIndex: 0,
          pendingPromptTypes: ['confirmation'],
        }),
      });

      const [, payload] = analytics.reportEvent.mock.calls[0];
      expect(payload).toEqual(
        expect.objectContaining({
          trigger: 'user_message',
          outcome: 'prompt_requested',
          prompt_count: 1,
          prompt_types: ['confirmation'],
        })
      );
    });

    it('omits the optional HITL fields when there are none', () => {
      service.reportExecutionComplete({
        agentId: 'my-agent',
        modelProvider,
        telemetry: telemetry({ isResume: false, executionIndex: 0 }),
      });

      const [, payload] = analytics.reportEvent.mock.calls[0];
      expect(payload).not.toHaveProperty('prompt_count');
      expect(payload).not.toHaveProperty('prompt_response_types');
      expect(payload).not.toHaveProperty('human_latency_ms');
    });

    it('carries the human latency when it was measured', () => {
      service.reportExecutionComplete({
        agentId: 'my-agent',
        modelProvider,
        telemetry: telemetry({ humanLatencyMs: 30_000 }),
      });

      const [, payload] = analytics.reportEvent.mock.calls[0];
      expect(payload).toEqual(expect.objectContaining({ human_latency_ms: 30_000 }));
    });

    it('does not throw when reporting fails', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('EBT unavailable');
      });

      expect(() =>
        service.reportExecutionComplete({
          agentId: 'my-agent',
          modelProvider,
          telemetry: telemetry(),
        })
      ).not.toThrow();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('reportRoundError', () => {
    const defaultArgs = {
      agentId: agentBuilderDefaultAgentId,
      conversationId: 'conversation-1',
      error: new Error('boom'),
      modelProvider: ModelProvider.OpenAI,
    };

    it('reports the RoundError event with a truncated error_message', () => {
      const longMessage = 'a'.repeat(2000);

      service.reportRoundError({
        ...defaultArgs,
        error: new Error(longMessage),
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.RoundError,
        expect.objectContaining({
          error_message: `${'a'.repeat(500)}`,
        })
      );
    });
  });

  describe('reportToolCallSuccess', () => {
    it('reports the ToolCallSuccess event with normalized IDs', () => {
      service.reportToolCallSuccess({
        agentId: agentBuilderDefaultAgentId,
        conversationId: 'conv-1',
        toolId: 'my_custom_tool',
        toolCallId: 'tc-1',
        source: 'agent',
        resultTypes: ['resource', 'esql_results'],
        duration: 150,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.ToolCallSuccess,
        {
          agent_id: agentBuilderDefaultAgentId,
          conversation_id: 'conv-1',
          tool_id: 'custom-3c9388baa67aef90',
          tool_call_id: 'tc-1',
          source: 'agent',
          result_types: ['resource', 'esql_results'],
          duration_ms: 150,
        }
      );
    });

    it('keeps the real tool_id for built-in tools (by type) not on the allow-list', () => {
      service.reportToolCallSuccess({
        agentId: agentBuilderDefaultAgentId,
        toolId: 'platform.dashboard.manage_dashboard',
        toolType: ToolType.builtin,
        toolCallId: 'tc-1',
        source: 'agent',
        resultTypes: ['other'],
        duration: 10,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.ToolCallSuccess,
        expect.objectContaining({
          tool_id: 'platform.dashboard.manage_dashboard',
        })
      );
    });

    it('passes undefined agent_id when agentId is undefined', () => {
      service.reportToolCallSuccess({
        toolId: 'my_custom_tool',
        toolCallId: 'tc-1',
        source: 'user',
        resultTypes: ['other'],
        duration: 50,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.ToolCallSuccess,
        expect.objectContaining({
          agent_id: undefined,
        })
      );
    });

    it('does not throw when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() =>
        service.reportToolCallSuccess({
          toolId: 'tool-1',
          toolCallId: 'tc-1',
          source: 'agent',
          resultTypes: ['other'],
          duration: 100,
        })
      ).not.toThrow();

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('reportToolCallError', () => {
    it('reports the ToolCallError event with normalized IDs and sanitized error type', () => {
      service.reportToolCallError({
        agentId: agentBuilderDefaultAgentId,
        toolId: 'my_custom_tool',
        toolCallId: 'tc-1',
        source: 'agent',
        errorType: 'tool_error',
        errorMessage: 'Something went wrong',
        duration: 200,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.ToolCallError, {
        agent_id: agentBuilderDefaultAgentId,
        conversation_id: undefined,
        tool_id: 'custom-3c9388baa67aef90',
        tool_call_id: 'tc-1',
        source: 'agent',
        error_type: 'tool_error',
        error_message: 'Something went wrong',
        duration_ms: 200,
      });
    });

    it('truncates error_message to 500 characters', () => {
      const longMessage = 'x'.repeat(1000);

      service.reportToolCallError({
        agentId: agentBuilderDefaultAgentId,
        toolId: 'tool-1',
        toolCallId: 'tc-1',
        source: 'agent',
        errorType: 'tool_error',
        errorMessage: longMessage,
        duration: 100,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.ToolCallError,
        expect.objectContaining({
          error_message: 'x'.repeat(500),
        })
      );
    });

    it('passes undefined agent_id when agentId is undefined', () => {
      service.reportToolCallError({
        toolId: 'tool-1',
        toolCallId: 'tc-1',
        source: 'mcp',
        errorType: 'tool_error',
        errorMessage: 'fail',
        duration: 50,
      });

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        AGENT_BUILDER_EVENT_TYPES.ToolCallError,
        expect.objectContaining({
          agent_id: undefined,
        })
      );
    });

    it('does not throw when reporting throws', () => {
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() =>
        service.reportToolCallError({
          toolId: 'tool-1',
          toolCallId: 'tc-1',
          source: 'agent',
          errorType: 'tool_error',
          errorMessage: 'fail',
          duration: 100,
        })
      ).not.toThrow();

      expect(logger.debug).toHaveBeenCalled();
    });
  });
});
