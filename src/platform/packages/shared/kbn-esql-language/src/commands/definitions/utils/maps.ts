/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLMap, ESQLMapEntry } from '@elastic/esql/types';
import { isStringLiteral } from '@elastic/esql';
import { castEsToKbnFieldTypeName, KBN_FIELD_TYPES } from '@kbn/field-types';
import { DOUBLE_QUOTED_STRING_REGEX } from './autocomplete/map_expression';
import { type MapValueType } from '../../registry/complete_items';

// Parses mapParams format: {name='paramName', values=[val1, val2], description='param desc', type=[valuesType]}
// Captures: [1] = param name, [2] = comma-separated values
export const MAP_PARAMS_REGEX =
  /\{name='([^']*(?:''[^']*)*)'(?:,\s*values=\[([^\]]*)\])?[^,}]*(?:,\s*description='([^']*(?:''[^']*)*)')?[^,}]*(?:,\s*type=\[([^\]]*)\])?\}/g;
const STRIP_SINGLE_QUOTES_REGEX = /^'|'$/g;

type ParsedMapParameter = Record<
  string,
  {
    type: MapValueType;
    rawType: string;
    description: string;
    values: string[];
  }
>;

export function getMapNestingLevel(text: string): number {
  // Ignore braces inside quoted strings and escaped braces
  const sanitized = text
    .replace(DOUBLE_QUOTED_STRING_REGEX, '')
    .replace(/\\\{/g, '')
    .replace(/\\\}/g, '');

  const openBraces = (sanitized.match(/\{/g) || []).length;
  const closeBraces = (sanitized.match(/\}/g) || []).length;

  return openBraces - closeBraces;
}

/**
 * Checks if the cursor is inside an unclosed map expression.
 */
export function isInsideMapExpression(text: string): boolean {
  return getMapNestingLevel(text) > 0;
}

const TypeMap: Partial<Record<KBN_FIELD_TYPES, MapValueType>> = {
  [KBN_FIELD_TYPES.STRING]: 'string',
  [KBN_FIELD_TYPES.NUMBER]: 'number',
  [KBN_FIELD_TYPES.BOOLEAN]: 'boolean',
};

/**
 * Parses a mapParams definition string into ParsedMapParameter.
 *
 * Input:  "{name='boost', values=[2.5], description='Boost value', type=[float]}, {name='analyzer', values=[standard], description='analyzer used', type=[keyword]}"
 * Output: { boost: { type: 'number', ... }, analyzer: { type: 'string', ... } }
 */
export function parseMapParams(mapParamsStr: string): ParsedMapParameter {
  const result: ParsedMapParameter = {};

  for (const match of mapParamsStr.matchAll(MAP_PARAMS_REGEX)) {
    const paramName = match[1];
    const rawValues = match[2] ?? '';
    const description = match[3] ?? '';
    const rawTypes = match[4] ?? 'keyword';

    const values = rawValues
      .split(',')
      .map((val) => val.trim().replace(STRIP_SINGLE_QUOTES_REGEX, ''))
      .filter(Boolean);
    const parsedTypesFromDefinition = rawTypes.split(',');
    const mappedTypesFromDefinition = parsedTypesFromDefinition.map((type) =>
      castEsToKbnFieldTypeName(type.trim())
    );
    const uniqueMappedTypes = Array.from(new Set(mappedTypesFromDefinition));

    result[paramName] = {
      type: TypeMap[uniqueMappedTypes[0]] || 'string',
      rawType: parsedTypesFromDefinition[0],
      description,
      values,
    };
  }

  return result;
}

export const getMapEntryByKey = (map: ESQLMap, key: string): ESQLMapEntry | undefined =>
  map.entries.find((entry) => isStringLiteral(entry.key) && entry.key.valueUnquoted === key);
