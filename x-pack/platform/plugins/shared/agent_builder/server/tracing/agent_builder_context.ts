/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { api } from '@elastic/opentelemetry-node/sdk';
import type { tracing } from '@elastic/opentelemetry-node/sdk';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { isInferenceSpan, CONVERSATION_ID_BAGGAGE_KEY } from '@kbn/inference-tracing';

export const AGENT_BUILDER_OWNER_BAGGAGE_KEY = 'kibana.agent_builder';
export const AGENT_BUILDER_OWNER_BAGGAGE_VALUE = '1';
export const SPACE_ID_BAGGAGE_KEY = 'agent_builder.space_id';
export const DATA_STREAM_NAMESPACE_ATTR = 'data_stream.namespace';

/**
 * Executes a function within a context that has the Agent Builder ownership baggage set,
 * along with an optional space ID for data stream routing.
 * All descendant inference spans created inside this context will be tagged as Agent Builder spans,
 * allowing the AgentBuilderSpanProcessor to filter them from other inference consumers.
 */
export const withAgentBuilderContext = <T>(
  fn: () => T,
  options?: { spaceId?: string; conversationId?: string }
): T => {
  const ctx = otelContext.active();
  let baggage = propagation.getBaggage(ctx) ?? propagation.createBaggage();
  baggage = baggage.setEntry(AGENT_BUILDER_OWNER_BAGGAGE_KEY, {
    value: AGENT_BUILDER_OWNER_BAGGAGE_VALUE,
  });
  if (options?.spaceId) {
    baggage = baggage.setEntry(SPACE_ID_BAGGAGE_KEY, { value: options.spaceId });
  }
  if (options?.conversationId) {
    baggage = baggage.setEntry(CONVERSATION_ID_BAGGAGE_KEY, { value: options.conversationId });
  }
  const updatedContext = propagation.setBaggage(ctx, baggage);

  return otelContext.with(updatedContext, fn);
};

/**
 * Checks whether a span originates from Agent Builder by inspecting baggage
 * and verifying it is an inference span.
 */
export const isAgentBuilderSpan = (span: tracing.Span, parentContext: api.Context): boolean => {
  const baggage = propagation.getBaggage(parentContext);
  const isFromAgentBuilder =
    baggage?.getEntry(AGENT_BUILDER_OWNER_BAGGAGE_KEY)?.value === AGENT_BUILDER_OWNER_BAGGAGE_VALUE;
  return isFromAgentBuilder && isInferenceSpan(span, parentContext);
};
