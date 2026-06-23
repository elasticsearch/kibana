/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Observable } from 'rxjs';
import {
  withActiveInferenceSpan,
  ElasticGenAIAttributes,
  GenAISemanticConventions,
} from '@kbn/inference-tracing';
import type { ChatEvent } from '@kbn/agent-builder-common';
import {
  attachOpikDistributedTrace,
  type OpikDistributedTraceHeaders,
} from './opik_distributed_tracing';
import { withAgentBuilderContext } from './agent_builder_context';

interface WithConverseSpanOptions {
  agentId: string;
  agentName: string;
  providerName: string;
  conversationId: string | undefined;
  spaceId: string;
  opikHeaders?: OpikDistributedTraceHeaders;
}

export function withConverseSpan(
  {
    agentId,
    agentName,
    providerName,
    conversationId,
    spaceId,
    opikHeaders,
  }: WithConverseSpanOptions,
  cb: (span?: Span) => Observable<ChatEvent>
): Observable<ChatEvent> {
  return withAgentBuilderContext(
    () =>
      withActiveInferenceSpan(
        `invoke_agent ${agentName}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            [ElasticGenAIAttributes.InferenceSpanKind]: 'CHAIN',
            [GenAISemanticConventions.GenAIOperationName]: 'invoke_agent',
            [GenAISemanticConventions.GenAIAgentId]: agentId,
            [GenAISemanticConventions.GenAIAgentName]: agentName,
            [GenAISemanticConventions.GenAIProviderName]: providerName,
            [GenAISemanticConventions.GenAIConversationId]: conversationId,
          },
        },
        (span) => {
          if (!span) {
            return cb();
          }

          if (opikHeaders) {
            attachOpikDistributedTrace(span, opikHeaders);
          }

          return cb(span);
        }
      ),
    { spaceId, conversationId }
  );
}
