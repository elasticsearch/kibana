/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getBuiltInStepDefinition } from '@kbn/workflows';
import type { GraphNodeUnion } from '@kbn/workflows/graph';
import { isAtomic } from '@kbn/workflows/graph';
import { z } from '@kbn/zod/v4';
import { fromJSONSchema } from '@kbn/zod/v4/from_json_schema';
import { structuralStepOutputSchemas } from './structural_step_output_schemas';
import { stepSchemas } from '../../../../common/step_schemas';

const waitForInputFallbackSchema: z.ZodSchema = z.record(z.string(), z.unknown());

export const getOutputSchemaForStepType = (node: GraphNodeUnion): z.ZodSchema => {
  // Handle internal actions with pattern matching first
  // TODO: add output schema support for elasticsearch.request and kibana.request connectors

  // waitForInput has a dynamic output schema derived from its with.schema field.
  // It is a built-in step so it is handled here directly rather than through the
  // extension registry (which is for user-space step types like data.map).
  if (node.stepType === 'waitForInput') {
    const jsonSchema =
      isAtomic(node) || 'configuration' in node
        ? ((node as { configuration?: { with?: { schema?: unknown } } }).configuration?.with
            ?.schema as Record<string, unknown> | undefined)
        : undefined;

    if (jsonSchema) {
      try {
        const zodSchema = fromJSONSchema(jsonSchema);
        if (zodSchema) return zodSchema as z.ZodSchema;
      } catch {
        // fall through to permissive fallback
      }
    }
    return waitForInputFallbackSchema;
  }

  if (node.stepType === 'waitForApproval') {
    const outputSchema = getBuiltInStepDefinition('waitForApproval')?.outputSchema;
    if (outputSchema) {
      return outputSchema as z.ZodSchema;
    }
  }

  if (isAtomic(node)) {
    const stepDefinition = stepSchemas.getStepDefinition(node.stepType);

    if (stepDefinition && stepSchemas.isPublicStepDefinition(stepDefinition)) {
      try {
        if (stepDefinition?.editorHandlers?.dynamicSchema?.getOutputSchema) {
          return stepDefinition.editorHandlers.dynamicSchema.getOutputSchema({
            input: node.configuration.with,
            config: node.configuration,
          });
        }
      } catch (error) {
        // If dynamic schema generation fails, fallback to static output schema
      }

      return stepDefinition.outputSchema;
    }
  }

  const allConnectorsMap = stepSchemas.getAllConnectorsMapCache();
  const connector = allConnectorsMap?.get(node.stepType);

  if (connector) {
    if (!connector.outputSchema) {
      // throw new Error(`Output schema not found for step type ${stepType}`);
      return z.unknown();
    }
    return connector.outputSchema;
  }

  const structuralSchema = structuralStepOutputSchemas[node.stepType];
  if (structuralSchema) {
    return structuralSchema;
  }

  // Fallback to unknown if not found
  return z.unknown();
};
