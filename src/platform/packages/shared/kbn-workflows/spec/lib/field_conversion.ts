/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JSONSchema7 } from 'json-schema';
import type { Document } from 'yaml';
import { parseDocument } from 'yaml';
import {
  builtinWorkflowInputDefinitions,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
} from '../builtin_workflow_input_definitions';
import type { WorkflowOutput, WorkflowYaml } from '../schema';
import type { JsonModelSchemaType } from '../schema/common/json_model_schema';
import type { JsonSchema } from '../schema/common/json_model_shape_schema';
import {
  isManualTrigger,
  type LegacyWorkflowInput,
  type WorkflowInput,
} from '../schema/triggers/manual_trigger_schema';

export type NormalizableFieldSchema =
  | JsonModelSchemaType
  | Array<LegacyWorkflowInput | WorkflowOutput>;

export type RenderInputValue = (value: unknown) => unknown;

function renderValue(value: unknown, renderInputValue?: RenderInputValue): unknown {
  return renderInputValue ? renderInputValue(value) : value;
}

/**
 * Converts a legacy workflow field definition to a JSON Schema property
 * @param field - The legacy field to convert (input or output)
 * @returns A JSON Schema property definition
 */
function convertLegacyFieldToJsonSchemaProperty(field: LegacyWorkflowInput): JSONSchema7 {
  const property: JSONSchema7 = {
    type: field.type === 'choice' ? 'string' : field.type,
  };

  if (field.description) {
    property.description = field.description;
  }

  if (field.default !== undefined) {
    property.default = field.default;
  }

  switch (field.type) {
    case 'choice':
      property.enum = field.options;
      break;
    case 'array': {
      property.items = {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      };
      if (field.minItems !== undefined) {
        property.minItems = field.minItems;
      }
      if (field.maxItems !== undefined) {
        property.maxItems = field.maxItems;
      }
      break;
    }
    default:
      break;
  }

  return property;
}

/**
 * Converts legacy array-based field format to the new JSON Schema object format
 * @param legacyFields - Array of legacy field definitions (inputs or outputs)
 * @returns The fields in the new JSON Schema object format
 */
export function convertLegacyFieldsToJsonSchema(
  legacyFields: LegacyWorkflowInput[]
): JsonModelSchemaType {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const field of legacyFields) {
    if (field && typeof field === 'object' && field.name) {
      properties[field.name] = convertLegacyFieldToJsonSchemaProperty(
        field
      ) as unknown as JsonSchema;

      if (field.required === true) {
        required.push(field.name);
      }
    }
  }

  return {
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Normalizes workflow fields (inputs or outputs) to the JSON Schema object format.
 * If fields are already in JSON Schema format, returns them as-is.
 * If fields are in the legacy array format, converts them.
 * Accepts unknown to avoid explicit casts at call sites (runtime checks handle validation).
 */
export function normalizeFieldsToJsonSchema(
  fields?: NormalizableFieldSchema | unknown
): JsonModelSchemaType | undefined {
  if (!fields) {
    return undefined;
  }

  // Check typeof first to avoid 'in' operator error on primitives (e.g., when YAML is partially parsed)
  if (
    typeof fields === 'object' &&
    fields !== null &&
    !Array.isArray(fields) &&
    'properties' in fields
  ) {
    const fieldsWithProperties = fields as { properties?: unknown };
    if (
      typeof fieldsWithProperties.properties === 'object' &&
      fieldsWithProperties.properties !== null &&
      !Array.isArray(fieldsWithProperties.properties)
    ) {
      return fields as JsonModelSchemaType;
    }
  }

  if (Array.isArray(fields)) {
    return convertLegacyFieldsToJsonSchema(fields as LegacyWorkflowInput[]);
  }

  return undefined;
}

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
export const getInputsFromDefinition = (
  definition: WorkflowYaml | Partial<WorkflowYaml> | undefined | null
): JsonModelSchemaType | undefined => {
  const manualTriggerInDefinition = definition?.triggers?.find((trigger) =>
    isManualTrigger(trigger)
  );
  let inputsInDefinition = manualTriggerInDefinition?.inputs;

  if (!inputsInDefinition) {
    // Backward compatibility with workflows that still use root-level inputs
    inputsInDefinition = (definition as Record<string, unknown>)?.inputs as WorkflowInput;
  }

  return normalizeFieldsToJsonSchema(inputsInDefinition);
};

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
export function extractNormalizedInputsFromYaml(
  definition: WorkflowYaml | null,
  yaml?: Document | string | null
): Record<string, unknown> | undefined {
  const inputsFromDefinition = getInputsFromDefinition(definition);

  if (inputsFromDefinition) {
    return inputsFromDefinition;
  }

  if (!yaml) {
    return undefined;
  }

  try {
    let yamlDoc: Document;

    if (typeof yaml === 'string') {
      yamlDoc = parseDocument(yaml);
    } else {
      yamlDoc = yaml;
    }

    const yamlJson = yamlDoc.toJSON() as WorkflowYaml;
    return getInputsFromDefinition(yamlJson);
  } catch {
    // Ignore errors when extracting from YAML
  }

  return undefined;
}

/**
 * Applies defaults to a nested object property
 * @param prop - The property schema
 * @param currentValue - The current value for this property
 * @returns The value with defaults applied
 */
function applyDefaultToObjectProperty(
  prop: JSONSchema7,
  currentValue: unknown,
  inputsSchema?: ReturnType<typeof normalizeFieldsToJsonSchema>,
  renderInputValue?: RenderInputValue
): unknown {
  if (currentValue === undefined) {
    if (prop.default !== undefined) {
      return renderValue(prop.default, renderInputValue);
    }
    if (prop.type === 'object' && prop.properties) {
      return applyDefaultFromSchema(prop, undefined, inputsSchema, renderInputValue);
    }
    return undefined;
  }

  if (
    prop.type === 'object' &&
    prop.properties &&
    typeof currentValue === 'object' &&
    !Array.isArray(currentValue)
  ) {
    return applyDefaultFromSchema(prop, currentValue, inputsSchema, renderInputValue);
  }

  return renderValue(currentValue, renderInputValue);
}

/**
 * Applies defaults to all properties of an object
 * @param schema - The object schema
 * @param value - The current object value
 * @returns The object with defaults applied
 */
function applyDefaultsToObjectProperties(
  schema: JSONSchema7,
  value: Record<string, unknown>,
  inputsSchema?: ReturnType<typeof normalizeFieldsToJsonSchema>,
  renderInputValue?: RenderInputValue
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...value };
  for (const [key, propSchema] of Object.entries(schema.properties || {})) {
    const prop = propSchema as JSONSchema7;
    const currentValue = result[key];
    const defaultValue = applyDefaultToObjectProperty(
      prop,
      currentValue,
      inputsSchema,
      renderInputValue
    );
    if (defaultValue !== undefined) {
      result[key] = defaultValue;
    }
  }
  return result;
}

/**
 * Recursively checks if a schema has any defaults (direct or nested)
 */
export function hasDefaultsRecursive(
  schema: JSONSchema7,
  inputsSchema?: ReturnType<typeof normalizeFieldsToJsonSchema>
): boolean {
  // Resolve $ref if present
  if (schema.$ref && inputsSchema) {
    const resolvedSchema = resolveRef(schema.$ref, inputsSchema);
    if (resolvedSchema) {
      return hasDefaultsRecursive(resolvedSchema, inputsSchema);
    }
  }

  // Direct default
  if (schema.default !== undefined) {
    return true;
  }

  // Check nested properties for defaults
  if (schema.type === 'object' && schema.properties) {
    for (const propSchema of Object.values(schema.properties)) {
      const prop = propSchema as JSONSchema7;
      if (hasDefaultsRecursive(prop, inputsSchema)) {
        return true;
      }
    }
  }

  // Check array items for defaults
  if (schema.type === 'array' && schema.items) {
    const itemsSchema = schema.items as JSONSchema7;
    return hasDefaultsRecursive(itemsSchema, inputsSchema);
  }

  return false;
}

function createObjectWithDefaults(
  schema: JSONSchema7,
  inputsSchema?: ReturnType<typeof normalizeFieldsToJsonSchema>,
  renderInputValue?: RenderInputValue
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [key, propSchema] of Object.entries(schema.properties || {})) {
    const prop = propSchema as JSONSchema7;
    const isRequired = schema.required?.includes(key) ?? false;

    // Include property if:
    // 1. It's required, OR
    // 2. It has defaults (direct or nested)
    if (isRequired || hasDefaultsRecursive(prop, inputsSchema)) {
      const defaultValue = applyDefaultFromSchema(prop, undefined, inputsSchema, renderInputValue);
      if (defaultValue !== undefined) {
        result[key] = defaultValue;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Resolves a $ref reference within the inputs schema context, or from
 * {@link builtinWorkflowInputDefinitions} when the ref uses
 * {@link KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}.
 *
 * @param ref - The $ref string (e.g., "#/definitions/UserSchema" or "#/kibana/definitions/MyType")
 * @param inputsSchema - The full inputs schema containing definitions
 * @returns The resolved schema, or null if not found
 */
export function resolveRef(
  ref: string,
  inputsSchema: ReturnType<typeof normalizeFieldsToJsonSchema>
): JSONSchema7 | null {
  if (!ref.startsWith('#/')) {
    // External references not supported yet
    return null;
  }

  if (ref.startsWith(KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX)) {
    const id = ref.slice(KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX.length);
    if (!id || id.includes('/')) {
      return null;
    }
    const builtin = builtinWorkflowInputDefinitions[id];
    return (builtin ?? null) as JSONSchema7 | null;
  }

  const path = ref.slice(2).split('/'); // Remove '#/' and split
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = inputsSchema;

  for (const segment of path) {
    if (current && typeof current === 'object') {
      current = current[segment];
    } else {
      return null;
    }
  }

  return current as JSONSchema7 | null;
}

/**
 * Recursively applies default values from JSON Schema to input values
 * @param schema - The JSON Schema property definition
 * @param value - The current input value (may be undefined)
 * @param inputsSchema - The full inputs schema (for resolving $ref)
 * @returns The value with defaults applied
 */
function applyDefaultFromSchema(
  schema: JSONSchema7,
  value: unknown,
  inputsSchema?: ReturnType<typeof normalizeFieldsToJsonSchema>,
  renderInputValue?: RenderInputValue
): unknown {
  // Resolve $ref if present
  if (schema.$ref && inputsSchema) {
    const resolvedSchema = resolveRef(schema.$ref, inputsSchema);
    if (resolvedSchema) {
      // Use resolved schema for applying defaults
      return applyDefaultFromSchema(resolvedSchema, value, inputsSchema, renderInputValue);
    }
  }
  // If value is already provided, use it (unless it's undefined/null for objects)
  if (value !== undefined && value !== null) {
    // For objects, recursively apply defaults to nested properties
    if (
      schema.type === 'object' &&
      schema.properties &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return applyDefaultsToObjectProperties(
        schema,
        value as Record<string, unknown>,
        inputsSchema,
        renderInputValue
      );
    }
    return renderValue(value, renderInputValue);
  }

  // If value is not provided, use default if available
  if (schema.default !== undefined) {
    return renderValue(schema.default, renderInputValue);
  }

  // For objects, create object with defaults for required properties or properties with defaults
  if (schema.type === 'object' && schema.properties) {
    const objectWithDefaults = createObjectWithDefaults(schema, inputsSchema, renderInputValue);
    // If we created an object with defaults, return it; otherwise return undefined
    // This ensures nested objects with defaults are created even if not required
    return objectWithDefaults;
  }

  // For arrays, return empty array if no default
  if (schema.type === 'array') {
    return schema.default ?? [];
  }

  return undefined;
}

/**
 * Applies default values from JSON Schema to workflow inputs
 * @param inputs - The actual input values provided (may be partial or undefined)
 * @param inputsSchema - The normalized JSON Schema inputs definition
 * @returns The inputs with defaults applied
 */
export function applyInputDefaults(
  inputs: Record<string, unknown> | undefined,
  inputsSchema: ReturnType<typeof normalizeFieldsToJsonSchema>,
  renderInputValue?: RenderInputValue
): Record<string, unknown> | undefined {
  if (!inputsSchema?.properties) {
    return inputs;
  }

  const result: Record<string, unknown> = { ...(inputs || {}) };
  let hasAnyDefaults = false;

  for (const [propertyName, propertySchema] of Object.entries(inputsSchema.properties)) {
    const jsonSchema = propertySchema as JSONSchema7;
    const currentValue = result[propertyName];

    // Apply defaults if value is missing or undefined
    if (currentValue === undefined) {
      const defaultValue = applyDefaultFromSchema(
        jsonSchema,
        undefined,
        inputsSchema,
        renderInputValue
      );
      if (defaultValue !== undefined) {
        result[propertyName] = defaultValue;
        hasAnyDefaults = true;
      }
    } else {
      const updatedValue = applyDefaultFromSchema(
        jsonSchema,
        currentValue,
        inputsSchema,
        renderInputValue
      );
      if (updatedValue !== undefined && !Object.is(updatedValue, currentValue)) {
        result[propertyName] = updatedValue;
        hasAnyDefaults = true;
      }
    }
  }

  // Return undefined if no defaults were applied and inputs was undefined
  // This allows the caller to distinguish between "no defaults" and "empty object with defaults"
  if (!hasAnyDefaults && inputs === undefined && Object.keys(result).length === 0) {
    return undefined;
  }

  return result;
}
