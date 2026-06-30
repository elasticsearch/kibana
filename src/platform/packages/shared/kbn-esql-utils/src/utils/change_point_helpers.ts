/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { Parser, WrappingPrettyPrinter, isColumn } from '@elastic/esql';
import { CommandNames } from '@kbn/esql-language';
import type {
  ESQLAstChangePointCommand,
  ESQLAstQueryExpression,
  ESQLAstCommand,
  ESQLCommandOption,
} from '@elastic/esql/types';
import { escapeStringValue } from './append_to_query/utils';
import { sanitazeESQLInput } from './sanitaze_input';

/**
 * Detects top-level CHANGE_POINT commands so the Discover profile only activates for direct
 * change-point queries.
 * @param esql - The ES|QL query string
 */
export const hasChangePointCommand = (esql?: string): boolean => {
  if (!esql) return false;
  try {
    const { root } = Parser.parse(esql);
    return root.commands.some((cmd) => cmd.name === CommandNames.CHANGE_POINT);
  } catch {
    return false;
  }
};

/**
 * Output column names for the CHANGE_POINT command (type and pvalue).
 * Defaults are 'type' and 'pvalue' unless the query uses AS type_name, pvalue_name.
 * These are needed to find annotation columns in the returned datatable.
 * @param esql - The ES|QL query string
 * @returns Object with typeColumn and pvalueColumn names, or undefined if no CHANGE_POINT command
 */
export const getChangePointOutputColumnNames = (
  esql?: string
): { typeColumn: string; pvalueColumn: string } | undefined => {
  if (!esql) return undefined;
  try {
    const { root } = Parser.parse(esql);
    const cp = root.commands.find((c) => c.name === CommandNames.CHANGE_POINT) as
      | ESQLAstChangePointCommand
      | undefined;
    if (!cp) return undefined;
    return {
      typeColumn: cp.target?.type?.parts?.join('.') ?? 'type',
      pvalueColumn: cp.target?.pvalue?.parts?.join('.') ?? 'pvalue',
    };
  } catch {
    return undefined;
  }
};

/**
 * Metric (value) and time column names from the first CHANGE_POINT in the query (same rule as
 * {@link getChangePointOutputColumnNames}).
 * These names are needed to build the supporting line-chart query and pick timestamps from rows.
 */
export const getChangePointSeriesColumns = (
  esql?: string
): { valueColumn: string; timeColumn: string } | undefined => {
  if (!esql) return undefined;
  try {
    const { root } = Parser.parse(esql);
    const cp = root.commands.find((c) => c.name === CommandNames.CHANGE_POINT) as
      | ESQLAstChangePointCommand
      | undefined;
    if (!cp?.value?.parts?.length) return undefined;
    const valueColumn = cp.value.parts.join('.');
    const timeColumn = cp.key?.parts?.length ? cp.key.parts.join('.') : '@timestamp';
    return { valueColumn, timeColumn };
  } catch {
    return undefined;
  }
};

/**
 * Entity (BY-clause) column names from the first CHANGE_POINT command in the query.
 * Returns an empty array when there is no BY clause or no CHANGE_POINT command.
 * These are the column names needed to group CHANGE_POINT result rows by entity and to call
 * {@link appendEntityFiltersToChangePointLineEsql}.
 */
export const getChangePointEntityColumns = (esql?: string): string[] => {
  if (!esql) return [];
  try {
    const { root } = Parser.parse(esql);
    const cp = root.commands.find((c) => c.name === CommandNames.CHANGE_POINT) as
      | ESQLAstChangePointCommand
      | undefined;
    if (!cp) return [];
    const byOption = cp.args.find(
      (a): a is ESQLCommandOption =>
        (a as ESQLCommandOption).type === 'option' && (a as ESQLCommandOption).name === 'by'
    );
    if (!byOption) return [];
    return byOption.args.filter(isColumn).map((c) => c.parts.join('.'));
  } catch {
    return [];
  }
};

export const formatEsqlIdentifier = (columnId: string): string => {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnId)) {
    return columnId;
  }
  return sanitazeESQLInput(columnId) ?? `\`${columnId.replace(/`/g, '``')}\``;
};

// Entity values come from table data, so keep non-string literals typed and skip nullish values.
export const formatEsqlLiteral = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'string') {
    return escapeStringValue(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return escapeStringValue(value.toISOString());
  }
  return escapeStringValue(String(value));
};

/**
 * Narrows the line-chart ES|QL to a specific entity row by appending a {@code | WHERE} clause.
 */
export const appendEntityFiltersToChangePointLineEsql = (
  lineEsql: string,
  row: Readonly<Record<string, unknown>>,
  entityColumnIds: readonly string[]
): string => {
  if (!entityColumnIds.length) return lineEsql;
  const predicates = entityColumnIds.reduce<string[]>((acc, col) => {
    const lit = formatEsqlLiteral(row[col]);
    if (lit !== undefined) acc.push(`${formatEsqlIdentifier(col)} == ${lit}`);
    return acc;
  }, []);
  return predicates.length ? `${lineEsql} | WHERE ${predicates.join(' AND ')}` : lineEsql;
};

// Removes SORT immediately before CHANGE_POINT because Lens can sort the line data itself.
const stripTrailingSortCommands = <T extends { name?: string }>(commands: T[]): T[] => {
  const next = [...commands];
  while (next.length > 0 && next[next.length - 1]?.name === 'sort') {
    next.pop();
  }
  return next;
};

// Pretty-printers may emit multiline ES|QL; normalize it for embedding in Lens attributes.
const normalizePrintedEsql = (printed: string): string =>
  printed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ');

/**
 * Builds the ES|QL used as the Lens line-chart dataset: pipeline before CHANGE_POINT (trailing SORT
 * removed).
 * FORK queries are intentionally unsupported for line-series extraction.
 */
export const buildChangePointLineDataQuery = (esql?: string): string | undefined => {
  if (!esql) return undefined;
  try {
    const { root } = Parser.parse(esql);
    if (root.commands.some((c) => c.name === 'fork')) return undefined;

    const cpIdx = root.commands.findIndex((c) => c.name === CommandNames.CHANGE_POINT);
    if (cpIdx < 0) return undefined;
    const prefix = stripTrailingSortCommands(root.commands.slice(0, cpIdx) as ESQLAstCommand[]);
    const synthetic: ESQLAstQueryExpression = { ...root, commands: prefix };
    return normalizePrintedEsql(WrappingPrettyPrinter.print(synthetic));
  } catch {
    return undefined;
  }
};
