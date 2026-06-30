import type { JSONSchema7 } from 'json-schema';
import { z } from '@kbn/zod/v4';
import { resolveRef } from './field_conversion';
/** Root schema type for $ref resolution (same as resolveRef's second parameter). */
type RootSchemaType = Parameters<typeof resolveRef>[1];
/**
 * Converts a JSON Schema to a Zod schema using fromJSONSchema.
 * Used as fallback when fromJSONSchema returns undefined or for $ref placeholders.
 */
export declare function convertJsonSchemaToZod(jsonSchema: JSONSchema7 | null | undefined): z.ZodType;
/**
 * Recursively converts a JSON Schema to a Zod schema, resolving $ref against the root schema.
 * Use when you have a root schema (e.g. workflow inputs/outputs) and property schemas that may reference it.
 */
export declare function convertJsonSchemaToZodWithRefs(jsonSchema: JSONSchema7, rootSchema: RootSchemaType): z.ZodType;
/**
 * Builds a Zod validator for workflow fields (inputs or outputs) from a normalized JSON Schema
 * (object with properties, required, etc.). Handles required/optional, defaults, and $ref resolution.
 * Use after normalizeFieldsToJsonSchema when validating field payloads.
 */
export declare function buildFieldsZodValidator(schema: RootSchemaType | null | undefined): z.ZodType<Record<string, unknown>>;
export {};
