/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DynamicStepContextSchema } from '@kbn/workflows';
import { ForEachContextSchema } from '@kbn/workflows';
import type { EnterForeachNodeConfiguration } from '@kbn/workflows/graph';
import { z } from '@kbn/zod/v4';
import { InvalidForeachParameterError, InvalidForeachParameterErrorCodes } from './errors';
import { parseVariablePath } from '../../../../common/lib/parse_variable_path';
import { VARIABLE_REGEX } from '../../../../common/lib/regex';
import {
  getDetailedTypeDescription,
  getSchemaAtPath,
  getZodTypeName,
  inferZodType,
} from '../../../../common/lib/zod';

export function getForeachStateSchema(
  stepContextSchema: typeof DynamicStepContextSchema,
  foreachStep: EnterForeachNodeConfiguration
) {
  let itemSchema: z.ZodType = z.unknown();

  try {
    if (Array.isArray(foreachStep.foreach)) {
      itemSchema = extractForeachItemSchemaFromArray(foreachStep.foreach);
      return ForEachContextSchema.extend({
        item: itemSchema,
        items: z.array(itemSchema),
      });
    }
    const cleanedForeachParam =
      foreachStep.foreach.match(VARIABLE_REGEX)?.groups?.key ?? foreachStep.foreach;
    itemSchema = getForeachItemSchema(stepContextSchema, cleanedForeachParam);
    return ForEachContextSchema.extend({
      item: itemSchema,
      items: z.array(itemSchema),
    });
  } catch (error) {
    if (error instanceof InvalidForeachParameterError) {
      itemSchema = z.unknown().describe(error.message);
      return ForEachContextSchema.extend({
        item: itemSchema,
        items: z.array(itemSchema),
      });
    } else {
      throw error;
    }
  }
}

const extractForeachItemSchemaFromArray = (foreachParam: unknown[]): z.ZodType => {
  try {
    if (foreachParam.length === 0) {
      throw new InvalidForeachParameterError(
        'Expected non-empty array for foreach iteration',
        InvalidForeachParameterErrorCodes.INVALID_ARRAY
      );
    }
    return inferZodType(foreachParam[0]);
  } catch (e) {
    if (e instanceof InvalidForeachParameterError) {
      throw e;
    }
    throw new InvalidForeachParameterError(
      'Unable to parse foreach parameter as JSON',
      InvalidForeachParameterErrorCodes.INVALID_JSON
    );
  }
};

const extractForeachItemSchemaFromJson = (foreachParam: string): z.ZodType => {
  let foreachParamParsed: unknown;

  try {
    foreachParamParsed = JSON.parse(foreachParam);
  } catch {
    throw new InvalidForeachParameterError(
      'Unable to parse foreach parameter as JSON',
      InvalidForeachParameterErrorCodes.INVALID_JSON
    );
  }

  if (!Array.isArray(foreachParamParsed)) {
    throw new InvalidForeachParameterError(
      `Expected array for foreach iteration, but got: ${typeof foreachParamParsed}`,
      InvalidForeachParameterErrorCodes.INVALID_ARRAY
    );
  }

  return extractForeachItemSchemaFromArray(foreachParamParsed);
};

const ENTRIES_FILTER = 'entries';

/** ZodUnknown descriptions returned by {@link getForeachItemSchema} for non-throwing cases. */
export const FOREACH_ITEM_SCHEMA_DESC = {
  UNRESOLVED_PATH: 'Unable to parse foreach parameter',
  RUNTIME_JSON: 'Unable to determine foreach item type',
} as const;

export interface ForeachCollectionDiagnostic {
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Maps a {@link getForeachItemSchema} result to a collection-path diagnostic when the schema is ZodUnknown.
 */
export function getForeachCollectionDiagnostic(
  itemSchema: z.ZodType,
  propertyPath: string
): ForeachCollectionDiagnostic | null {
  if (!(itemSchema instanceof z.ZodUnknown)) {
    return null;
  }

  const description = itemSchema.description;
  if (description === FOREACH_ITEM_SCHEMA_DESC.UNRESOLVED_PATH) {
    return {
      message: `Collection ${propertyPath} is invalid`,
      severity: 'error',
    };
  }
  if (description === FOREACH_ITEM_SCHEMA_DESC.RUNTIME_JSON) {
    return {
      message: description,
      severity: 'warning',
    };
  }
  if (description) {
    return { message: description, severity: 'error' };
  }

  return {
    message: `Unable to validate collection ${propertyPath}`,
    severity: 'warning',
  };
}

export function getForeachItemSchema(
  stepContextSchema: typeof DynamicStepContextSchema,
  foreachParam: string
): z.ZodType {
  const parsedPath = parseVariablePath(foreachParam);
  const iterateOverPath = parsedPath?.propertyPath;
  const hasEntriesFilter = parsedPath?.filters?.includes(ENTRIES_FILTER) ?? false;

  // If we have a valid variable path syntax (e.g., {{some.path}})
  if (parsedPath && !parsedPath.errors && iterateOverPath) {
    // eslint-disable-next-line prefer-const -- we need this constant to have references in json schema
    let itemSchema: z.ZodType = z.unknown().describe(FOREACH_ITEM_SCHEMA_DESC.UNRESOLVED_PATH);
    const { schema: iterableSchema } = getSchemaAtPath(stepContextSchema, iterateOverPath);
    if (!iterableSchema) {
      // if we cannot resolve the path in the schema, we return an unknown schema
      return itemSchema;
    }
    if (iterableSchema instanceof z.ZodArray) {
      return iterableSchema.element as z.ZodType;
    } else if (iterableSchema instanceof z.ZodLiteral) {
      // If the resolved path is a known literal string, we need to try to parse it as JSON
      const literalValue = iterableSchema.value;
      if (typeof literalValue === 'string') {
        return extractForeachItemSchemaFromJson(literalValue);
      }
      throw new InvalidForeachParameterError(
        'Unable to parse foreach parameter: literal value is not a string',
        InvalidForeachParameterErrorCodes.INVALID_LITERAL
      );
    } else if (iterableSchema instanceof z.ZodString) {
      // If the resolved path is a string, we return a string schema and will tell the user we will try to parse it as JSON in runtime
      return z.unknown().describe(FOREACH_ITEM_SCHEMA_DESC.RUNTIME_JSON);
    } else if (iterableSchema instanceof z.ZodUnion) {
      const arrayOption = iterableSchema.options.find((option) => option instanceof z.ZodArray);
      if (arrayOption && arrayOption instanceof z.ZodArray) {
        return arrayOption.element as z.ZodType;
      } else {
        throw new InvalidForeachParameterError(
          `Expected array in union for foreach iteration, but no array type was found. Union options: [${iterableSchema.options
            .map((opt) => getZodTypeName(opt as z.ZodType))
            .join(', ')}]`,
          InvalidForeachParameterErrorCodes.INVALID_UNION
        );
      }
    } else if (iterableSchema instanceof z.ZodObject && hasEntriesFilter) {
      return z.object({ key: z.string(), value: z.unknown() });
    } else {
      throw new InvalidForeachParameterError(
        `Expected array for foreach iteration, but got ${getZodTypeName(
          iterableSchema
        )} (${getDetailedTypeDescription(iterableSchema)})`,
        InvalidForeachParameterErrorCodes.INVALID_TYPE
      );
    }
  } else {
    // Not a valid variable path syntax or has errors, try to parse as JSON
    return extractForeachItemSchemaFromJson(foreachParam);
  }
}
