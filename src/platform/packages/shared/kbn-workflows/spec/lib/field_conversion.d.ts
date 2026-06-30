import type { JSONSchema7 } from 'json-schema';
import type { Document } from 'yaml';
import type { WorkflowOutput, WorkflowYaml } from '../schema';
import type { JsonModelSchemaType } from '../schema/common/json_model_schema';
import { type LegacyWorkflowInput } from '../schema/triggers/manual_trigger_schema';
export type NormalizableFieldSchema = JsonModelSchemaType | Array<LegacyWorkflowInput | WorkflowOutput>;
export type RenderInputValue = (value: unknown) => unknown;
/**
 * Converts legacy array-based field format to the new JSON Schema object format
 * @param legacyFields - Array of legacy field definitions (inputs or outputs)
 * @returns The fields in the new JSON Schema object format
 */
export declare function convertLegacyFieldsToJsonSchema(legacyFields: LegacyWorkflowInput[]): JsonModelSchemaType;
/**
 * Normalizes workflow fields (inputs or outputs) to the JSON Schema object format.
 * If fields are already in JSON Schema format, returns them as-is.
 * If fields are in the legacy array format, converts them.
 * Accepts unknown to avoid explicit casts at call sites (runtime checks handle validation).
 */
export declare function normalizeFieldsToJsonSchema(fields?: NormalizableFieldSchema | unknown): JsonModelSchemaType | undefined;
/**
 * Resolves workflow inputs from the definition and normalizes them to JSON Schema object form.
 *
 * When inputs exist and can be normalized, the return value is always {@link JsonModelSchemaType}
 * (never the legacy array-of-fields shape).
 *
 * Supports the legacy inputs format (array of field definitions) by converting it via
 * {@link normalizeFieldsToJsonSchema}.
 *
 * Falls back to root-level `inputs` on the definition for backward compatibility when the manual
 * trigger block has no inputs.
 */
export declare const getInputsFromDefinition: (definition: WorkflowYaml | Partial<WorkflowYaml> | undefined | null) => JsonModelSchemaType | undefined;
/**
 * Returns normalized workflow inputs (JSON Schema object form) from a definition and/or raw YAML.
 *
 * First uses {@link getInputsFromDefinition} on `definition`. When that yields nothing (for example
 * the definition object is partial or stale), parses `yaml` when provided (either a YAML string or
 * a `Document` from the `yaml` package), converts it to JSON, and runs {@link getInputsFromDefinition} on that
 * result so inputs can still be recovered from the editor buffer.
 *
 * Parse or extraction failures are ignored; the function returns `undefined` in those cases.
 */
export declare function extractNormalizedInputsFromYaml(definition: WorkflowYaml | null, yaml?: Document | string | null): Record<string, unknown> | undefined;
/**
 * Recursively checks if a schema has any defaults (direct or nested)
 */
export declare function hasDefaultsRecursive(schema: JSONSchema7, inputsSchema?: ReturnType<typeof normalizeFieldsToJsonSchema>): boolean;
/**
 * Resolves a $ref reference within the inputs schema context, or from
 * {@link builtinWorkflowInputDefinitions} when the ref uses
 * {@link KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}.
 *
 * @param ref - The $ref string (e.g., "#/definitions/UserSchema" or "#/kibana/definitions/MyType")
 * @param inputsSchema - The full inputs schema containing definitions
 * @returns The resolved schema, or null if not found
 */
export declare function resolveRef(ref: string, inputsSchema: ReturnType<typeof normalizeFieldsToJsonSchema>): JSONSchema7 | null;
/**
 * Applies default values from JSON Schema to workflow inputs
 * @param inputs - The actual input values provided (may be partial or undefined)
 * @param inputsSchema - The normalized JSON Schema inputs definition
 * @returns The inputs with defaults applied
 */
export declare function applyInputDefaults(inputs: Record<string, unknown> | undefined, inputsSchema: ReturnType<typeof normalizeFieldsToJsonSchema>, renderInputValue?: RenderInputValue): Record<string, unknown> | undefined;
