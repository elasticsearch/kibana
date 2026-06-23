/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { builtinWorkflowInputDefinitionRefSchema } from '../../builtin_workflow_input_definitions';

/**
 * JSON Schema type values (Draft 7 / 2020-12 standard).
 * Single source of truth – used in both the Zod schema definition
 * and YAML editor autocomplete suggestions.
 */
export const JSON_SCHEMA_TYPE_VALUES = [
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
] as const;

export type JsonSchemaType = (typeof JSON_SCHEMA_TYPE_VALUES)[number];

/**
 * Common JSON Schema format annotation values (Draft 7 / 2020-12 standard).
 * Single source of truth for autocomplete suggestions.
 * Reference: https://json-schema.org/draft-07/schema#section-7.3
 *
 * Only formats that fromJSONSchema actively validates are listed here.
 * Omitted formats (ipv4, ipv6, hostname, regex, etc.) are not enforced by the
 * converter, so we don't suggest them — users can use `pattern` instead.
 */
export const JSON_SCHEMA_FORMAT_VALUES = [
  'date-time',
  'date',
  'time',
  'email',
  'uuid',
  'uri',
] as const;

export interface JsonSchema {
  [key: string]: unknown;
  type?: JsonSchemaType | JsonSchemaType[];
  title?: string;
  description?: string;
  format?: string;
  default?: string | number | boolean | null | object;
  $ref?: string;

  // Logical Composition (allOf is omitted)
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];

  // Structure
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema | JsonSchema[];
  required?: string[];

  // Reusability
  definitions?: Record<string, JsonSchema>;
  $defs?: Record<string, JsonSchema>;

  // Constraints
  enum?: (string | number | boolean | null | object)[];
  const?: string | number | boolean | null | object;
  multipleOf?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

/**
 * JSON Schema property keywords available for autocomplete.
 * Derived from JsonSchema type – the `satisfies` clause ensures
 * every entry is a valid key of JsonSchema.
 * Update this list when adding new fields to the JsonSchema type.
 */
export const JSON_SCHEMA_PROPERTY_KEYS = [
  'type',
  'title',
  'description',
  'format',
  'default',
  'enum',
  'const',
  'properties',
  'additionalProperties',
  'required',
  'items',
  'anyOf',
  'oneOf',
  '$ref',
  'definitions',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
] as const satisfies readonly (keyof JsonSchema)[];

/** Shared `type` keyword (single type or array of types). */
const jsonSchemaTypeField = z
  .union([z.enum(JSON_SCHEMA_TYPE_VALUES), z.array(z.enum(JSON_SCHEMA_TYPE_VALUES))])
  .optional();

/**
 * Zod schema representing any JSON Schema node (Draft 7 / 2020-12)
 * Used recursively inside property definitions, anyOf/oneOf, etc...
 * Only includes keywords that the fromJSONSchema converter actually enforces
 */
export const JsonModelShapeSchema: z.ZodType<JsonSchema> = z
  .lazy(() =>
    z.object({
      type: jsonSchemaTypeField,
      title: z.string().optional(),
      description: z.string().optional(),
      format: z.enum(JSON_SCHEMA_FORMAT_VALUES).optional(),
      default: z.any().optional(),
      $ref: builtinWorkflowInputDefinitionRefSchema.optional(),

      // --- Logical Operators ---
      anyOf: z.array(JsonModelShapeSchema).optional(),
      oneOf: z.array(JsonModelShapeSchema).optional(),

      // --- Object Properties ---
      properties: z.record(z.string(), JsonModelShapeSchema).optional(),
      additionalProperties: z.boolean().optional(),
      required: z.array(z.string()).optional(),

      // --- Array Properties ---
      items: z.union([JsonModelShapeSchema, z.array(JsonModelShapeSchema)]).optional(),
      minItems: z.number().int().nonnegative().optional(),
      maxItems: z.number().int().nonnegative().optional(),
      uniqueItems: z.boolean().optional(),

      // --- Reusability ---
      definitions: z.record(z.string(), JsonModelShapeSchema).optional(),
      $defs: z.record(z.string(), JsonModelShapeSchema).optional(),

      // --- Value Constraints ---
      const: z.any().optional(),
      enum: z.array(z.any()).optional(),
      multipleOf: z.number().positive().optional(),
      minimum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      pattern: z.string().optional(),
    })
  )
  .meta({ jsonSchemaModel: true });

/**
 * Root-level JSON Schema shape for workflow inputs.
 * Only exposes object-level keywords (properties, required, definitions, etc.)
 * so that monaco-yaml autocomplete at the `inputs:` level does not suggest
 * irrelevant constraint keywords like enum, maxLength, minimum, etc.
 * Individual property schemas inside `properties` still use the full
 * JsonModelShapeSchema with all keywords available.
 */
export const JsonModelRootShapeSchema = z
  .object({
    type: z.literal('object').optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    $ref: builtinWorkflowInputDefinitionRefSchema.optional(),
    properties: z.record(z.string(), JsonModelShapeSchema).optional(),
    additionalProperties: z.boolean().optional(),
    required: z.array(z.string()).optional(),
    definitions: z.record(z.string(), JsonModelShapeSchema).optional(),
    $defs: z.record(z.string(), JsonModelShapeSchema).optional(),
  })
  .meta({ jsonSchemaModel: true });
