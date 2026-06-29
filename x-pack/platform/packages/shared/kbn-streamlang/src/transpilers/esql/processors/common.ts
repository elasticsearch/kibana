/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Builder } from '@elastic/esql';
import type { ESQLAstCommand, ESQLAstItem } from '@elastic/esql/types';
import type { Condition } from '../../../../types/conditions';
import type { DissectGrokPatternField } from '../../../../types/formats';
import { conditionToESQLAst } from '../condition_to_esql';

/**
 * Cast (or create) each listed field to string to normalize branch schemas
 * @param fieldNames List of field names to cast
 * @returns List of ESQL AST commands to perform the casts
 * */
export function castFieldsToString(fieldNames: string[]): ESQLAstCommand[] {
  return fieldNames.map((name) =>
    Builder.command({
      name: 'eval',
      args: [
        Builder.expression.func.binary('=', [
          Builder.expression.column(name),
          Builder.expression.func.call('TO_STRING', [Builder.expression.column(name)]),
        ]),
      ],
    })
  );
}

/**
 * Cast each GROK field to its configured type (int, float, keyword)
 * @param grokFields List of fields with their configured GROK types
 * @returns List of ESQL AST commands to perform the casts
 */
export function castFieldsToGrokTypes(grokFields: DissectGrokPatternField[]): ESQLAstCommand[] {
  return grokFields.map((f) => {
    let funcName: string;
    if (f.type === 'long') {
      funcName = 'TO_LONG';
    } else if (f.type === 'int') {
      funcName = 'TO_INTEGER';
    } else if (f.type === 'float') {
      funcName = 'TO_DOUBLE';
    } else {
      funcName = 'TO_STRING';
    }
    return Builder.command({
      name: 'eval',
      args: [
        Builder.expression.func.binary('=', [
          Builder.expression.column(f.name),
          Builder.expression.func.call(funcName, [Builder.expression.column(f.name)]),
        ]),
      ],
    });
  });
}

export function combineAnd(predicates: ESQLAstItem[]): ESQLAstItem | null {
  if (predicates.length === 0) return null;
  return predicates.reduce((acc, c) => (acc ? Builder.expression.func.binary('and', [acc, c]) : c));
}

export function combineOr(predicates: ESQLAstItem[]): ESQLAstItem | null {
  if (predicates.length === 0) return null;
  return predicates.reduce((acc, c) => (acc ? Builder.expression.func.binary('or', [acc, c]) : c));
}

/**
 * Creates a WHERE command to filter out documents with missing source fields when `ignore_missing: false`.
 * This simulates Ingest Pipeline's "field [field] not present" error behavior by pre-filtering documents.
 *
 * Behavioral Context:
 * - ignore_failure is implicitly false (not supported in Streamlang DSL yet)
 * - When ignore_failure = false, Ingest Pipeline fails on both missing fields AND pattern mismatches
 * - ES|QL can only simulate the missing field case with WHERE filtering
 * - Pattern mismatch failures cannot be (in a reasonable fashion) simulated in ES|QL (they nullify target fields instead)
 *
 * @param ignoreMissing - If false, returns WHERE command to filter missing fields
 * @param sourceFields - The source field names to check for NULL/missing values
 * @returns WHERE command if filtering needed, undefined otherwise
 *
 * @example
 * // Single field
 * buildIgnoreMissingFilter(false, 'message')
 * // → WHERE NOT(`message` IS NULL)
 *
 * @example
 * // Multiple fields (e.g., network_direction)
 * buildIgnoreMissingFilter(false, 'source.ip', 'destination.ip')
 * // → WHERE NOT(`source.ip` IS NULL) AND NOT(`destination.ip` IS NULL)
 */
export function buildIgnoreMissingFilter(
  ignoreMissing: boolean,
  ...sourceFields: string[]
): ESQLAstCommand | undefined {
  if (ignoreMissing || sourceFields.length === 0) {
    return undefined; // No filtering needed when ignore_missing = true
  }

  const notNullPredicates = sourceFields.map((field) =>
    Builder.expression.func.call('NOT', [
      Builder.expression.func.postfix('IS NULL', Builder.expression.column(field)),
    ])
  );

  const combinedPredicate = combineAnd(notNullPredicates);

  if (!combinedPredicate) {
    return undefined;
  }

  return Builder.command({
    name: 'where',
    args: [combinedPredicate],
  });
}

/**
 * Creates a WHERE command to filter out documents with existing target fields when `override: false`.
 * This simulates Ingest Pipeline's "field [field] already exists" error behavior by pre-filtering documents.
 *
 * Behavioral Context:
 * - ignore_failure is implicitly false (not supported in Streamlang DSL yet)
 * - When ignore_failure = false, override = false make Ingest Pipeline fail if target field already exists
 * - ES|QL uses WHERE filtering to exclude documents with existing target fields
 * - This aligns the behavior between Ingest Pipeline errors and ES|QL filtering
 *
 * @param targetField - The target field name to check for existence
 * @param override - If false, returns WHERE command to filter existing target fields
 * @returns WHERE command if filtering needed, undefined otherwise
 */
export function buildOverrideFilter(
  targetField: string,
  override: boolean
): ESQLAstCommand | undefined {
  if (override) {
    return undefined; // No filtering needed when override = true
  }

  const toColumn = Builder.expression.column(targetField);
  return Builder.command({
    name: 'where',
    args: [Builder.expression.func.postfix('IS NULL', toColumn)],
  });
}

/**
 * Creates an EVAL command that conditionally routes the source expression through a CASE guard,
 * storing either the real value or a fallback sentinel in a temp column.
 *
 * The default fallback is the empty string `""` — historically used because every command we
 * route through this helper happened to short-circuit cleanly on an empty input. Callers whose
 * downstream command does NOT short-circuit on `""` (e.g. `URI_PARTS`, which emits
 * `path = ""` rather than NULL for an empty input and therefore leaks a non-null sub-field
 * into the destructive-overwrite-merge step) should pass `Builder.expression.literal.nil()`
 * so the temp column is NULL on gated rows. ES|QL's NULL propagation through commands then
 * guarantees all output sub-fields are NULL, and the COALESCE merge naturally preserves
 * prior `<to>.*` values.
 *
 * @param condition - The Streamlang condition that guards execution
 * @param sourceExpression - The field/expression to pass through when the condition is true
 * @param tempColumn - Name of the temporary output column
 * @param fallback - Sentinel written when the condition is false (defaults to `""`)
 * @returns EVAL command: `EVAL <tempColumn> = CASE(<condition>, <sourceExpression>, <fallback>)`
 */
export function buildConditionalEval(
  condition: Condition,
  sourceExpression: string,
  tempColumn: string,
  fallback: ESQLAstItem = Builder.expression.literal.string('')
): ESQLAstCommand {
  return Builder.command({
    name: 'eval',
    args: [
      Builder.expression.func.binary('=', [
        Builder.expression.column(tempColumn),
        Builder.expression.func.call('CASE', [
          conditionToESQLAst(condition),
          Builder.expression.column(sourceExpression),
          fallback,
        ]),
      ]),
    ],
  });
}

/**
 * Creates a single EVAL command that saves existing field values into temporary columns
 * before a destructive command (like GROK or DISSECT) can overwrite them with NULL.
 *
 * @param fields - Full field names to save (e.g. ['client.ip', 'size'])
 * @param tempPrefix - Prefix for temporary column names (e.g. '__streamlang_grok_save_')
 * @returns EVAL command: `EVAL <tempPrefix><f> = <f>, ...`
 */
export function buildTempFields(fields: string[], tempPrefix: string): ESQLAstCommand {
  return Builder.command({
    name: 'eval',
    args: fields.map((field) =>
      Builder.expression.func.binary('=', [
        Builder.expression.column(`${tempPrefix}${field}`),
        Builder.expression.column(field),
      ])
    ),
  });
}

/**
 * Creates a single EVAL command with COALESCE assignments that restores original field values
 * when a destructive command (like GROK or DISSECT) produced NULL.
 *
 * @param fields - Full field names to merge (e.g. ['client.ip', 'size'])
 * @param tempPrefix - Prefix used for the temporary columns created by buildSaveFieldsEval
 * @returns EVAL command: `EVAL <field> = COALESCE(<field>, <tempPrefix><field>), ...`
 */
export function buildRestoreFieldsEval(fields: string[], tempPrefix: string): ESQLAstCommand {
  return Builder.command({
    name: 'eval',
    args: fields.map((field) =>
      Builder.expression.func.binary('=', [
        Builder.expression.column(field),
        Builder.expression.func.call('COALESCE', [
          Builder.expression.column(field),
          Builder.expression.column(`${tempPrefix}${field}`),
        ]),
      ])
    ),
  });
}

/**
 * Creates a single EVAL command with COALESCE assignments that merge temp-prefixed columns into target-prefixed columns.
 *
 * @param fields - Field names to merge (without prefix)
 * @param tempPrefix - Prefix used for the temporary output columns
 * @param targetPrefix - Prefix used for the final target columns
 * @returns EVAL command: `EVAL <targetPrefix>.<f> = COALESCE(<tempPrefix>.<f>, <targetPrefix>.<f>), ...`
 */
export function buildCoalescePrefixedFieldsEval(
  fields: string[],
  tempPrefix: string,
  targetPrefix: string
): ESQLAstCommand {
  return Builder.command({
    name: 'eval',
    args: fields.map((field) =>
      Builder.expression.func.binary('=', [
        Builder.expression.column(`${targetPrefix}.${field}`),
        Builder.expression.func.call('COALESCE', [
          Builder.expression.column(`${tempPrefix}.${field}`),
          Builder.expression.column(`${targetPrefix}.${field}`),
        ]),
      ])
    ),
  });
}

/**
 * Creates a DROP command for a list of column names.
 *
 * @param columns - Column names to drop
 * @returns DROP command: `DROP <col1>, <col2>, ...`
 */
export function buildDropColumns(columns: string[]): ESQLAstCommand {
  return Builder.command({
    name: 'drop',
    args: columns.map((col) => Builder.expression.column(col)),
  });
}

export function buildWhereCondition(
  fromField: string,
  ignoreMissing: boolean,
  where: Condition | undefined,
  conditionToESQL: (c: Condition) => ESQLAstItem
): ESQLAstItem {
  const predicates: ESQLAstItem[] = [];
  if (ignoreMissing) predicates.push(conditionToESQL({ field: fromField, exists: true }));
  if (where) predicates.push(conditionToESQL(where));
  return combineAnd(predicates) ?? Builder.expression.literal.boolean(true);
}
