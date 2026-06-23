/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import {
  withActiveInferenceSpan,
  ElasticGenAIAttributes,
  GenAISemanticConventions,
} from '@kbn/inference-tracing';
import type { AgentDefinition } from '@kbn/agent-builder-common';
import type { AgentHandlerReturn } from '@kbn/agent-builder-server';

interface WithAgentSpanOptions {
  agent: AgentDefinition;
  conversationId?: string;
  providerName?: string;
}

export function withAgentSpan(
  { agent, conversationId, providerName }: WithAgentSpanOptions,
  cb: (span?: Span) => Promise<AgentHandlerReturn>
): Promise<AgentHandlerReturn> {
  const { id: agentId, name } = agent;
  return withActiveInferenceSpan(
    `invoke_agent ${name}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        [ElasticGenAIAttributes.InferenceSpanKind]: 'AGENT',
        [GenAISemanticConventions.GenAIOperationName]: 'invoke_agent',
        [GenAISemanticConventions.GenAIAgentId]: agentId,
        [GenAISemanticConventions.GenAIAgentName]: name,
        [GenAISemanticConventions.GenAIProviderName]: providerName,
        [GenAISemanticConventions.GenAIConversationId]: conversationId,
      },
    },
    (span) => {
      if (!span) {
        return cb();
      }

      return cb(span);
    }
  );
}
