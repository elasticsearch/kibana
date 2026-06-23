/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { api } from '@elastic/opentelemetry-node/sdk';
import { resources, tracing } from '@elastic/opentelemetry-node/sdk';
import { GenAISemanticConventions } from '@kbn/inference-tracing';
import { DATA_STREAM_NAMESPACE_ATTR, isAgentBuilderSpan } from './agent_builder_context';
import { normalizeAgentIdForTelemetry, toHashedId } from '../telemetry/utils';

const SHOULD_TRACK_ATTR = '_agent_builder_should_track';

interface AgentBuilderSpanProcessorOpts {
  exporter: tracing.SpanExporter;
  scheduledDelayMillis: number;
  isEnabled?: () => boolean;
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
 * Span processor that exports Agent Builder inference spans.
 */
export class AgentBuilderSpanProcessor implements tracing.SpanProcessor {
  private readonly batchProcessor: tracing.SpanProcessor;
  private readonly isEnabled: () => boolean;

  constructor(opts: AgentBuilderSpanProcessorOpts) {
    this.batchProcessor = new tracing.BatchSpanProcessor(opts.exporter, {
      scheduledDelayMillis: opts.scheduledDelayMillis,
    });
    this.isEnabled = opts.isEnabled ?? (() => true);
  }

  async onStart(span: tracing.Span, parentContext: api.Context): Promise<void> {
    if (!this.isEnabled()) {
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

    const {
      [SHOULD_TRACK_ATTR]: _,
      _should_track: __,
      [DATA_STREAM_NAMESPACE_ATTR]: namespace,
      ...cleanAttributes
    } = span.attributes;

    const hashedAttributes = hashSensitiveAttributes(cleanAttributes);

    const datasetResource = resources.resourceFromAttributes({
      'data_stream.dataset': 'agent_builder',
      ...(typeof namespace === 'string' ? { [DATA_STREAM_NAMESPACE_ATTR]: namespace } : {}),
    });

    const exportSpan: tracing.ReadableSpan = Object.create(span, {
      resource: {
        value: span.resource.merge(datasetResource),
        enumerable: true,
      },
      attributes: {
        value: hashedAttributes,
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
