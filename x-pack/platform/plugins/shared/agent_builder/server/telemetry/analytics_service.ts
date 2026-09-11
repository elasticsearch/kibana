/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { ATTACHMENT_REF_ACTOR, AttachmentType } from '@kbn/agent-builder-common/attachments';
import {
  AGENT_BUILDER_EVENT_TYPES,
  agentBuilderServerEbtEvents,
  type ConversationRound,
  ConversationRoundStepType,
  ToolResultType,
  type ToolSelection,
  type ToolType,
  type VersionedAttachment,
} from '@kbn/agent-builder-common';
import type {
  ReportAgentCreatedParams,
  ReportAgentUpdatedParams,
  ReportPluginImportedParams,
  ReportExecutionCompleteParams,
  ReportRoundCompleteParams,
  ReportRoundErrorParams,
  ReportSkillCreatedParams,
  ReportSkillDeletedParams,
  ReportSkillInvokedParams,
  ReportSkillUpdatedParams,
  ReportToolCallErrorParams,
  ReportToolCallSuccessParams,
  ReportToolCreatedParams,
  SkillCreationOrigin,
  SkillInvocationOrigin,
  SkillSolutionArea,
} from '@kbn/agent-builder-common/telemetry/agent_builder_events';
import type { ModelProvider } from '@kbn/inference-common';
import type { ExecutionTelemetry } from '../services/execution/utils/report_round_telemetry';
import { normalizeErrorType, sanitizeForCounterName } from './error_utils';
import {
  normalizeAgentIdForTelemetry,
  normalizePluginIdForTelemetry,
  normalizeSkillIdForTelemetry,
  normalizeToolIdForTelemetry,
} from './utils';

/**
 * Server-side analytics wrapper for Agent Builder telemetry.
 *
 * This service centralizes event type registration and reporting for
 * `AGENT_BUILDER_EVENT_TYPES` so call sites can be kept small, typed, and safe.
 */
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsServiceSetup, private readonly logger: Logger) {}

  /**
   * Register Agent Builder server event types with core analytics.
   */
  registerAgentBuilderEventTypes(): void {
    agentBuilderServerEbtEvents.forEach((eventConfig) => {
      this.analytics.registerEventType(eventConfig);
    });
  }

  reportAgentCreated({
    agentId,
    toolSelection,
  }: {
    agentId: string;
    toolSelection: ToolSelection[];
  }): void {
    try {
      const normalizedAgentId = normalizeAgentIdForTelemetry(agentId);
      const toolIds = toolSelection.flatMap((selection) => selection.tool_ids);
      const toolsIncluded = Array.from(new Set(toolIds)).map((toolId) =>
        normalizeToolIdForTelemetry(toolId)
      );
      this.analytics.reportEvent<ReportAgentCreatedParams>(AGENT_BUILDER_EVENT_TYPES.AgentCreated, {
        agent_id: normalizedAgentId ?? 'unknown',
        tool_ids: toolsIncluded,
      });
    } catch (error) {
      // Do not fail the request if telemetry fails
      this.logger.debug('Failed to report AgentCreated telemetry event', { error });
    }
  }

  reportAgentUpdated({
    agentId,
    toolSelection,
  }: {
    agentId: string;
    toolSelection: ToolSelection[];
  }): void {
    try {
      const normalizedAgentId = normalizeAgentIdForTelemetry(agentId);
      const toolIds = toolSelection.flatMap((selection) => selection.tool_ids);
      const toolsIncluded = Array.from(new Set(toolIds)).map((toolId) =>
        normalizeToolIdForTelemetry(toolId)
      );
      this.analytics.reportEvent<ReportAgentUpdatedParams>(AGENT_BUILDER_EVENT_TYPES.AgentUpdated, {
        agent_id: normalizedAgentId ?? 'unknown',
        tool_ids: toolsIncluded,
      });
    } catch (error) {
      // Do not fail the request if telemetry fails
      this.logger.debug('Failed to report AgentUpdated telemetry event', { error });
    }
  }

  reportToolCreated({ toolId, toolType }: { toolId: string; toolType: ToolType | string }): void {
    try {
      this.analytics.reportEvent<ReportToolCreatedParams>(AGENT_BUILDER_EVENT_TYPES.ToolCreated, {
        tool_id: normalizeToolIdForTelemetry(toolId),
        tool_type: toolType,
      });
    } catch (error) {
      // Do not fail the request if telemetry fails
      this.logger.debug('Failed to report ToolCreated telemetry event', { error });
    }
  }

  reportSkillCreated({
    skillId,
    origin,
    pluginId,
    toolIds,
  }: {
    skillId: string;
    origin?: SkillCreationOrigin;
    pluginId?: string;
    toolIds: string[];
  }): void {
    try {
      const toolsIncluded = Array.from(new Set(toolIds)).map((toolId) =>
        normalizeToolIdForTelemetry(toolId)
      );
      this.analytics.reportEvent<ReportSkillCreatedParams>(AGENT_BUILDER_EVENT_TYPES.SkillCreated, {
        skill_id: normalizeSkillIdForTelemetry({
          id: skillId,
          readonly: false,
          plugin_id: pluginId,
        }),
        origin,
        tool_ids: toolsIncluded,
      });
    } catch (error) {
      this.logger.debug('Failed to report SkillCreated telemetry event', { error });
    }
  }

  reportSkillUpdated({
    skillId,
    origin,
    pluginId,
    toolIds,
  }: {
    skillId: string;
    origin?: SkillCreationOrigin;
    pluginId?: string;
    toolIds: string[];
  }): void {
    try {
      const toolsIncluded = Array.from(new Set(toolIds)).map((toolId) =>
        normalizeToolIdForTelemetry(toolId)
      );
      this.analytics.reportEvent<ReportSkillUpdatedParams>(AGENT_BUILDER_EVENT_TYPES.SkillUpdated, {
        skill_id: normalizeSkillIdForTelemetry({
          id: skillId,
          readonly: false,
          plugin_id: pluginId,
        }),
        origin,
        tool_ids: toolsIncluded,
      });
    } catch (error) {
      this.logger.debug('Failed to report SkillUpdated telemetry event', { error });
    }
  }

  reportSkillDeleted({
    skillId,
    origin,
    pluginId,
  }: {
    skillId: string;
    origin?: SkillCreationOrigin;
    pluginId?: string;
  }): void {
    try {
      this.analytics.reportEvent<ReportSkillDeletedParams>(AGENT_BUILDER_EVENT_TYPES.SkillDeleted, {
        skill_id: normalizeSkillIdForTelemetry({
          id: skillId,
          readonly: false,
          plugin_id: pluginId,
        }),
        origin,
      });
    } catch (error) {
      this.logger.debug('Failed to report SkillDeleted telemetry event', { error });
    }
  }

  reportSkillInvoked({
    skillId,
    origin,
    solutionArea,
    pluginId,
    agentId,
    conversationId,
    executionId,
    toolCount,
  }: {
    skillId: string;
    origin: SkillInvocationOrigin;
    solutionArea: SkillSolutionArea;
    pluginId?: string;
    agentId?: string;
    conversationId?: string;
    executionId?: string;
    toolCount: number;
  }): void {
    try {
      this.analytics.reportEvent<ReportSkillInvokedParams>(AGENT_BUILDER_EVENT_TYPES.SkillInvoked, {
        skill_id: normalizeSkillIdForTelemetry({
          id: skillId,
          readonly: origin === 'builtin',
          plugin_id: pluginId,
        }),
        origin,
        solution_area: solutionArea,
        plugin_id: normalizePluginIdForTelemetry(pluginId),
        agent_id: normalizeAgentIdForTelemetry(agentId),
        conversation_id: conversationId,
        execution_id: executionId,
        tool_count: toolCount,
      });
    } catch (error) {
      this.logger.debug('Failed to report SkillInvoked telemetry event', { error });
    }
  }

  reportPluginImported({
    pluginId,
    sourceType,
    skillCount,
  }: {
    pluginId: string;
    sourceType: 'url' | 'file';
    skillCount: number;
  }): void {
    try {
      const normalizedPluginId = normalizePluginIdForTelemetry(pluginId);
      this.analytics.reportEvent<ReportPluginImportedParams>(
        AGENT_BUILDER_EVENT_TYPES.PluginImported,
        {
          plugin_id: normalizedPluginId ?? 'unknown',
          source_type: sourceType === 'url' ? 'url' : 'upload',
          skill_count: skillCount,
        }
      );
    } catch (error) {
      this.logger.debug('Failed to report PluginImported telemetry event', { error });
    }
  }

  reportRoundComplete({
    agentId,
    conversationId,
    executionId,
    modelProvider,
    round,
    roundCount,
    conversationAttachments,
  }: {
    agentId: string;
    conversationId?: string;
    executionId?: string;
    modelProvider: ModelProvider;
    round: ConversationRound;
    roundCount: number;
    conversationAttachments: VersionedAttachment[];
  }): void {
    try {
      const normalizedAgentId = normalizeAgentIdForTelemetry(agentId);

      const toolCallSteps =
        round.steps?.filter((step) => step.type === ConversationRoundStepType.toolCall) ?? [];

      // NOTE: `tools_invoked` is intentionally an array that can include duplicates (one per tool
      // call). This allows downstream telemetry analysis to compute per-tool invocation counts by
      // aggregating over the array values.
      const toolsInvoked =
        toolCallSteps.map((step) => normalizeToolIdForTelemetry(step.tool_id, step.tool_type)) ??
        [];

      const toolCallErrors = toolCallSteps.filter(({ results }) => {
        return results.length > 0 && results.every((r) => r.type === ToolResultType.error);
      });

      const conversationAttachmentTypes = new Map(
        conversationAttachments.map(({ id, type }) => [id, type])
      );
      const imageAttachmentIds = new Set(
        round.input.attachment_refs
          ?.filter(({ actor }) => actor === ATTACHMENT_REF_ACTOR.user)
          .filter(
            ({ attachment_id: attachmentId }) =>
              conversationAttachmentTypes.get(attachmentId) === AttachmentType.image
          )
          .map(({ attachment_id: attachmentId }) => attachmentId) ?? []
      );
      const attachmentTypes = [
        ...(round.input.attachments?.map(({ type }) => type || 'unknown') ?? []),
        ...Array.from(imageAttachmentIds, () => AttachmentType.image),
      ];
      const attachments = attachmentTypes.length > 0 ? attachmentTypes : undefined;
      this.analytics.reportEvent<ReportRoundCompleteParams>(
        AGENT_BUILDER_EVENT_TYPES.RoundComplete,
        {
          agent_id: normalizedAgentId ?? 'unknown',
          attachments,
          conversation_id: conversationId,
          execution_id: executionId,
          input_tokens: round.model_usage.input_tokens,
          cached_input_tokens: round.model_usage.cached_input_tokens,
          llm_calls: round.model_usage.llm_calls,
          message_length: round.input.message.length,
          model: round.model_usage.model,
          model_provider: modelProvider,
          output_tokens: round.model_usage.output_tokens,
          round_id: round.id,
          round_status: round.status,
          response_length: round.response.message.length,
          round_number: roundCount,
          started_at: round.started_at,
          time_to_first_token: round.time_to_first_token,
          time_to_last_token: round.time_to_last_token,
          tools_invoked: toolsInvoked,
          tool_calls: toolCallSteps.length,
          tool_call_errors: toolCallErrors.length,
        }
      );
    } catch (error) {
      // Do not fail the request if telemetry fails
      this.logger.debug('Failed to report RoundComplete telemetry event', { error });
    }
  }

  /**
   * One row per execution. A round paused for human input reports several: the pause, then one per
   * resume, each carrying only its own usage. Round totals live on `reportRoundComplete`.
   */
  reportExecutionComplete({
    agentId,
    conversationId,
    executionId,
    modelProvider,
    telemetry,
  }: {
    agentId: string;
    conversationId?: string;
    executionId?: string;
    modelProvider: ModelProvider;
    telemetry: ExecutionTelemetry;
  }): void {
    try {
      const { executionRound, roundTotals } = telemetry;
      const toolCallSteps =
        executionRound.steps?.filter((step) => step.type === ConversationRoundStepType.toolCall) ??
        [];
      const toolCallErrors = toolCallSteps.filter(
        ({ results }) => results.length > 0 && results.every((r) => r.type === ToolResultType.error)
      );
      const attachments = roundTotals.input.attachments?.length
        ? roundTotals.input.attachments.map((a) => a.type || 'unknown')
        : undefined;

      this.analytics.reportEvent<ReportExecutionCompleteParams>(
        AGENT_BUILDER_EVENT_TYPES.ExecutionComplete,
        {
          agent_id: normalizeAgentIdForTelemetry(agentId) ?? 'unknown',
          attachments,
          conversation_id: conversationId,
          execution_id: executionId,
          round_id: telemetry.roundId,
          round_number: telemetry.roundCount,
          execution_index: telemetry.executionIndex,
          trigger: telemetry.isResume ? 'prompt_response' : 'user_message',
          outcome: telemetry.isRoundTerminal ? 'responded' : 'prompt_requested',
          input_tokens: executionRound.model_usage.input_tokens,
          cached_input_tokens: executionRound.model_usage.cached_input_tokens,
          output_tokens: executionRound.model_usage.output_tokens,
          llm_calls: executionRound.model_usage.llm_calls,
          model: executionRound.model_usage.model,
          model_provider: modelProvider,
          started_at: executionRound.started_at,
          time_to_first_token: executionRound.time_to_first_token,
          time_to_last_token: executionRound.time_to_last_token,
          tools_invoked: toolCallSteps.map((step) =>
            normalizeToolIdForTelemetry(step.tool_id, step.tool_type)
          ),
          tool_calls: toolCallSteps.length,
          tool_call_errors: toolCallErrors.length,
          message_length: roundTotals.input.message.length,
          response_length: executionRound.response.message.length,
          ...(telemetry.pendingPromptTypes.length > 0
            ? {
                prompt_count: telemetry.pendingPromptTypes.length,
                prompt_types: telemetry.pendingPromptTypes,
              }
            : {}),
          ...(telemetry.promptResponseTypes.length > 0
            ? {
                prompt_response_types: telemetry.promptResponseTypes,
                prompt_response_outcomes: telemetry.promptResponseOutcomes,
              }
            : {}),
          ...(telemetry.humanLatencyMs !== undefined
            ? { human_latency_ms: telemetry.humanLatencyMs }
            : {}),
        }
      );
    } catch (error) {
      // Do not fail the request if telemetry fails
      this.logger.debug('Failed to report ExecutionComplete telemetry event', { error });
    }
  }

  reportRoundError({
    agentId,
    conversationId,
    executionId,
    error,
    modelProvider,
    roundId,
  }: {
    agentId: string;
    conversationId?: string;
    executionId?: string;
    error: unknown;
    modelProvider: ModelProvider;
    roundId?: string;
  }): void {
    try {
      const normalizedAgentId = normalizeAgentIdForTelemetry(agentId);
      const errorType = sanitizeForCounterName(normalizeErrorType(error));
      const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      this.analytics.reportEvent<ReportRoundErrorParams>(AGENT_BUILDER_EVENT_TYPES.RoundError, {
        agent_id: normalizedAgentId ?? 'unknown',
        conversation_id: conversationId,
        execution_id: executionId,
        round_id: roundId,
        model_provider: modelProvider,
        error_message: errorMessage,
        error_type: errorType,
      });
    } catch (err) {
      // Do not fail the request if telemetry fails
      this.logger.debug('Failed to report RoundError telemetry event', { error: err });
    }
  }

  reportToolCallSuccess({
    agentId,
    conversationId,
    executionId,
    toolId,
    toolType,
    toolCallId,
    source,
    resultTypes,
    duration,
  }: {
    agentId?: string;
    conversationId?: string;
    executionId?: string;
    toolId: string;
    toolType?: ToolType | string;
    toolCallId: string;
    source: string;
    resultTypes: string[];
    duration: number;
  }): void {
    try {
      this.analytics.reportEvent<ReportToolCallSuccessParams>(
        AGENT_BUILDER_EVENT_TYPES.ToolCallSuccess,
        {
          agent_id: normalizeAgentIdForTelemetry(agentId),
          conversation_id: conversationId,
          execution_id: executionId,
          tool_id: normalizeToolIdForTelemetry(toolId, toolType),
          tool_call_id: toolCallId,
          source,
          result_types: resultTypes,
          duration_ms: duration,
        }
      );
    } catch (error) {
      this.logger.debug('Failed to report ToolCallSuccess telemetry event', { error });
    }
  }

  reportToolCallError({
    agentId,
    conversationId,
    executionId,
    toolId,
    toolType,
    toolCallId,
    source,
    errorType,
    errorMessage,
    duration,
  }: {
    agentId?: string;
    conversationId?: string;
    executionId?: string;
    toolId: string;
    toolType?: ToolType | string;
    toolCallId: string;
    source: string;
    errorType: string;
    errorMessage: string;
    duration: number;
  }): void {
    try {
      this.analytics.reportEvent<ReportToolCallErrorParams>(
        AGENT_BUILDER_EVENT_TYPES.ToolCallError,
        {
          agent_id: normalizeAgentIdForTelemetry(agentId),
          conversation_id: conversationId,
          execution_id: executionId,
          tool_id: normalizeToolIdForTelemetry(toolId, toolType),
          tool_call_id: toolCallId,
          source,
          error_type: sanitizeForCounterName(errorType),
          error_message: errorMessage.slice(0, 500),
          duration_ms: duration,
        }
      );
    } catch (error) {
      this.logger.debug('Failed to report ToolCallError telemetry event', { error });
    }
  }
}
