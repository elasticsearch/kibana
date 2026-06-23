/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { getOrResolveObject } from '../../common/utils';
import { mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema } from '../builtin_workflow_input_definitions';

export function getWorkflowJsonSchema(zodSchema: z.ZodType): z.core.JSONSchema.JSONSchema | null {
  try {
    // Unwrap ZodPipe/ZodTransform/ZodEffects to get the base schema for JSON Schema generation
    // z.toJSONSchema on a transform/pipe schema may not generate the correct structure for Monaco YAML
    // We need to use the base schema (before transform) to get proper property definitions
    let schemaToConvert = zodSchema;

    // Check if it's a ZodPipe (which is used when chaining transforms)
    const def = zodSchema._def as {
      type?: string;
      in?: z.ZodType;
      out?: z.ZodType;
      typeName?: string;
      effect?: { type?: string; schema?: z.ZodType };
      schema?: z.ZodType;
    };

    if (def.type === 'pipe' && def.in) {
      // ZodPipe: use the input schema (before pipe)
      schemaToConvert = def.in;
    } else if (def.typeName === 'ZodEffects') {
      if (def.effect?.type === 'transform' && def.effect.schema) {
        // ZodEffects with transform: use the input schema
        schemaToConvert = def.effect.schema;
      } else if (def.effect?.type === 'refinement' && def.schema) {
        // ZodEffects with refine: unwrap to get base schema for JSON Schema generation
        schemaToConvert = def.schema;
      }
    }

    const jsonSchema = z.toJSONSchema(schemaToConvert, {
      target: 'draft-7',
      unrepresentable: 'any', // do not throw an error for unrepresentable types
      reused: 'ref', // using ref reduces the size of the schema 4x
      override: (ctx) => {
        filterRequiredFields(ctx);
        removeAdditionalPropertiesFromAllOfItems(ctx);
        setMarkdownDescriptionIfSyntaxDetected(ctx);
      },
    });

    return mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema(
      stripNestedSchemaIds(jsonSchema) as z.core.JSONSchema.JSONSchema
    );
  } catch (error) {
    // console.error('Error generating JSON schema from YAML schema:', error);
    return null;
  }
}

/**
 * Some JSON Schema consumers resolve relative `$ref` values against the nearest `$id` scope.
 * After migrating to Zod v4, nested schemas can contain generated refs like `#/definitions/__schemaN`.
 * If a nested object also has `$id`, those refs may resolve from that nested scope ("from id ...")
 * instead of the root schema and break validation or tooling.
 *
 * We strip non-root `$id` fields so draft-7 root-level `definitions` refs stay resolvable.
 */
function stripNestedSchemaIds(node: unknown, isRoot = true): unknown {
  if (node === null || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => stripNestedSchemaIds(item, false));
  }

  const schemaObject = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schemaObject)) {
    if (isRoot || key !== '$id') {
      result[key] = stripNestedSchemaIds(value, false);
    }
  }

  return result;
}

// this function MODIFIES the jsonSchema in place
function filterRequiredFields(ctx: {
  zodSchema: z.core.$ZodTypes;
  jsonSchema: z.core.JSONSchema.BaseSchema;
  path: (string | number)[];
}) {
  // Adjust the 'required' array on object schemas because we validating user input not the result of safeParse.
  // we'd love to use 'io:input' but it results in memory leak currently
  if (ctx.jsonSchema.required && ctx.jsonSchema.required.length > 0) {
    const newRequired = ctx.jsonSchema.required.filter((field) => {
      const fieldObject = ctx.jsonSchema.properties?.[field];
      if (!fieldObject) {
        // field is not defined in the schema, weird, skipping
        return false;
      }
      const fieldSchema = getOrResolveObject(
        fieldObject as z.core.JSONSchema.JSONSchema,
        ctx.jsonSchema
      );
      // Conservative approach: if we can't resolve the ref, keep as required
      // This happens when fieldObject is a $ref but ctx.jsonSchema doesn't have definitions
      // (definitions are only at the root level, not in nested contexts)
      if (!fieldSchema || typeof fieldSchema !== 'object') {
        return true; // Keep as required (safer default)
      }
      // filter out from 'required' array only if field has default or optional
      return !('default' in fieldSchema) && !('optional' in fieldSchema);
    });
    ctx.jsonSchema.required = newRequired.length > 0 ? newRequired : undefined;
  }
}

function removeAdditionalPropertiesFromAllOfItems(ctx: {
  zodSchema: z.core.$ZodTypes;
  jsonSchema: z.core.JSONSchema.BaseSchema;
  path: (string | number)[];
}) {
  const lastPathPart = ctx.path[ctx.path.length - 1];
  const secondLastPathPart = ctx.path[ctx.path.length - 2];
  // if we are inside an item of an allOf array, we need to remove additionalProperties
  if (
    typeof lastPathPart === 'number' &&
    typeof secondLastPathPart === 'string' &&
    secondLastPathPart === 'allOf'
  ) {
    ctx.jsonSchema.additionalProperties = undefined;
  }
}

function setMarkdownDescriptionIfSyntaxDetected(ctx: {
  zodSchema: z.core.$ZodTypes;
  jsonSchema: z.core.JSONSchema.BaseSchema;
  path: (string | number)[];
}) {
  const description = ctx.jsonSchema.description;
  if (!description) {
    return;
  }
  const isMarkdown = /[\\`*_{}[\]()#+\-.!]/g.test(description);
  if (!isMarkdown) {
    return;
  }
  ctx.jsonSchema.markdownDescription = description;
}
