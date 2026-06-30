/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DynamicStepContextSchema } from '@kbn/workflows';
import {
  DataMapStepTypeId,
  DEFAULT_INDEX_BINDING,
  DEFAULT_ITEM_BINDING,
  MAP_BINDING_IDENTIFIER_REGEX,
  MAP_DIRECTIVE,
} from '@kbn/workflows-extensions/common';
import { z } from '@kbn/zod/v4';
import { parseVariablePath } from '../../../../common/lib/parse_variable_path';
import { VARIABLE_REGEX } from '../../../../common/lib/regex';
import { getSchemaAtPath, inferZodType } from '../../../../common/lib/zod';

interface DataMapContextSchemaEntries {
  item: z.ZodType;
  index: z.ZodType;
}

/**
 * Derives `item` and `index` schemas for a `data.map` step.
 *
 * Unlike `foreach`, `data.map` only accepts literal arrays or `${{ }}`
 * template variable references — no JSON strings or complex expressions.
 */
export function getDataMapContextSchema(
  stepContextSchema: typeof DynamicStepContextSchema,
  items: unknown
): DataMapContextSchemaEntries {
  return {
    item: getDataMapItemSchema(stepContextSchema, items),
    index: z.number(),
  };
}

/**
 * Adds bindings declared by nested `data.map` `$map` directives that contain the current
 * YAML path. For example, under `labels: { $map: { item: "label" }, name: "{{ label.name }}" }`
 * this extends the schema with `label` and its optional custom index binding.
 */
export function getDataMapNestedContextSchema(
  stepContextSchema: typeof DynamicStepContextSchema,
  step: unknown,
  stepRelativePath: Array<string | number>
): Record<string, z.ZodType> {
  if (!isDataMapStep(step)) {
    return {};
  }

  const fields = getStepFields(step);
  const fieldsRelativePath = getFieldsRelativePath(stepRelativePath);

  if (!fields || fieldsRelativePath.length === 0) {
    return {};
  }

  let schema = stepContextSchema;
  const entries: Record<string, z.ZodType> = {};

  for (let index = 0; index < fieldsRelativePath.length; index++) {
    const nextSegment = fieldsRelativePath[index + 1];
    if (nextSegment !== MAP_DIRECTIVE) {
      const spec = getValueAtPath(fields, fieldsRelativePath.slice(0, index + 1));
      const mapDirective = getMapDirective(spec);
      if (mapDirective) {
        const itemBinding = getBindingName(mapDirective.item, DEFAULT_ITEM_BINDING);
        const indexBinding = getBindingName(mapDirective.index, DEFAULT_INDEX_BINDING);
        const extension: Record<string, z.ZodType> = {};

        if (itemBinding) {
          const itemSchema = getDataMapItemSchema(schema, mapDirective.items);
          extension[itemBinding] = itemSchema;
          entries[itemBinding] = itemSchema;
        }

        if (indexBinding) {
          const indexSchema = z.number();
          extension[indexBinding] = indexSchema;
          entries[indexBinding] = indexSchema;
        }

        if (Object.keys(extension).length > 0) {
          schema = schema.extend(extension) as typeof DynamicStepContextSchema;
        }
      }
    }
  }

  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDataMapStep(step: unknown): step is Record<string, unknown> {
  return isRecord(step) && step.type === DataMapStepTypeId;
}

function getStepFields(step: unknown): Record<string, unknown> | null {
  if (!isRecord(step)) {
    return null;
  }

  const stepWith = step.with;
  if (!isRecord(stepWith)) {
    return null;
  }

  const fields = stepWith.fields;
  return isRecord(fields) ? fields : null;
}

function getFieldsRelativePath(stepRelativePath: Array<string | number>): Array<string | number> {
  const withIndex = stepRelativePath.findIndex((segment) => segment === 'with');
  if (withIndex === -1 || stepRelativePath[withIndex + 1] !== 'fields') {
    return [];
  }

  return stepRelativePath.slice(withIndex + 2);
}

function getValueAtPath(value: unknown, path: Array<string | number>): unknown {
  let current = value;

  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[String(segment)];
  }

  return current;
}

function getMapDirective(spec: unknown): { items: string; item?: unknown; index?: unknown } | null {
  if (!isRecord(spec)) {
    return null;
  }

  const directive = spec[MAP_DIRECTIVE];
  if (!isRecord(directive) || typeof directive.items !== 'string') {
    return null;
  }

  return directive as { items: string; item?: unknown; index?: unknown };
}

function getBindingName(value: unknown, fallback: string): string | null {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'string' && MAP_BINDING_IDENTIFIER_REGEX.test(value)) {
    return value;
  }

  return null;
}

function getDataMapItemSchema(
  stepContextSchema: typeof DynamicStepContextSchema,
  items: unknown
): z.ZodType {
  if (Array.isArray(items) && items.length > 0) {
    return inferZodType(items[0]);
  }

  if (typeof items !== 'string') {
    return z.unknown();
  }

  const variableKey = items.match(VARIABLE_REGEX)?.groups?.key;
  if (!variableKey) {
    return z.unknown();
  }

  const parsedPath = parseVariablePath(variableKey);
  if (!parsedPath || parsedPath.errors || !parsedPath.propertyPath) {
    return z.unknown();
  }

  const { schema: iterableSchema } = getSchemaAtPath(stepContextSchema, parsedPath.propertyPath);
  if (iterableSchema instanceof z.ZodArray) {
    return iterableSchema.element as z.ZodType;
  }

  return z.unknown();
}
