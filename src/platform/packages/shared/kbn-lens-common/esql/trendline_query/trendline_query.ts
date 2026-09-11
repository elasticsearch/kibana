/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { esql, Parser, BasicPrettyPrinter, isOptionNode } from '@elastic/esql';
import type { ESQLAstQueryExpression, ESQLCommand } from '@elastic/esql/types';
import { findStatsCommand, findByOption, parseBucketNode } from './ast_utils';
import {
  buildTrendlineBucketExpression,
  buildTrendlineTbucketExpression,
  findFirstStatsAfterTs,
  findStatsWithTbucket,
  getTbucketResultColumn,
  getBucketResultColumnForField,
} from './bucket';
import { commandsHaveStats, flattenForkCommands } from './fork';
import { resolveTrackedColumn, trackColumnAndEnsureKept } from './scope_walker';

export { buildTrendlineBucketExpression } from './bucket';

/**
 * Returns true when the ES|QL query contains at least one STATS command,
 * including STATS commands nested inside FORK branches.
 */
export const queryHasStatsCommand = (esqlQuery: string): boolean => {
  const { root } = Parser.parse(esqlQuery);
  return commandsHaveStats(root.commands);
};

/** Returns true when the ES|QL query uses the TS source command. */
export const queryHasTsSourceCommand = (esqlQuery: string): boolean => {
  const { root } = Parser.parse(esqlQuery);
  return root.commands.some((command) => command.name === 'ts');
};

/**
 * Resolves the result column name after a given command by walking renames in
 * the remaining pipeline segment.
 */
const resolveAfterCommand = (
  root: ESQLAstQueryExpression,
  command: ESQLCommand,
  resultColumn: string
): string =>
  resolveTrackedColumn(root.commands.slice(root.commands.indexOf(command) + 1), resultColumn).name;

/**
 * Applies the trendline time-bucketing rewrite to a parsed query AST in place
 * and returns the final time result column of the rewritten query.
 *
 * Handles regular source queries as follows:
 * - Query has `STATS ... BY ...` → appends BUCKET to the existing BY clause
 * - Query has `STATS` without `BY` → adds a BY clause with BUCKET
 * - Query has no `STATS` → appends a `STATS <agg> BY BUCKET(...)` command
 *
 * For a TS source, the first STATS command retains an existing TBUCKET or gets
 * a TBUCKET grouping. Later STATS commands operate on tabular results and are
 * not selected as the time-series aggregation.
 *
 * For non-TS sources (e.g. FROM), an existing TBUCKET grouping in any STATS
 * command is preserved as-is; no additional BUCKET is appended.
 *
 * When the query has no STATS and `metricFields` are provided, each field is
 * wrapped in `AVG()` (e.g. `STATS AVG(bytes) BY BUCKET(...)`). When no metric
 * fields are given, it falls back to `STATS COUNT(*) BY BUCKET(...)`.
 *
 * Queries with a top-level FORK are first reduced to the branch that produces
 * the metric columns (see `flattenForkCommands`) before the rewrite applies.
 *
 * Because the rewrite and the time-column resolution operate on the same AST
 * in a single pass, the returned column name is correct by construction for
 * the query the rewrite produced.
 */
const rewriteTrendlineAst = (
  root: ESQLAstQueryExpression,
  timeField: string,
  metricFields?: string[],
  groupByFields: string[] = []
): string => {
  if (root.commands.length === 0) {
    throw new Error('Cannot append time bucket to an empty ES|QL query');
  }

  flattenForkCommands(root.commands, metricFields);

  const bucketExpr = buildTrendlineBucketExpression(timeField);
  const tsStatsCommand = findFirstStatsAfterTs(root.commands);

  if (tsStatsCommand) {
    if (!getTbucketResultColumn(tsStatsCommand)) {
      const tbucketExpression = buildTrendlineTbucketExpression();
      const { root: helperAst } = Parser.parse(`TS _x | STATS _x BY ${tbucketExpression}`);
      const tbucketNode = findByOption(findStatsCommand(helperAst.commands)).args[0];
      const byOption = tsStatsCommand.args.find(isOptionNode);
      if (byOption) {
        byOption.args.push(tbucketNode);
      } else {
        tsStatsCommand.args.push(findByOption(findStatsCommand(helperAst.commands)));
      }
    }
    const tbucketColumn =
      getTbucketResultColumn(tsStatsCommand) ?? buildTrendlineTbucketExpression();
    return resolveAfterCommand(root, tsStatsCommand, tbucketColumn);
  }

  // TBUCKET is also valid with non-TS source commands (e.g. FROM); an existing
  // TBUCKET grouping already time-buckets the results, so no BUCKET may be added.
  const tbucketStatsCommand = findStatsWithTbucket(root.commands);
  if (tbucketStatsCommand) {
    const tbucketColumn =
      getTbucketResultColumn(tbucketStatsCommand) ?? buildTrendlineTbucketExpression();
    return resolveAfterCommand(root, tbucketStatsCommand, tbucketColumn);
  }

  const statsCmd = root.commands.findLast((c): c is ESQLCommand<'stats'> => c.name === 'stats');

  if (statsCmd) {
    const byOption = statsCmd.args.find(isOptionNode);

    if (byOption && !getBucketResultColumnForField(statsCmd, timeField)) {
      // STATS ... BY ... → append to existing BY
      byOption.args.push(parseBucketNode(bucketExpr));
    } else if (!byOption) {
      // STATS without BY → extract a typed BY option node from a helper parse
      const { root: byHelper } = Parser.parse(`FROM _x | STATS _x BY ${bucketExpr}`);
      const byNode = findByOption(findStatsCommand(byHelper.commands));
      statsCmd.args.push(byNode);
    }

    // KEEP commands before STATS need the raw time field (input to BUCKET);
    // KEEP commands after STATS only see the BUCKET result column.
    const statsIndex = root.commands.indexOf(statsCmd);
    const timeResultColumn = getBucketResultColumnForField(statsCmd, timeField) ?? bucketExpr;
    trackColumnAndEnsureKept(root.commands.slice(0, statsIndex), timeField);
    return trackColumnAndEnsureKept(root.commands.slice(statsIndex + 1), timeResultColumn).name;
  }

  trackColumnAndEnsureKept(root.commands, timeField);
  // No STATS → append full STATS <agg> BY BUCKET(...) command.
  // Use AVG(<field>) for each provided metric field, or COUNT(*) as fallback.
  const statsExprs =
    metricFields && metricFields.length > 0
      ? metricFields.map((f) => `AVG(${esql.col(f)})`).join(', ')
      : 'COUNT(*)';
  const effectiveGroupByFields = groupByFields.filter((field) => field !== timeField);
  const groupByExprs = [...effectiveGroupByFields.map((f) => esql.col(f)), bucketExpr].join(', ');
  const { root: helperAst } = Parser.parse(`FROM _x | STATS ${statsExprs} BY ${groupByExprs}`);
  root.commands.push(findStatsCommand(helperAst.commands));
  return bucketExpr;
};

/**
 * Appends a BUCKET time-bucketing clause to an ES|QL query for trendline use.
 *
 * Uses `@elastic/esql` AST parsing and manipulation for correct handling of
 * complex queries with proper field name escaping (e.g. dotted field names
 * are backtick-quoted). See `rewriteTrendlineAst` for rewrite semantics.
 */
export const appendTimeBucketToEsqlQuery = (
  esqlQuery: string,
  timeField: string,
  metricFields?: string[],
  groupByFields: string[] = []
): string => {
  const { root } = Parser.parse(esqlQuery);
  rewriteTrendlineAst(root, timeField, metricFields, groupByFields);
  return BasicPrettyPrinter.print(root);
};

export interface TrendlineQueryWithMetricFieldMap {
  query: string;
  metricFieldMap: Map<string, string>;
  timeField: string;
}

/**
 * Builds a trendline ES|QL query and returns the generated metric result column names.
 *
 * When the source query has no STATS command, the trendline query adds AVG(<field>)
 * aggregations for the provided metric fields. The returned map keeps Lens column
 * fieldNames aligned with those generated ES|QL result columns.
 *
 * The rewritten query and its time result column come from the same rewrite
 * pass over a single AST (see `rewriteTrendlineAst`).
 */
export const buildTrendlineQueryWithMetricFieldMap = (
  esqlQuery: string,
  timeField: string,
  metricFields: string[] = [],
  groupByFields: string[] = []
): TrendlineQueryWithMetricFieldMap => {
  const { root } = Parser.parse(esqlQuery);

  if (root.commands.length === 0) {
    throw new Error('Cannot append time bucket to an empty ES|QL query');
  }

  flattenForkCommands(root.commands, metricFields);
  const sourceQueryHasStats = commandsHaveStats(root.commands);

  const metricFieldMap = new Map<string, string>();
  if (!sourceQueryHasStats) {
    metricFields.forEach((field) => metricFieldMap.set(field, `AVG(${esql.col(field)})`));
  }

  const timeResultColumn = rewriteTrendlineAst(
    root,
    timeField,
    !sourceQueryHasStats ? metricFields : undefined,
    !sourceQueryHasStats ? groupByFields : undefined
  );

  return {
    query: BasicPrettyPrinter.print(root),
    metricFieldMap,
    timeField: timeResultColumn,
  };
};
