/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getInputsFromDefinition, resolveRef } from './field_conversion';
import { parseJsPropertyAccess } from '../../common/utils/parse_js_property_access/parse_js_property_access';
import type { WorkflowYaml } from '../schema';
import type { JsonModelSchemaType } from '../schema/common/json_model_schema';
import type { JsonSchema } from '../schema/common/json_model_shape_schema';

const INPUTS_PREFIX = 'inputs';

/** Stands in for anything below an open map, which accepts any key but describes no values. */
const ANY_KEY_OBJECT: JsonSchema = { type: 'object', additionalProperties: true };

export type WorkflowInputRefViolationReason =
  | 'missing_input_ref'
  | 'unresolvable_input_ref'
  | 'unknown_input_ref_path';

export interface WorkflowInputRefViolation {
  ref: string;
  reason: WorkflowInputRefViolationReason;
  message: string;
  /** Absent for `missing_input_ref`. */
  inputName?: string;
  /** Only set for `unknown_input_ref_path`. */
  path?: string;
}

export interface IsJsonSchemaPathValidOptions {
  /** Document used to resolve nested `$ref` nodes. Without it, a nested `$ref` fails the walk. */
  rootSchema?: JsonModelSchemaType;
}

export interface ValidateWorkflowInputRefsArgs {
  definition: WorkflowYaml | Partial<WorkflowYaml> | null | undefined;
  /** Template variable paths found in the workflow, e.g. from `scanForTemplateVariables`. */
  templateVariables: readonly string[];
  /** Input contract refs the workflow must satisfy, e.g. `#/kibana/definitions/<id>`. */
  expectedInputRefs: readonly string[];
}

const isUnderPrefix = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);

const toRelativePath = (path: string, prefix: string): string => {
  if (path === prefix) {
    return '';
  }
  if (path.startsWith(`${prefix}.`)) {
    return path.slice(prefix.length + 1);
  }
  // Bracket access: keep the leading `[` for the parser.
  return path.slice(prefix.length);
};

const resolveSegment = (schema: JsonSchema, segment: string): JsonSchema | null => {
  if (schema.type === 'array') {
    // Templates index arrays numerically and cannot pick a slot out of a tuple schema.
    const items = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    return /^\d+$/.test(segment) ? items ?? ANY_KEY_OBJECT : null;
  }

  if (schema.type !== 'object') {
    return null;
  }

  return schema.properties?.[segment] ?? (schema.additionalProperties ? ANY_KEY_OBJECT : null);
};

/**
 * Reports whether a JSON Schema allows a JS-style property path such as `episodes[0].data.host`.
 * An empty path is the schema root, which is always valid.
 *
 * This walks the JSON Schema rather than the Zod schema the YAML editor validates variables
 * against (`buildFieldsZodValidator` + `getSchemaAtPath`), because that conversion loses the two
 * keywords this check depends on: `additionalProperties: true` becomes an object with an empty
 * shape, so open maps like `groupKey.*` are rejected, and a `$ref` nested inside `properties`
 * becomes `z.any()`, so anything below it is accepted.
 */
export const isJsonSchemaPathValid = (
  relativePath: string,
  schema: JsonSchema,
  options: IsJsonSchemaPathValidOptions = {}
): boolean => {
  const { rootSchema } = options;
  let current: JsonSchema | null = schema;

  for (const segment of parseJsPropertyAccess(relativePath)) {
    if (current.$ref) {
      // `resolveRef` types the same document through the `json-schema` package's types.
      current = rootSchema ? (resolveRef(current.$ref, rootSchema) as JsonSchema | null) : null;
      if (!current) {
        return false;
      }
    }

    current = resolveSegment(current, segment);
    if (!current) {
      return false;
    }
  }

  return true;
};

const formatKeys = (keys: string[]): string => (keys.length > 0 ? keys.join(', ') : '(none)');

const findInputNamesForRef = (properties: Record<string, JsonSchema>, ref: string): string[] =>
  Object.entries(properties)
    .filter(([, property]) => property.$ref === ref)
    .map(([name]) => name);

/**
 * Checks that some declared input is bound to each expected `$ref` and that every template path
 * under those inputs exists in the ref's schema, returning one violation per problem found.
 */
export const validateWorkflowInputRefs = ({
  definition,
  templateVariables,
  expectedInputRefs,
}: ValidateWorkflowInputRefsArgs): WorkflowInputRefViolation[] => {
  if (expectedInputRefs.length === 0) {
    return [];
  }

  const inputs = getInputsFromDefinition(definition);
  const properties = inputs?.properties ?? {};
  const violations: WorkflowInputRefViolation[] = [];

  for (const ref of expectedInputRefs) {
    const inputNames = findInputNamesForRef(properties, ref);

    if (inputNames.length === 0) {
      violations.push({
        ref,
        reason: 'missing_input_ref',
        message:
          `Workflow does not declare an input with \`$ref: '${ref}'\`. ` +
          `Declared inputs: ${formatKeys(Object.keys(properties))}.`,
      });
      continue;
    }

    const refSchema = resolveRef(ref, inputs) as JsonSchema | null;

    if (!refSchema) {
      violations.push({
        ref,
        inputName: inputNames[0],
        reason: 'unresolvable_input_ref',
        message:
          `Input \`${inputNames[0]}\` references \`$ref: '${ref}'\`, which does not resolve ` +
          `to a known schema. Use a registered built-in definition or define it under \`definitions\`.`,
      });
      continue;
    }

    for (const inputName of inputNames) {
      const prefix = `${INPUTS_PREFIX}.${inputName}`;

      for (const variable of templateVariables) {
        if (!isUnderPrefix(variable, prefix)) {
          continue;
        }

        if (
          isJsonSchemaPathValid(toRelativePath(variable, prefix), refSchema, {
            rootSchema: inputs,
          })
        ) {
          continue;
        }

        violations.push({
          ref,
          inputName,
          path: variable,
          reason: 'unknown_input_ref_path',
          message:
            `Workflow references \`${variable}\`, which does not exist in the schema for ` +
            `\`$ref: '${ref}'\`. Top-level fields available under \`${prefix}\`: ` +
            `${formatKeys(Object.keys(refSchema.properties ?? {}))}.`,
        });
      }
    }
  }

  return violations;
};
