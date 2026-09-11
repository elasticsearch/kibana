/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Builder, BasicPrettyPrinter, Parser } from '@elastic/esql';
import type { ESQLSingleAstItem, BinaryExpressionComparisonOperator } from '@elastic/esql/types';
import { escapeField } from '../shared/escape_esql_identifier';
import {
  Aggregation,
  Comparator,
  AGGREGATIONS_REQUIRING_FIELD,
  type StatDefinition,
  type AlertCondition,
  type SeverityConfig,
  type ThresholdFormValues,
} from './form_types';

const AGG_FN_NAME: Record<Aggregation, string> = {
  [Aggregation.COUNT]: 'COUNT',
  [Aggregation.AVG]: 'AVG',
  [Aggregation.SUM]: 'SUM',
  [Aggregation.MIN]: 'MIN',
  [Aggregation.MAX]: 'MAX',
  [Aggregation.CARDINALITY]: 'COUNT_DISTINCT',
  [Aggregation.P95]: 'PERCENTILE',
  [Aggregation.P99]: 'PERCENTILE',
};

const parseFragment = (src: string): ESQLSingleAstItem | null => {
  try {
    const { root, errors } = Parser.parse(`ROW x = 1 | WHERE ${src}`);
    if (errors.length > 0) return null;
    const whereCmd = root.commands.find((c) => c.name === 'where');
    if (whereCmd && whereCmd.args.length > 0) {
      return whereCmd.args[0] as ESQLSingleAstItem;
    }
  } catch {
    // malformed expression
  }
  return null;
};

const buildAggFragment = (stat: StatDefinition): string => {
  const fnName = AGG_FN_NAME[stat.aggregation] ?? 'COUNT';
  let arg = '*';
  if (stat.aggregation !== Aggregation.COUNT && stat.field) {
    arg = escapeField(stat.field);
  }

  let expr: string;
  if (stat.aggregation === Aggregation.P95) {
    expr = `${fnName}(${arg}, 95)`;
  } else if (stat.aggregation === Aggregation.P99) {
    expr = `${fnName}(${arg}, 99)`;
  } else {
    expr = `${fnName}(${arg})`;
  }

  if (stat.filter?.trim()) {
    expr += ` WHERE ${stat.filter.trim()}`;
  }
  return expr;
};

// Builder.expression.func.binary('where', ...) produces a binary expression that
// the pretty printer wraps in parentheses, but ES|QL's inline WHERE on aggregations
// (e.g. COUNT(*) WHERE status >= 500) is not a binary expression — it's a special
// syntactic form inside STATS. The parser handles it correctly, so we build the
// STATS command as a string fragment and parse it to get the right AST structure.
const parseStatsCommand = (
  stats: StatDefinition[],
  groupByFields: string[]
): ESQLSingleAstItem[] => {
  const assignments = stats.map((s) => `${escapeField(s.label)} = ${buildAggFragment(s)}`);
  const groupBy =
    groupByFields.length > 0 ? ` BY ${groupByFields.map(escapeField).join(', ')}` : '';
  const src = `ROW x = 1 | STATS ${assignments.join(', ')}${groupBy}`;
  const { root } = Parser.parse(src);
  const statsCmd = root.commands.find((c) => c.name === 'stats');
  return statsCmd ? (statsCmd.args as ESQLSingleAstItem[]) : [];
};

const COMPARATOR_OP: Partial<Record<Comparator, BinaryExpressionComparisonOperator>> = {
  [Comparator.GT]: '>',
  [Comparator.GTE]: '>=',
  [Comparator.LT]: '<',
  [Comparator.LTE]: '<=',
};

const buildConditionExpr = (condition: AlertCondition): ESQLSingleAstItem => {
  const col = Builder.expression.column(condition.metric);
  const t0 = Builder.expression.literal.decimal(condition.threshold[0]);

  const simpleOp = COMPARATOR_OP[condition.comparator];
  if (simpleOp) {
    return Builder.expression.func.binary(simpleOp, [col, t0]);
  }

  const t1 = Builder.expression.literal.decimal(condition.threshold[1] ?? condition.threshold[0]);

  if (condition.comparator === Comparator.BETWEEN) {
    return Builder.expression.func.binary('and', [
      Builder.expression.func.binary('>=', [col, t0]),
      Builder.expression.func.binary('<=', [Builder.expression.column(condition.metric), t1]),
    ]);
  }

  // NOT_BETWEEN: metric < t0 OR metric > t1
  return Builder.expression.func.binary('or', [
    Builder.expression.func.binary('<', [col, t0]),
    Builder.expression.func.binary('>', [Builder.expression.column(condition.metric), t1]),
  ]);
};

/**
 * Build the right-hand side of `EVAL severity = <rhs>`. Single mode emits a
 * constant `"<level>"`; multi mode emits a `CASE(...)` evaluated from most to
 * least severe (the least-severe level being the fallback). The WHERE clause is
 * driven by the alert condition itself — the lowest severity level threshold is
 * kept in sync with the condition threshold in the form (see ADR), so no query
 * rewrite is needed here. Returns `null` when multi mode cannot be represented
 * (range comparator or no levels).
 */
const buildSeverityEvalRhs = (
  severity: SeverityConfig,
  condition: AlertCondition
): string | null => {
  if (severity.mode === 'single') {
    return `"${severity.singleLevelSeverity}"`;
  }

  const operator = COMPARATOR_OP[condition.comparator];
  if (!operator || severity.levels.length === 0) return null;

  const column = escapeField(condition.metric);
  const [lowest, ...moreSevere] = severity.levels;
  const branches = moreSevere
    .slice()
    .reverse()
    .map((level) => `${column} ${operator} ${level.threshold}, "${level.severity}"`);

  return branches.length > 0
    ? `CASE(${branches.join(', ')}, "${lowest.severity}")`
    : `"${lowest.severity}"`;
};

const isStatValid = (stat: StatDefinition): boolean => {
  if (!stat.label) return false;
  if (AGGREGATIONS_REQUIRING_FIELD.includes(stat.aggregation) && !stat.field) return false;
  return true;
};

/**
 * Builds an ES|QL query string from threshold rule builder form fields
 * using the @elastic/esql AST builder and pretty printer.
 *
 * Example output:
 *   FROM logs-*
 *     | WHERE service.name == "api"
 *     | STATS errors = COUNT(*) WHERE status >= 500, total = COUNT(*)
 *     | EVAL error_rate = errors / total * 100
 *     | WHERE error_rate > 5
 */
export const buildThresholdEsql = (values: ThresholdFormValues): string => {
  if (!values.indexPattern) return '';

  const validStats = values.stats.filter(isStatValid);
  if (validStats.length === 0) return '';

  const commands = [];

  // FROM
  commands.push(
    Builder.command({
      name: 'from',
      args: [Builder.expression.source.index(values.indexPattern)],
    })
  );

  // WHERE (global filter)
  if (values.filterQuery?.trim()) {
    const filterAst = parseFragment(values.filterQuery.trim());
    if (filterAst) {
      commands.push(Builder.command({ name: 'where', args: [filterAst] }));
    }
  }

  const statsArgs = parseStatsCommand(validStats, values.groupByFields);
  commands.push(Builder.command({ name: 'stats', args: statsArgs }));

  // EVAL
  const validEvals = values.evaluations.filter((e) => e.label.trim() && e.expression.trim());
  for (const ev of validEvals) {
    const exprAst = parseFragment(ev.expression.trim());
    if (exprAst) {
      commands.push(
        Builder.command({
          name: 'eval',
          args: [
            Builder.expression.func.binary('=', [Builder.expression.column(ev.label), exprAst]),
          ],
        })
      );
    }
  }

  // WHERE (alert conditions). Severity only applies to a single condition; the
  // lowest severity level threshold is synced to the condition in the form, so
  // the WHERE is always built straight from the alert conditions.
  const validConditions = values.alertConditions.filter((c) => c.metric && c.threshold.length > 0);
  const singleCondition = validConditions.length === 1 ? validConditions[0] : undefined;
  const severityEvalRhs =
    values.severity && singleCondition
      ? buildSeverityEvalRhs(values.severity, singleCondition)
      : null;

  if (validConditions.length > 0) {
    const conditionExprs = validConditions.map(buildConditionExpr);
    const joiner = values.conditionOperator === 'OR' ? 'or' : 'and';
    const combined = conditionExprs.reduce((left, right) =>
      Builder.expression.func.binary(joiner, [left, right])
    );
    commands.push(Builder.command({ name: 'where', args: [combined] }));
  }

  // EVAL severity (after the breach WHERE, so it enriches breached rows).
  if (severityEvalRhs) {
    const exprAst = parseFragment(severityEvalRhs);
    if (exprAst) {
      commands.push(
        Builder.command({
          name: 'eval',
          args: [
            Builder.expression.func.binary('=', [Builder.expression.column('severity'), exprAst]),
          ],
        })
      );
    }
  }

  const root = Builder.expression.query(commands);
  return BasicPrettyPrinter.multiline(root, { pipeTab: '  ' });
};

export const buildRecoveryBlock = (values: ThresholdFormValues): string | undefined => {
  const { recovery } = values;
  if (!recovery) return undefined;

  const validConditions = recovery.conditions.filter((c) => c.metric && c.threshold.length > 0);
  if (validConditions.length === 0) return undefined;

  const conditionExprs = validConditions.map(buildConditionExpr);
  const joiner = recovery.conditionOperator === 'OR' ? 'or' : 'and';
  const combined = conditionExprs.reduce((left, right) =>
    Builder.expression.func.binary(joiner, [left, right])
  );

  const whereCmd = Builder.command({ name: 'where', args: [combined] });
  return `| ${BasicPrettyPrinter.command(whereCmd)}`;
};
