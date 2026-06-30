import type { JSONSchema7 } from 'json-schema';
/**
 * True when `schema` parses as `JsonModelShapeSchema` (workflow JSON-model surface).
 * Unknown keys use Zod’s default stripping on the modeled object shape.
 *
 * Used only from `JsonModelSchema` refinements in `json_model_schema.ts` (workflow `inputs` /
 * `outputs` and steps `with.schema`).
 */
export declare function isValidJsonSchema(schema: unknown): schema is JSONSchema7;
