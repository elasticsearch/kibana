/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getFinalAssistantMessage, type TaskOutput } from '@kbn/evals';

/**
 * Extracts the assistant's text response from a task output.
 *
 * Reuses the shared `@kbn/evals` {@link getFinalAssistantMessage} (last
 * `messages[].message`) and falls back to the raw string / JSON when the output
 * is not in the standard messages shape. This single helper replaces the
 * previously-triplicated extraction logic in the orchestrator and both judges.
 *
 * @param maxLen Optional cap on the returned string length.
 */
export const extractResponseText = (output: TaskOutput, maxLen?: number): string => {
  let text: string;
  if (typeof output === 'string') {
    text = output;
  } else {
    const message = getFinalAssistantMessage(output);
    text = message || (output == null ? '' : JSON.stringify(output));
  }
  return maxLen !== undefined ? text.substring(0, maxLen) : text;
};
