/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JSONSchema7 } from 'json-schema';
import { z } from '@kbn/zod/v4';
import { fromJSONSchema } from '@kbn/zod/v4/from_json_schema';
import { resolveRef } from './field_conversion';

const hasNamedProperties = (jsonSchema: JSONSchema7): boolean =>
  jsonSchema.properties != null && Object.keys(jsonSchema.properties).length > 0;

/**
 * Applies `additionalProperties` that fromJSONSchema does not preserve at this wrapper layer.
 *
 * - `false` → `.strict()` so extra keys are rejected
 * - a schema object → `z.record` (no named properties) or `.catchall` (named + extras), so
 *   `getSchemaAtPath` can walk unknown keys into the value shape
 *
 * Limitation: this only applies at the schema node passed directly to the converter
 * mainly for maintaining backwards compatibility with legacy flat inputs.
 * Keywords nested inside `items` or deeply nested `properties` are compiled by
 * fromJSONSchema before enrichment runs, so they cannot be reached here.
 */
function applyAdditionalProperties(
  jsonSchema: JSONSchema7,
  zodResult: z.ZodType,
  convertValue?: (schema: JSONSchema7) => z.ZodType
): z.ZodType {
  if (jsonSchema.additionalProperties === false && zodResult instanceof z.ZodObject) {
    return zodResult.strict();
  }

  const additional = jsonSchema.additionalProperties;
  if (convertValue && additional && typeof additional === 'object') {
    const valueSchema = convertValue(additional as JSONSchema7);
    if (!hasNamedProperties(jsonSchema)) {
      return z.record(z.string(), valueSchema);
    }
    if (zodResult instanceof z.ZodObject) {
      return zodResult.catchall(valueSchema);
    }
    if (zodResult instanceof z.ZodRecord) {
      return zodResult;
    }
    return z.record(z.string(), valueSchema);
  }

  return zodResult;
}

/**
 * Enriches a Zod schema with constraints that the fromJSONSchema polyfill does not implement.
 * Add a new `applyX` call here whenever a new keyword X is supported in this wrapper.
 */
function enrichZodSchema(
  jsonSchema: JSONSchema7,
  zodResult: z.ZodType,
  convertValue?: (schema: JSONSchema7) => z.ZodType
): z.ZodType {
  return applyAdditionalProperties(jsonSchema, zodResult, convertValue);
}

/** Root schema type for $ref resolution (same as resolveRef's second parameter). */
type RootSchemaType = Parameters<typeof resolveRef>[1];

/**
 * Converts a JSON Schema to a Zod schema using fromJSONSchema.
 * Used as fallback when fromJSONSchema returns undefined or for $ref placeholders.
 */
export function convertJsonSchemaToZod(jsonSchema: JSONSchema7 | null | undefined): z.ZodType {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.any();
  }
  if (jsonSchema.$ref) {
    return z.any();
  }
  const zodSchema = fromJSONSchema(jsonSchema as Record<string, unknown>);
  if (zodSchema !== undefined) {
    return enrichZodSchema(jsonSchema, zodSchema, convertJsonSchemaToZod);
  }
  return z.any();
}

/**
 * Recursively converts a JSON Schema to a Zod schema, resolving $ref against the root schema.
 * Use when you have a root schema (e.g. workflow inputs/outputs) and property schemas that may reference it.
 */
export function convertJsonSchemaToZodWithRefs(
  jsonSchema: JSONSchema7,
  rootSchema: RootSchemaType
): z.ZodType {
  let schemaToConvert = jsonSchema;
  if (jsonSchema.$ref) {
    const resolved = resolveRef(jsonSchema.$ref, rootSchema);
    if (resolved) {
      schemaToConvert = resolved;
    }
  }

  const convertValue = (schema: JSONSchema7): z.ZodType =>
    convertJsonSchemaToZodWithRefs(schema, rootSchema);

  const zodSchema = fromJSONSchema(schemaToConvert as Record<string, unknown>);
  if (zodSchema !== undefined) {
    return enrichZodSchema(schemaToConvert, zodSchema, convertValue);
  }

  if (schemaToConvert.type === 'object' && schemaToConvert.properties) {
    const shape: Record<string, z.ZodType> = {};
    for (const [key, propSchema] of Object.entries(schemaToConvert.properties)) {
      const prop = propSchema as JSONSchema7;
      let zodProp = convertJsonSchemaToZodWithRefs(prop, rootSchema);
      const isRequired = schemaToConvert.required?.includes(key) ?? false;
      if (prop.default !== undefined) {
        zodProp = zodProp.default(prop.default);
      } else if (!isRequired) {
        zodProp = zodProp.optional();
      }
      shape[key] = zodProp;
    }
    return enrichZodSchema(schemaToConvert, z.object(shape), convertValue);
  }

  return convertJsonSchemaToZod(schemaToConvert);
}

/**
 * Builds a Zod validator for workflow fields (inputs or outputs) from a normalized JSON Schema
 * (object with properties, required, etc.). Handles required/optional, defaults, and $ref resolution.
 * Use after normalizeFieldsToJsonSchema when validating field payloads.
 */
export function buildFieldsZodValidator(
  schema: RootSchemaType | null | undefined
): z.ZodType<Record<string, unknown>> {
  if (!schema?.properties || typeof schema.properties !== 'object') {
    return z.object({});
  }

  const shape: Record<string, z.ZodType> = {};
  for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
    if (propertySchema && typeof propertySchema === 'object') {
      const jsonSchema = propertySchema as JSONSchema7;
      const resolvedSchema = jsonSchema.$ref
        ? resolveRef(jsonSchema.$ref, schema) || jsonSchema
        : jsonSchema;
      let zodSchema: z.ZodType = convertJsonSchemaToZodWithRefs(jsonSchema, schema);
      if (resolvedSchema.default !== undefined) {
        zodSchema = zodSchema.default(resolvedSchema.default);
      }
      const isRequired = schema.required?.includes(propertyName) ?? false;
      if (!isRequired && resolvedSchema.default === undefined) {
        zodSchema = zodSchema.optional();
      }
      shape[propertyName] = zodSchema;
    }
  }
  return enrichZodSchema(schema as JSONSchema7, z.object(shape), (valueSchema) =>
    convertJsonSchemaToZodWithRefs(valueSchema, schema)
  ) as z.ZodType<Record<string, unknown>>;
}
