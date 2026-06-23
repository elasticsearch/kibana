/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JSONSchema7 } from 'json-schema';
import { normalizeFieldsToJsonSchema, resolveRef } from '@kbn/workflows/spec/lib/field_conversion';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { INPUT_STRING_PLACEHOLDER } from '../consts/placeholders';

const MAX_REF_RESOLUTION_DEPTH = 32;

/**
 * Generates a sample value from a JSON Schema.
 * Used for placeholder/sample values in forms and autocomplete when no default is set.
 *
 * @param schema - JSON Schema fragment to sample
 * @param inputsRoot - When set, `$ref` is resolved with {@link resolveRef} (local `definitions`
 *   and built-in `#/kibana/definitions/...`). Required for sampling `$ref`-only properties.
 */
export function generateSampleFromJsonSchema(
  schema: JSONSchema7,
  inputsRoot?: JsonModelSchemaType,
  depth = 0,
  normalizedRoot?: ReturnType<typeof normalizeFieldsToJsonSchema>
): unknown {
  if (depth >= MAX_REF_RESOLUTION_DEPTH) {
    return undefined;
  }

  if (schema.$ref && inputsRoot) {
    const root = normalizedRoot ?? normalizeFieldsToJsonSchema(inputsRoot);
    if (root) {
      const resolved = resolveRef(schema.$ref, root);
      if (resolved) {
        return generateSampleFromJsonSchema(resolved, inputsRoot, depth + 1, root);
      }
    }
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  switch (schema.type) {
    case 'string':
      return schema.format === 'email' ? 'user@example.com' : INPUT_STRING_PLACEHOLDER;
    case 'number':
      return 0;
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array': {
      const items = schema.items as JSONSchema7 | undefined;
      if (items) {
        return [generateSampleFromJsonSchema(items, inputsRoot, depth, normalizedRoot)];
      }
      return [];
    }
    case 'object':
    // No explicit type but has properties — valid JSON Schema implicit-object form.
    case undefined: {
      if (!schema.properties) {
        return schema.type === 'object' ? {} : undefined;
      }
      const sample: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const prop = propSchema as JSONSchema7;
        const isRequired = schema.required?.includes(key) ?? false;
        if (isRequired || prop.default !== undefined) {
          sample[key] = generateSampleFromJsonSchema(prop, inputsRoot, depth, normalizedRoot);
        }
      }
      return sample;
    }
    default:
      return undefined;
  }
}
