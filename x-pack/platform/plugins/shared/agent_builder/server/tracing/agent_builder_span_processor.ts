/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { api } from '@elastic/opentelemetry-node/sdk';
import { resources, tracing } from '@elastic/opentelemetry-node/sdk';
import { GenAISemanticConventions } from '@kbn/inference-tracing';
import { omitBy } from 'lodash';
import { isInternalTool } from '@kbn/agent-builder-common/tools';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import {
  AGENT_BUILDER_BUILTIN_AGENTS,
  AGENT_BUILDER_BUILTIN_TOOLS,
} from '@kbn/agent-builder-server/allow_lists';
import { DATA_STREAM_NAMESPACE_ATTR, isAgentBuilderSpan } from './agent_builder_context';
import { normalizeAgentIdForTelemetry, toHashedId } from '../telemetry/utils';

const BUILTIN_TOOL_IDS: Set<string> = new Set(AGENT_BUILDER_BUILTIN_TOOLS);
const BUILTIN_AGENT_IDS: Set<string> = new Set([
  agentBuilderDefaultAgentId,
  ...AGENT_BUILDER_BUILTIN_AGENTS,
]);

const SHOULD_TRACK_ATTR = '_agent_builder_should_track';

export interface TracingPrivacySettings {
  enabled: boolean;
  includeUserPrompts: boolean;
  includeLlmResponses: boolean;
  includeToolDetails: boolean;
  includeSystemPrompt: boolean;
  includeRealNames: boolean;
  includeRealIds: boolean;
}

interface AgentBuilderSpanProcessorOpts {
  exporter: tracing.SpanExporter;
  scheduledDelayMillis: number;
  getSettings: () => TracingPrivacySettings;
}

/**
 * Hashes security-sensitive identifiers on span attributes before export.
 * Built-in agent IDs are kept in plain text; user-owned IDs are hashed
 * using the same scheme as EBT telemetry (SHA-256, 16-char hex prefix).
 */
function hashSensitiveAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const result = { ...attributes };

  const agentId = result[GenAISemanticConventions.GenAIAgentId];
  if (agentId != null) {
    result[GenAISemanticConventions.GenAIAgentId] = normalizeAgentIdForTelemetry(String(agentId));
  }

  const conversationId = result[GenAISemanticConventions.GenAIConversationId];
  if (conversationId != null) {
    result[GenAISemanticConventions.GenAIConversationId] = toHashedId(String(conversationId));
  }

  const workflowId = result['elastic.workflow.id'];
  if (workflowId != null) {
    result['elastic.workflow.id'] = toHashedId(String(workflowId));
  }

  const workflowExecId = result['elastic.workflow.execution_id'];
  if (workflowExecId != null) {
    result['elastic.workflow.execution_id'] = toHashedId(String(workflowExecId));
  }

  return result;
}

/**
 * Replaces user-created tool, agent, and workflow names with 'custom' to avoid
 * leaking user-chosen identifiers. Built-in tools and agents keep their real names.
 * `gen_ai.tool.definitions` and `gen_ai.tool.description` are stripped entirely
 * because they embed arbitrary tool names and descriptions as free-form text/JSON
 * that cannot be selectively anonymized.
 * Returns the anonymized attributes and the (possibly rewritten) span name.
 */
function anonymizeNames(
  attributes: Record<string, unknown>,
  spanName: string
): { attributes: Record<string, unknown>; spanName: string } {
  const {
    [GenAISemanticConventions.GenAIToolDefinitions]: _defs,
    [GenAISemanticConventions.GenAIToolDescription]: _desc,
    ...result
  } = attributes;
  let finalSpanName = spanName;

  const agentName = result[GenAISemanticConventions.GenAIAgentName];
  if (agentName != null) {
    const agentId = result[GenAISemanticConventions.GenAIAgentId];
    const isBuiltin = agentId != null && BUILTIN_AGENT_IDS.has(String(agentId));
    result[GenAISemanticConventions.GenAIAgentName] = isBuiltin ? agentName : 'custom';
    if (!isBuiltin) {
      if (finalSpanName.startsWith('invoke_agent')) {
        finalSpanName = `invoke_agent custom`;
      }
    }
  }

  const toolName = result[GenAISemanticConventions.GenAIToolName];
  if (toolName != null) {
    const isBuiltin = BUILTIN_TOOL_IDS.has(String(toolName)) || isInternalTool(String(toolName));
    result[GenAISemanticConventions.GenAIToolName] = isBuiltin ? toolName : 'custom';
    if (!isBuiltin) {
      if (finalSpanName.startsWith('execute_tool')) {
        finalSpanName = `execute_tool custom`;
      }
    }
  }
  const workflowName = result[GenAISemanticConventions.GenAIWorkflowName];
  if (workflowName != null) {
    result[GenAISemanticConventions.GenAIWorkflowName] = 'custom';

    if (finalSpanName.startsWith('invoke_workflow')) {
      finalSpanName = `invoke_workflow custom`;
    }
  }

  return { attributes: result, spanName: finalSpanName };
}

/**
 * Strips tool call I/O (arguments and result) from attributes to avoid leaking
 * the content of tool calls and their results.
 */
function stripToolCallIO(attributes: Record<string, unknown>): Record<string, unknown> {
  const {
    [GenAISemanticConventions.GenAIToolCallArguments]: _args,
    [GenAISemanticConventions.GenAIToolCallResult]: _result,
    ...rest
  } = attributes;
  return rest;
}

function stripToolCallsFromEventAttributes(eventAttributes: api.Attributes): api.Attributes {
  return omitBy(
    eventAttributes,
    (_value, key) => key.startsWith('tool_calls.') || key.startsWith('message.tool_calls.')
  );
}

// Matches `tool_calls.0.function.name` and `message.tool_calls.0.function.name`
const TOOL_NAME_KEY_RE = /^(?:message\.)?tool_calls\.\d+\.function\.name$/;

function anonymizeToolNamesInEventAttributes(eventAttributes: api.Attributes): api.Attributes {
  const result: api.Attributes = {};
  for (const [key, value] of Object.entries(eventAttributes)) {
    if (
      TOOL_NAME_KEY_RE.test(key) &&
      typeof value === 'string' &&
      !BUILTIN_TOOL_IDS.has(value) &&
      !isInternalTool(value)
    ) {
      result[key] = 'custom';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Filters and sanitizes span events based on privacy settings.
 * Drops entire events whose content category is disabled, and strips
 * `message.tool_calls.*` from assistant/choice events when tool details are off.
 */
function applyEventPrivacyFilters(
  events: tracing.TimedEvent[],
  settings: TracingPrivacySettings
): tracing.TimedEvent[] {
  return events.reduce<tracing.TimedEvent[]>((acc, event) => {
    if (!settings.includeSystemPrompt && event.name === 'gen_ai.system.message') return acc;
    if (!settings.includeUserPrompts && event.name === 'gen_ai.user.message') return acc;
    if (
      !settings.includeLlmResponses &&
      (event.name === 'gen_ai.assistant.message' || event.name === 'gen_ai.choice')
    ) {
      return acc;
    }
    if (!settings.includeToolDetails && event.name === 'gen_ai.tool.message') return acc;

    const isAssistantOrChoice =
      event.name === 'gen_ai.assistant.message' || event.name === 'gen_ai.choice';

    if (!settings.includeToolDetails && isAssistantOrChoice) {
      acc.push({
        ...event,
        attributes: stripToolCallsFromEventAttributes(event.attributes ?? {}),
      });
      return acc;
    }

    if (!settings.includeRealNames && isAssistantOrChoice) {
      acc.push({
        ...event,
        attributes: anonymizeToolNamesInEventAttributes(event.attributes ?? {}),
      });
      return acc;
    }

    acc.push(event);
    return acc;
  }, []);
}

/**
 * Span processor that exports Agent Builder inference spans.
 */
export class AgentBuilderSpanProcessor implements tracing.SpanProcessor {
  private readonly batchProcessor: tracing.SpanProcessor;
  private readonly getSettings: () => TracingPrivacySettings;

  constructor(opts: AgentBuilderSpanProcessorOpts) {
    this.batchProcessor = new tracing.BatchSpanProcessor(opts.exporter, {
      scheduledDelayMillis: opts.scheduledDelayMillis,
    });
    this.getSettings = opts.getSettings;
  }

  async onStart(span: tracing.Span, parentContext: api.Context): Promise<void> {
    const settings = this.getSettings();
    if (!settings.enabled) {
      return;
    }
    if (isAgentBuilderSpan(span, parentContext)) {
      span.setAttribute(SHOULD_TRACK_ATTR, true);
      this.batchProcessor.onStart(span, parentContext);
    }
  }

  onEnd(span: tracing.ReadableSpan): void {
    if (!span.attributes[SHOULD_TRACK_ATTR]) {
      return;
    }

    const settings = this.getSettings();
    if (!settings.enabled) {
      return;
    }

    const filteredEvents = applyEventPrivacyFilters(span.events, settings);

    const {
      [SHOULD_TRACK_ATTR]: _,
      _should_track: __,
      [DATA_STREAM_NAMESPACE_ATTR]: namespace,
      ...cleanAttributes
    } = span.attributes;

    const processedAttributes = settings.includeRealIds
      ? cleanAttributes
      : hashSensitiveAttributes(cleanAttributes);

    const attributesAfterToolIO = settings.includeToolDetails
      ? processedAttributes
      : stripToolCallIO(processedAttributes);

    const { attributes: finalAttributes, spanName: finalSpanName } = settings.includeRealNames
      ? { attributes: attributesAfterToolIO, spanName: span.name }
      : anonymizeNames(attributesAfterToolIO, span.name);

    const datasetResource = resources.resourceFromAttributes({
      'data_stream.dataset': 'agent_builder',
      ...(typeof namespace === 'string' ? { [DATA_STREAM_NAMESPACE_ATTR]: namespace } : {}),
    });

    const exportSpan: tracing.ReadableSpan = Object.create(span, {
      resource: {
        value: span.resource.merge(datasetResource),
        enumerable: true,
      },
      name: {
        value: finalSpanName,
        enumerable: true,
      },
      attributes: {
        value: finalAttributes,
        enumerable: true,
      },
      events: {
        value: filteredEvents,
        enumerable: true,
      },
    });

    this.batchProcessor.onEnd(exportSpan);
  }

  forceFlush(): Promise<void> {
    return this.batchProcessor.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.batchProcessor.shutdown();
  }
}
