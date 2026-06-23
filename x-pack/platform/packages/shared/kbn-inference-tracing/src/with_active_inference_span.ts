/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { core } from '@elastic/opentelemetry-node/sdk';
import { createWithActiveSpan, withActiveSpan } from '@kbn/tracing-utils';
import { propagation } from '@opentelemetry/api';
import { createInferenceContext } from './create_inference_context';
import { getInferenceTracer } from './inference_tracer_provider';
import {
  EXECUTION_ID_BAGGAGE_KEY,
  EVAL_EXPERIMENT_ID_BAGGAGE_KEY,
  CONVERSATION_ID_BAGGAGE_KEY,
} from './baggage';
import { IS_ROOT_INFERENCE_SPAN_ATTRIBUTE_NAME } from './root_inference_span';
import { GenAISemanticConventions } from './types';

/**
 * Creates an active "inference"-scoped span, that is, every span created in this
 * context will be exported via the inference exporters. This allows us to export
 * a subset of spans to external systems like Phoenix.
 */

export const withActiveInferenceSpan = createWithActiveSpan({}, (name, opts, ctx, cb) => {
  if (core.isTracingSuppressed(ctx)) {
    return cb();
  }

  const { context: parentContext, isRoot } = createInferenceContext();
  const baggage = propagation.getBaggage(parentContext);
  const executionId = baggage?.getEntry(EXECUTION_ID_BAGGAGE_KEY)?.value;
  const experimentId = baggage?.getEntry(EVAL_EXPERIMENT_ID_BAGGAGE_KEY)?.value;
  const conversationId = baggage?.getEntry(CONVERSATION_ID_BAGGAGE_KEY)?.value;

  return withActiveSpan(
    name,
    {
      ...opts,
      tracer: getInferenceTracer(),
      attributes: {
        [IS_ROOT_INFERENCE_SPAN_ATTRIBUTE_NAME]: isRoot,
        ...(executionId ? { [EXECUTION_ID_BAGGAGE_KEY]: executionId } : {}),
        ...(experimentId ? { [EVAL_EXPERIMENT_ID_BAGGAGE_KEY]: experimentId } : {}),
        ...(conversationId
          ? { [GenAISemanticConventions.GenAIConversationId]: conversationId }
          : {}),
        ...opts.attributes,
      },
    },
    parentContext,
    (span) => {
      return cb(span);
    }
  );
});
