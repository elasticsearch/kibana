/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  INPUT_VALUE,
  OUTPUT_VALUE,
  SemanticConventions,
} from '@arizeai/openinference-semantic-conventions';
import type { tracing } from '@elastic/opentelemetry-node/sdk';
import { GenAISemanticConventions } from '../types';

export function getExecuteToolSpan(span: tracing.ReadableSpan) {
  span.attributes[SemanticConventions.TOOL_PARAMETERS] =
    span.attributes[GenAISemanticConventions.GenAIToolCallArguments];
  span.attributes[SemanticConventions.TOOL_DESCRIPTION] =
    span.attributes[GenAISemanticConventions.GenAIToolDescription];

  const toolArgs = span.attributes[GenAISemanticConventions.GenAIToolCallArguments];
  if (toolArgs) {
    span.attributes[INPUT_VALUE] = String(toolArgs);
  }

  const toolResult = span.attributes[GenAISemanticConventions.GenAIToolCallResult];
  if (toolResult) {
    span.attributes[OUTPUT_VALUE] = toolResult;
  }

  return span;
}
