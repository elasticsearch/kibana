/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isArray } from 'lodash';
import type { RunToolReturn } from '@kbn/agent-builder-server';
import { createErrorResult } from '@kbn/agent-builder-server';
import type { ToolCallResult } from '../actions';

/**
 * Recovers the structured tool return ({ results }) from an in-flight tool result,
 * which carries the structured payload on `artifact`. Falls back to an error result
 * for langchain tool-validation errors (schema errors), which emit no artifact.
 */
export const extractToolReturn = (message: ToolCallResult): RunToolReturn => {
  if (message.artifact) {
    if (!isArray(message.artifact.results)) {
      throw new Error(
        `Artifact is not a structured tool artifact. Received artifact=${JSON.stringify(
          message.artifact
        )}`
      );
    }

    return message.artifact as RunToolReturn;
  } else {
    // langchain tool validation error (such as schema errors) are out of our control and don't emit artifacts...
    if (message.content.startsWith('Error:')) {
      return {
        results: [createErrorResult(message.content)],
      };
    } else {
      throw new Error(`No artifact attached to tool message: ${JSON.stringify(message)}`);
    }
  }
};
