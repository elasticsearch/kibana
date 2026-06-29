/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Builder } from '@elastic/esql';
import type { ESQLAstCommand, ESQLAstItem } from '@elastic/esql/types';
import type { GrokProcessor } from '../../../../types/processors';
import { parseMultiGrokPatterns } from '../../../../types/utils/grok_patterns';
import { conditionToESQLAst } from '../condition_to_esql';
import {
  buildIgnoreMissingFilter,
  castFieldsToGrokTypes,
  buildWhereCondition,
  buildDropColumns,
  buildTempFields,
  buildRestoreFieldsEval,
} from './common';
import { unwrapPatternDefinitions } from '../../../../types/utils/grok_pattern_definitions';

const SAVE_TEMP_PREFIX = '__streamlang_grok_temp_';

/**
 * Converts a Streamlang GrokProcessor into a list of ES|QL AST commands.
 *
 * Conditional execution logic:
 *  - If neither `ignore_missing` nor `where` is provided: emit a single GROK command.
 *  - Otherwise, use CASE approach to conditionally execute GROK:
 *      * Create temporary field and use CASE to conditionally set source field or empty string (empty string avoids ES|QL NULL errors)
 *      * Apply GROK to temporary field
 *      * Drop temporary field
 *    Condition: (exists(from) if ignore_missing) AND (where condition, if provided)
 *
 * Value preservation:
 *  - GROK is destructive: it overwrites target fields with NULL on failed/skipped parsing.
 *  - To preserve pre-existing values, target fields are saved into temp columns before GROK,
 *    then merged back with COALESCE so NULL results fall back to the prior value.
 *
 * Type handling:
 *  - Pre-grok: cast all GROKed target fields to their suffixed (or default) types with
 *              TO_STRING (keyword), TO_INTEGER or TO_DOUBLE for consistency.
 *
 * @example:
 *    ```typescript
 *    const streamlangDSL: StreamlangDSL = {
 *      steps: [
 *        {
 *          action: 'grok',
 *          from: 'message',
 *          patterns: ["%{IP:client.ip} %{NUMBER:size:int} %{NUMBER:burn_rate:float}"],
 *          ignore_missing: true,
 *          where: { field: 'flags.process', exists: true },
 *        } as GrokProcessor,
 *      ],
 *    };
 *    ```
 *
 *    Generates (conceptually):
 *    ```txt
 *    // | WHERE NOT(message IS NULL)  // Only if ignore_missing = false
 *    | EVAL `client.ip` = TO_STRING(`client.ip`)
 *    | EVAL `size` = TO_INTEGER(`size`)
 *    | EVAL `burn_rate` = TO_DOUBLE(`burn_rate`)
 *    | EVAL `__streamlang_grok_temp_client.ip` = `client.ip`, `__streamlang_grok_temp_size` = `size`, `__streamlang_grok_temp_burn_rate` = `burn_rate`
 *    | EVAL __temp_grok_where_message__ = CASE(NOT(message IS NULL) AND NOT(`flags.process` IS NULL), message, "")
 *    | GROK __temp_grok_where_message__ "%{IP:client.ip} %{NUMBER:size:int} %{NUMBER:burn_rate:float}"
 *    | DROP __temp_grok_where_message__
 *    | EVAL `client.ip` = COALESCE(`client.ip`, `__streamlang_grok_temp_client.ip`), `size` = COALESCE(`size`, `__streamlang_grok_temp_size`), `burn_rate` = COALESCE(`burn_rate`, `__streamlang_grok_temp_burn_rate`)
 *    | DROP `__streamlang_grok_temp_client.ip`, `__streamlang_grok_temp_size`, `__streamlang_grok_temp_burn_rate`
 *    ```
 */
export function convertGrokProcessorToESQL(processor: GrokProcessor): ESQLAstCommand[] {
  const {
    from,
    ignore_missing = false, // default mirrors ingest grok behavior
    where,
  } = processor;

  const fromColumn = Builder.expression.column(from);
  const primaryPattern = unwrapPatternDefinitions(processor)[0];
  const grokCommand = buildGrokCommand(fromColumn, primaryPattern);
  const commands: ESQLAstCommand[] = [];

  // Add missing field filter if needed (ignore_missing = false)
  const missingFieldFilter = buildIgnoreMissingFilter(ignore_missing, from);
  if (missingFieldFilter) {
    commands.push(missingFieldFilter);
  }

  // Extract target field names from the pattern for value preservation
  const { allFields } = parseMultiGrokPatterns([primaryPattern]);
  const fieldNames = allFields.map((f) => f.name);

  // Pre-cast target fields to their configured GROK types before saving,
  // so the saved temp columns have matching types for COALESCE
  if (allFields.length > 0) {
    commands.push(...castFieldsToGrokTypes(allFields));
  }

  // Save existing target field values before GROK can overwrite them
  if (fieldNames.length > 0) {
    commands.push(buildTempFields(fieldNames, SAVE_TEMP_PREFIX));
  }

  const needConditional = ignore_missing || Boolean(where);
  if (!needConditional) {
    commands.push(grokCommand);
  } else {
    // Build condition for when GROK should execute
    const grokCondition = buildWhereCondition(from, ignore_missing, where, conditionToESQLAst);

    // Create temporary field name for conditional processing
    // Using CASE, set temporary field to source field if condition passes, empty string otherwise
    const tempFieldName = `__temp_grok_where_${from}__`;
    const tempColumn = Builder.expression.column(tempFieldName);

    commands.push(
      Builder.command({
        name: 'eval',
        args: [
          Builder.expression.func.binary('=', [
            tempColumn,
            Builder.expression.func.call('CASE', [
              grokCondition,
              fromColumn,
              Builder.expression.literal.string(''), // Empty string avoids ES|QL NULL errors that would break the pipeline
            ]),
          ]),
        ],
      })
    );

    // Apply GROK to the temporary field
    commands.push(buildGrokCommand(tempColumn, primaryPattern));

    // Clean up conditional temporary field
    commands.push(Builder.command({ name: 'drop', args: [tempColumn] }));
  }

  // Restore original values where GROK produced NULL
  if (fieldNames.length > 0) {
    commands.push(buildRestoreFieldsEval(fieldNames, SAVE_TEMP_PREFIX));
    commands.push(buildDropColumns(fieldNames.map((f) => `${SAVE_TEMP_PREFIX}${f}`)));
  }

  return commands;
}

/** Build the GROK command (primary pattern only) */
function buildGrokCommand(fromColumn: ESQLAstItem, pattern: string): ESQLAstCommand {
  return Builder.command({
    name: 'grok',
    args: [fromColumn, Builder.expression.literal.string(pattern)],
  });
}
