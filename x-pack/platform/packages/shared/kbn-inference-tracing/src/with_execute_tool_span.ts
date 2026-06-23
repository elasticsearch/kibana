/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { isPromise } from 'util/types';
import { safeJsonStringify } from '@kbn/std';
import type { WithActiveSpanOptions } from '@kbn/tracing-utils';
import { ElasticGenAIAttributes, GenAISemanticConventions } from './types';
import { withActiveInferenceSpan } from './with_active_inference_span';

/**
 * Wrapper around {@link withActiveInferenceSpan} that sets the right attributes for a execute_tool operation span.
 * @param options
 * @param cb
 */
export function withExecuteToolSpan<T>(
  toolName: string,
  options: WithActiveSpanOptions & {
    tool: {
      description?: string;
      toolCallId?: string;
      input?: unknown;
    };
  },
  cb: (span?: Span) => T
): T {
  const { description, toolCallId, input } = options.tool;

  return withActiveInferenceSpan(
    `execute_tool ${toolName}`,
    {
      ...options,
      kind: SpanKind.INTERNAL,
      attributes: {
        ...options.attributes,
        [GenAISemanticConventions.GenAIToolName]: toolName,
        [GenAISemanticConventions.GenAIOperationName]: 'execute_tool',
        [GenAISemanticConventions.GenAIToolCallId]: toolCallId,
        [ElasticGenAIAttributes.InferenceSpanKind]: 'TOOL',
        [GenAISemanticConventions.GenAIToolDescription]: description,
        [GenAISemanticConventions.GenAIToolCallArguments]: safeJsonStringify(input),
        [GenAISemanticConventions.GenAIToolType]: 'extension',
      },
    },
    (span) => {
      if (!span) {
        return cb();
      }

      const res = cb(span);

      if (isPromise(res)) {
        return res.then((value) => {
          const stringified = safeJsonStringify(value);
          if (stringified) {
            span.setAttribute(GenAISemanticConventions.GenAIToolCallResult, stringified);
          }
          return value;
        }) as T;
      }

      return res;
    }
  );
}
