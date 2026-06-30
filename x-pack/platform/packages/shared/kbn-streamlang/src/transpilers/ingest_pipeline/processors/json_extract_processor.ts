/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IngestProcessorContainer } from '@elastic/elasticsearch/lib/api/types';
import type {
  JsonExtractProcessor,
  JsonExtraction,
  JsonExtractType,
} from '../../../../types/processors';
import { painlessFieldAccessor, painlessFieldSetter } from '../../../../types/utils';
import { parseJsonPath, segmentsToStrings } from '../../shared/json_path_parser';

/**
 * Escapes a string for safe inclusion inside a Painless double-quoted string literal.
 */
function escapePainlessString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generates Painless code to traverse a parsed JSON object and extract a value.
 * Uses defensive null checks at each level.
 *
 * @param varName - The variable name holding the parsed JSON
 * @param parts - The path parts to traverse
 * @returns Painless expression that evaluates to the value or null
 */
function generateTraversalExpression(varName: string, parts: string[]): string {
  if (parts.length === 0) {
    return varName;
  }

  let expr = varName;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isNumeric = /^\d+$/.test(part);

    if (isNumeric) {
      expr = `(${expr} instanceof List && ((List)${expr}).size() > ${part} ? ((List)${expr}).get(${part}) : null)`;
    } else {
      const escaped = escapePainlessString(part);
      expr = `(${expr} instanceof Map ? ((Map)${expr}).get("${escaped}") : null)`;
    }
  }

  return expr;
}

/**
 * Generates Painless code to cast a value to the specified type.
 * Returns an expression that converts the extracted value to the target type.
 *
 * @param varName - The variable name holding the extracted value
 * @param type - The target type (keyword, integer, long, double, boolean)
 * @returns Painless expression that casts the value
 */
function generateTypeCast(varName: string, type: JsonExtractType): string {
  switch (type) {
    case 'integer':
      return `(${varName} instanceof Number ? ((Number)${varName}).intValue() : Integer.parseInt(${varName}.toString()))`;
    case 'long':
      return `(${varName} instanceof Number ? ((Number)${varName}).longValue() : Long.parseLong(${varName}.toString()))`;
    case 'double':
      return `(${varName} instanceof Number ? ((Number)${varName}).doubleValue() : Double.parseDouble(${varName}.toString()))`;
    case 'boolean':
      return `(${varName} instanceof Boolean ? (Boolean)${varName} : Boolean.parseBoolean(${varName}.toString()))`;
    case 'keyword':
    default:
      return `${varName}.toString()`;
  }
}

/**
 * Generates the Painless script source for JSON extraction.
 * Uses `Processors.json()` which is available in Painless ingest pipeline context.
 * Applies type casting to ensure consistent output types.
 */
function generateJsonExtractScript(
  field: string,
  extractions: JsonExtraction[],
  ignoreMissing: boolean
): string {
  const lines: string[] = [];

  // Read the source field
  const sourceAccess = painlessFieldAccessor(field);

  // Start with null check for the source field
  lines.push(`def jsonStr = ${sourceAccess};`);

  if (ignoreMissing) {
    lines.push('if (jsonStr == null) { return; }');
  }

  // Parse JSON using Painless Processors.json() method available in ingest pipeline context
  lines.push('def parsed = Processors.json(jsonStr);');

  // Generate extraction for each selector
  for (let i = 0; i < extractions.length; i++) {
    const extraction = extractions[i];
    const parts = segmentsToStrings(parseJsonPath(extraction.selector).segments);
    const traversalExpr = generateTraversalExpression('parsed', parts);
    const varName = `extracted_${i}`;
    const targetType = extraction.type ?? 'keyword';

    lines.push(`def ${varName} = ${traversalExpr};`);
    lines.push(`if (${varName} != null) {`);
    lines.push(`  if (${varName} instanceof Map || ${varName} instanceof List) {`);
    lines.push(`    ${painlessFieldSetter(extraction.target_field, varName)};`);
    lines.push(`  } else {`);
    const typeCastExpr = generateTypeCast(varName, targetType);
    lines.push(`    ${painlessFieldSetter(extraction.target_field, typeCastExpr)};`);
    lines.push(`  }`);
    lines.push(`}`);
  }

  return lines.join('\n');
}

/**
 * Converts a JsonExtractProcessor to an Ingest Pipeline script processor.
 *
 * @example
 * Input:
 *   {
 *     action: 'json_extract',
 *     field: 'message',
 *     extractions: [
 *       { selector: 'user_id', target_field: 'user.id' },
 *       { selector: '$.metadata.client.ip', target_field: 'client_ip' }
 *     ]
 *   }
 *
 * Output:
 *   { script: { lang: 'painless', source: '...' } }
 */
export function processJsonExtractProcessor(
  processor: Omit<JsonExtractProcessor, 'where' | 'action'> & { if?: string; tag?: string }
): IngestProcessorContainer {
  const { field, extractions, ignore_missing = false } = processor;

  const source = generateJsonExtractScript(field, extractions, ignore_missing);

  return {
    script: {
      lang: 'painless',
      source,
      description: `JsonExtract processor: extract from ${field}`,
      ...(processor.tag && { tag: processor.tag }),
      ...(processor.if && { if: processor.if }),
      ...(processor.ignore_failure === true && { ignore_failure: true }),
    },
  } as IngestProcessorContainer;
}
