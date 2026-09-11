/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { unwrapSchema } from './unwrap_schema';

export function parsePath(path: string) {
  const segments = path
    .replace(/\[(['"]?)([^\]]+)\1\]/g, '.$2') // Convert [key] to .key
    .split('.');
  return segments.some((s) => s === '') ? null : segments;
}

interface GetSchemaAtPathResult {
  schema: z.ZodType | null;
  scopedToPath: string | null;
}

/**
 * Get zod schema at a given path.
 * @param schema - The zod schema to get the path from.
 * @param path - The path to get the schema from. e.g. `choices[0].message['content']`
 * @param options - The options for the function.
 * @param options.partial - If true, return the schema for the last valid path segment.
 * @returns The schema at the given path or null if the path is invalid.
 */
export function getSchemaAtPath(
  schema: z.ZodType,
  path: string,
  { partial = false }: { partial?: boolean } = {}
): GetSchemaAtPathResult {
  try {
    const segments = parsePath(path);
    if (!segments) {
      return { schema: null, scopedToPath: null };
    }

    let current: z.ZodType = schema;

    for (const [index, segment] of segments.entries()) {
      current = unwrapSchema(current);
      if (current instanceof z.ZodObject) {
        const shape = current.shape;
        // `in` walks the prototype chain, so `__proto__` / `constructor` / `toString`
        // would resolve to an Object.prototype member instead of a zod schema.
        if (Object.hasOwn(shape, segment)) {
          current = shape[segment];
        } else {
          // Typed `additionalProperties: { ... }` compiles to a catchall. Skip `never`
          // (closed object) and `unknown`/`any` (open map) so only described value
          // shapes are walked.
          const catchall = current.def.catchall as z.ZodType | undefined;
          if (
            catchall &&
            !(catchall instanceof z.ZodNever) &&
            !(catchall instanceof z.ZodUnknown) &&
            !(catchall instanceof z.ZodAny)
          ) {
            current = catchall;
          } else {
            return partial
              ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
              : { schema: null, scopedToPath: null };
          }
        }
      } else if (current instanceof z.ZodRecord) {
        const valueType = current.valueType;
        const keyType = current.keyType;
        if (keyType instanceof z.ZodString) {
          current = valueType as z.ZodType;
        } else {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }
      } else if (current instanceof z.ZodUnion) {
        const branches = current.options;
        const validBranch = branches.find(
          (branch) => getSchemaAtPath(branch as z.ZodType, segment).schema !== null
        );
        if (!validBranch) {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }
        // We found a valid branch, now we need to traverse into it with the current segment
        const branchResult = getSchemaAtPath(validBranch as z.ZodType, segment);
        if (!branchResult.schema) {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }
        current = branchResult.schema;
      } else if (current instanceof z.ZodIntersection) {
        const branches = [current.def.left as z.ZodType, current.def.right as z.ZodType];
        const validBranch = branches.find(
          (branch) => getSchemaAtPath(branch as z.ZodType, segment).schema !== null
        );
        if (!validBranch) {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }
        // We found a valid branch, now we need to traverse into it with the current segment
        const branchResult = getSchemaAtPath(validBranch as z.ZodType, segment);
        if (!branchResult.schema) {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }
        current = branchResult.schema;
      } else if (current instanceof z.ZodArray) {
        if (!/^\d+$/.test(segment)) {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }
        const arrayIndex = parseInt(segment, 10);

        // Reject negative indices
        if (arrayIndex < 0) {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }

        // Check for array length constraints in Zod v4
        // Array constraints are stored in the checks array
        let maxLength: number | undefined;

        if (current.def.checks) {
          for (const check of current.def.checks) {
            if (check._zod?.def) {
              const checkDef = check._zod.def;
              if (checkDef.check === 'max_length') {
                maxLength = (checkDef as z.core.$ZodCheckMaxLengthDef).maximum;
              } else if (checkDef.check === 'length_equals') {
                maxLength = (checkDef as z.core.$ZodCheckLengthEqualsDef).length;
              }
            }
          }
        }

        // Only enforce bounds checking for arrays with explicit length constraints
        if (maxLength !== undefined && arrayIndex >= maxLength) {
          return partial
            ? { schema: current, scopedToPath: segments.slice(0, index).join('.') }
            : { schema: null, scopedToPath: null };
        }

        // For unconstrained arrays, we allow any non-negative index for schema introspection
        // This is because we're validating schema paths, not runtime data
        current = current.element as z.ZodType;
      } else if (current instanceof z.ZodAny) {
        // pass through any to preserve the description
        return { schema: current, scopedToPath: segments.slice(0, index).join('.') };
      } else if (current instanceof z.ZodUnknown) {
        // pass through unknown to preserve the description
        return { schema: current, scopedToPath: segments.slice(0, index).join('.') };
      } else {
        return { schema: null, scopedToPath: null };
      }
    }

    if (current instanceof z.ZodOptional || current instanceof z.ZodDefault) {
      return { schema: current.unwrap() as z.ZodType, scopedToPath: segments.join('.') };
    }

    return { schema: current as z.ZodType, scopedToPath: segments.join('.') };
  } catch {
    return { schema: null, scopedToPath: null };
  }
}
