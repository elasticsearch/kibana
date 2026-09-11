/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  Parser,
  BasicPrettyPrinter,
  isFunctionExpression,
  isColumn,
  isSource,
  isOptionNode,
} from '@elastic/esql';
import type {
  ESQLCommand,
  ESQLCommandOption,
  ESQLFunction,
  ESQLAstItem,
  ESQLSingleAstItem,
} from '@elastic/esql/types';
import type { AlertEventSeverity } from '@kbn/alerting-v2-schemas';
import { SEVERITY_LEVELS } from '@kbn/alerting-v2-schemas';
import {
  Aggregation,
  Comparator,
  generateId,
  reconcileAlertConditionMetrics,
  DEFAULT_SINGLE_SEVERITY_LEVEL,
  DEFAULT_THRESHOLD_FORM_VALUES,
  type ThresholdFormValues,
  type StatDefinition,
  type EvaluationDefinition,
  type AlertCondition,
  type RecoveryCondition,
  type RecoveryConfig,
  type ConditionOperator,
  type SeverityConfig,
  type SeverityLevel,
} from './form_types';

const REVERSE_AGG: Record<string, Aggregation> = {
  COUNT: Aggregation.COUNT,
  AVG: Aggregation.AVG,
  SUM: Aggregation.SUM,
  MIN: Aggregation.MIN,
  MAX: Aggregation.MAX,
  COUNT_DISTINCT: Aggregation.CARDINALITY,
};

const REVERSE_COMPARATOR: Record<string, Comparator> = {
  '>': Comparator.GT,
  '>=': Comparator.GTE,
  '<': Comparator.LT,
  '<=': Comparator.LTE,
};

const printExpr = (node: ESQLAstItem): string => {
  return BasicPrettyPrinter.expression(node as ESQLSingleAstItem);
};

const getColumnName = (node: ESQLAstItem): string | null => {
  if (isColumn(node)) return node.name;
  return null;
};

const unwrapSingleItem = (item: ESQLAstItem): ESQLSingleAstItem => {
  if (Array.isArray(item) && item.length === 1) return item[0] as ESQLSingleAstItem;
  return item as ESQLSingleAstItem;
};

const parseStatAssignment = (node: ESQLAstItem): StatDefinition | null => {
  if (!isFunctionExpression(node as ESQLSingleAstItem)) return null;
  const fn = node as ESQLFunction;

  let assignFn: ESQLFunction;
  let filter: string | undefined;

  if (fn.name === 'where' && fn.args.length === 2) {
    if (!isFunctionExpression(fn.args[0] as ESQLSingleAstItem)) return null;
    assignFn = fn.args[0] as ESQLFunction;
    filter = printExpr(fn.args[1]);
  } else {
    assignFn = fn;
  }

  if (assignFn.name !== '=' || assignFn.args.length !== 2) return null;

  const label = getColumnName(assignFn.args[0] as ESQLAstItem);
  if (!label) return null;

  const aggNode = unwrapSingleItem(assignFn.args[1]);
  if (!isFunctionExpression(aggNode)) return null;

  const fnName = aggNode.name.toUpperCase();
  const aggregation = REVERSE_AGG[fnName];

  if (fnName === 'PERCENTILE' && aggNode.args.length >= 2) {
    const secondArg = aggNode.args[1] as ESQLSingleAstItem;
    const percentile = 'value' in secondArg ? Number(secondArg.value) : null;
    const field = getColumnName(aggNode.args[0] as ESQLAstItem);
    if (percentile === 95)
      return {
        id: generateId(),
        label,
        aggregation: Aggregation.P95,
        field: field ?? undefined,
        filter,
      };
    if (percentile === 99)
      return {
        id: generateId(),
        label,
        aggregation: Aggregation.P99,
        field: field ?? undefined,
        filter,
      };
    return null;
  }

  if (!aggregation) return null;

  if (aggregation === Aggregation.COUNT) {
    return { id: generateId(), label, aggregation, filter };
  }

  const field = aggNode.args.length > 0 ? getColumnName(aggNode.args[0] as ESQLAstItem) : null;
  if (!field) return null;

  return { id: generateId(), label, aggregation, field, filter };
};

const parseStatsCommand = (
  cmd: ESQLCommand
): { stats: StatDefinition[]; groupByFields: string[] } | null => {
  const stats: StatDefinition[] = [];
  const groupByFields: string[] = [];

  for (const arg of cmd.args) {
    const singleArg = arg as ESQLSingleAstItem;
    if (isOptionNode(singleArg) && (singleArg as ESQLCommandOption).name === 'by') {
      for (const byArg of (singleArg as ESQLCommandOption).args) {
        const name = getColumnName(byArg);
        if (name) groupByFields.push(name);
      }
      continue;
    }

    const stat = parseStatAssignment(arg);
    if (!stat) return null;
    stats.push(stat);
  }

  if (stats.length === 0) return null;
  return { stats, groupByFields };
};

const parseEvalCommand = (cmd: ESQLCommand): EvaluationDefinition | null => {
  if (cmd.args.length !== 1) return null;
  const arg = cmd.args[0];
  if (!isFunctionExpression(arg as ESQLSingleAstItem)) return null;

  const fn = arg as ESQLFunction;
  if (fn.name !== '=' || fn.args.length !== 2) return null;

  const label = getColumnName(fn.args[0] as ESQLAstItem);
  if (!label) return null;

  const expression = printExpr(unwrapSingleItem(fn.args[1]));
  return { id: generateId(), label, expression };
};

interface ConditionLeaf {
  metric: string;
  comparator: Comparator;
  threshold: number[];
}

const extractNumericValue = (node: ESQLAstItem): number | null => {
  const item = node as ESQLSingleAstItem;
  if ('value' in item && typeof item.value === 'number') return item.value;
  if ('value' in item && typeof item.value === 'string') {
    const num = Number(item.value);
    return isNaN(num) ? null : num;
  }
  return null;
};

const parseSimpleComparison = (node: ESQLFunction): ConditionLeaf | null => {
  const comparator = REVERSE_COMPARATOR[node.name];
  if (!comparator) return null;
  if (node.args.length !== 2) return null;

  const metric = getColumnName(node.args[0] as ESQLAstItem);
  if (!metric) return null;

  const value = extractNumericValue(node.args[1]);
  if (value === null) return null;

  return { metric, comparator, threshold: [value] };
};

// Detect BETWEEN: metric >= t0 AND metric <= t1
const parseBetween = (node: ESQLFunction): ConditionLeaf | null => {
  if (node.name !== 'and' || node.args.length !== 2) return null;

  const left = node.args[0] as ESQLSingleAstItem;
  const right = node.args[1] as ESQLSingleAstItem;
  if (!isFunctionExpression(left) || !isFunctionExpression(right)) return null;
  if (left.name !== '>=' || right.name !== '<=') return null;

  const leftMetric = getColumnName(left.args[0] as ESQLAstItem);
  const rightMetric = getColumnName(right.args[0] as ESQLAstItem);
  if (!leftMetric || !rightMetric || leftMetric !== rightMetric) return null;

  const t0 = extractNumericValue(left.args[1]);
  const t1 = extractNumericValue(right.args[1]);
  if (t0 === null || t1 === null) return null;

  return { metric: leftMetric, comparator: Comparator.BETWEEN, threshold: [t0, t1] };
};

// Detect NOT_BETWEEN: metric < t0 OR metric > t1
const parseNotBetween = (node: ESQLFunction): ConditionLeaf | null => {
  if (node.name !== 'or' || node.args.length !== 2) return null;

  const left = node.args[0] as ESQLSingleAstItem;
  const right = node.args[1] as ESQLSingleAstItem;
  if (!isFunctionExpression(left) || !isFunctionExpression(right)) return null;
  if (left.name !== '<' || right.name !== '>') return null;

  const leftMetric = getColumnName(left.args[0] as ESQLAstItem);
  const rightMetric = getColumnName(right.args[0] as ESQLAstItem);
  if (!leftMetric || !rightMetric || leftMetric !== rightMetric) return null;

  const t0 = extractNumericValue(left.args[1]);
  const t1 = extractNumericValue(right.args[1]);
  if (t0 === null || t1 === null) return null;

  return { metric: leftMetric, comparator: Comparator.NOT_BETWEEN, threshold: [t0, t1] };
};

const parseConditionNode = (node: ESQLSingleAstItem): ConditionLeaf | null => {
  if (!isFunctionExpression(node)) return null;
  return parseBetween(node) ?? parseNotBetween(node) ?? parseSimpleComparison(node);
};

const parseAlertConditions = (
  cmd: ESQLCommand
): { conditions: AlertCondition[]; operator: ConditionOperator } | null => {
  if (cmd.args.length !== 1) return null;
  const expr = cmd.args[0] as ESQLSingleAstItem;

  if (!isFunctionExpression(expr)) return null;

  // Single condition
  const single = parseConditionNode(expr);
  if (single) {
    return {
      conditions: [{ id: generateId(), ...single }],
      operator: 'AND',
    };
  }

  // Multiple conditions joined by AND or OR
  const fn = expr as ESQLFunction;
  if (fn.name !== 'and' && fn.name !== 'or') return null;

  const operator: ConditionOperator = fn.name === 'or' ? 'OR' : 'AND';
  const leaves = flattenBooleanTree(fn, fn.name);
  if (!leaves) return null;

  const conditions: AlertCondition[] = [];
  for (const leaf of leaves) {
    const parsed = parseConditionNode(leaf);
    if (!parsed) return null;
    conditions.push({ id: generateId(), ...parsed });
  }

  return { conditions, operator };
};

// Flatten a tree of AND/AND/AND or OR/OR/OR into leaf nodes.
// Returns null if the tree mixes AND and OR (except within BETWEEN/NOT_BETWEEN).
const flattenBooleanTree = (node: ESQLFunction, expectedOp: string): ESQLSingleAstItem[] | null => {
  if (node.name !== expectedOp) {
    // This node is a different operator — it might be a BETWEEN or NOT_BETWEEN compound,
    // or a simple comparison. Return it as a single leaf.
    return [node as ESQLSingleAstItem];
  }

  const result: ESQLSingleAstItem[] = [];
  for (const arg of node.args) {
    if (!isFunctionExpression(arg as ESQLSingleAstItem)) return null;
    const child = arg as ESQLFunction;

    // Check if child is a compound (BETWEEN/NOT_BETWEEN) before recursing
    if (child.name !== expectedOp) {
      result.push(child as ESQLSingleAstItem);
    } else {
      const sub = flattenBooleanTree(child, expectedOp);
      if (!sub) return null;
      result.push(...sub);
    }
  }
  return result;
};

const SEVERITY_VALUES = new Set<string>(SEVERITY_LEVELS);
const isSeverityValue = (value: string): value is AlertEventSeverity => SEVERITY_VALUES.has(value);

const extractStringLiteral = (node: ESQLAstItem): string | null => {
  const match = printExpr(node)
    .trim()
    .match(/^"(.*)"$/);
  return match ? match[1] : null;
};

/** Detect an `EVAL severity = ...` command (emitted after the breach WHERE). */
const isSeverityEval = (cmd: ESQLCommand): boolean => {
  if (cmd.name !== 'eval' || cmd.args.length !== 1) return false;
  const arg = cmd.args[0] as ESQLSingleAstItem;
  if (!isFunctionExpression(arg)) return false;
  const fn = arg as ESQLFunction;
  if (fn.name !== '=' || fn.args.length !== 2) return false;
  return getColumnName(fn.args[0] as ESQLAstItem) === 'severity';
};

/**
 * Reconstruct the severity config from an `EVAL severity = ...` command. A bare
 * string literal maps to single mode; a `CASE(...)` maps to multi mode. Because
 * the least-severe threshold lives in the breach WHERE (not the CASE), it is
 * taken from the parsed alert condition.
 */
const parseSeverityEval = (
  cmd: ESQLCommand,
  alertConditions: AlertCondition[]
): SeverityConfig | null => {
  const fn = cmd.args[0] as ESQLFunction;
  const rhs = unwrapSingleItem(fn.args[1]);

  // Single mode: EVAL severity = "high"
  const singleLiteral = extractStringLiteral(rhs);
  if (singleLiteral) {
    if (!isSeverityValue(singleLiteral)) return null;
    return { mode: 'single', singleLevelSeverity: singleLiteral, levels: [] };
  }

  // Multi mode: EVAL severity = CASE(cond, "lvl", ..., "defaultLvl")
  if (!isFunctionExpression(rhs)) return null;
  const caseFn = rhs as ESQLFunction;
  if (caseFn.name.toUpperCase() !== 'CASE') return null;

  const caseArgs = caseFn.args;
  // Expect (condition, result) pairs followed by a single default result (odd length).
  if (caseArgs.length < 3 || caseArgs.length % 2 === 0) return null;

  const defaultLevel = extractStringLiteral(caseArgs[caseArgs.length - 1]);
  if (!defaultLevel || !isSeverityValue(defaultLevel)) return null;

  const [condition] = alertConditions;
  const lowestThreshold = condition?.threshold[0];
  if (lowestThreshold === undefined) return null;

  const pairs: SeverityLevel[] = [];
  for (let i = 0; i < caseArgs.length - 1; i += 2) {
    const leaf = parseConditionNode(unwrapSingleItem(caseArgs[i]));
    const level = extractStringLiteral(caseArgs[i + 1]);
    if (!leaf || !level || !isSeverityValue(level)) return null;
    pairs.push({ id: generateId(), severity: level, threshold: leaf.threshold[0] });
  }

  // CASE lists branches most-to-least severe; levels are ordered least-to-most,
  // with the default (least severe) inheriting the breach WHERE threshold.
  const levels: SeverityLevel[] = [
    { id: generateId(), severity: defaultLevel, threshold: lowestThreshold },
    ...pairs.reverse(),
  ];

  return { mode: 'multi', singleLevelSeverity: DEFAULT_SINGLE_SEVERITY_LEVEL, levels };
};

export const parseRecoveryBlock = (
  recoveryBlock: string
): { conditions: RecoveryCondition[]; conditionOperator: ConditionOperator } | null => {
  if (!recoveryBlock.trim()) return null;

  const src = `ROW x = 1 ${recoveryBlock}`;
  const { root, errors } = Parser.parse(src);
  if (errors.length > 0) return null;

  const whereCmd = root.commands.find((c) => c.name === 'where');
  if (!whereCmd) return null;

  const result = parseAlertConditions(whereCmd);
  if (!result) return null;

  return {
    conditions: result.conditions,
    conditionOperator: result.operator,
  };
};

export const extractRecoveryBlock = (fullRecoveryQuery: string): string | undefined => {
  if (!fullRecoveryQuery.trim()) return undefined;
  const { root, errors } = Parser.parse(fullRecoveryQuery);
  if (errors.length === 0) {
    const lastCmd = root.commands[root.commands.length - 1];
    if (lastCmd?.name === 'where') {
      return `| ${BasicPrettyPrinter.command(lastCmd)}`;
    }
  }
  return undefined;
};

/**
 * Attempts to parse an ES|QL query string back into ThresholdFormValues.
 * Returns null if the query doesn't match the expected builder structure,
 * signaling the caller to fall back to ES|QL mode.
 *
 * Expected command sequence:
 *   FROM <index> [| WHERE <filter>] | STATS ... [BY ...] [| EVAL ...]* [| WHERE <conditions>]
 */
export const parseThresholdEsql = (
  query: string,
  recoveryQuery?: string
): ThresholdFormValues | null => {
  if (!query.trim()) return null;

  const { root, errors } = Parser.parse(query);
  if (errors.length > 0) return null;

  const commands = root.commands;
  if (commands.length < 2) return null;

  let idx = 0;

  // FROM
  const fromCmd = commands[idx];
  if (fromCmd.name !== 'from') return null;

  const sourceArg = fromCmd.args.find((a) => isSource(a as ESQLSingleAstItem));
  if (!sourceArg) return null;
  const indexPattern = (sourceArg as ESQLSingleAstItem & { name: string }).name;
  if (!indexPattern || typeof indexPattern !== 'string') return null;
  idx++;

  // Optional global WHERE
  let filterQuery: string | undefined;
  if (idx < commands.length && commands[idx].name === 'where') {
    filterQuery = commands[idx].args.length > 0 ? printExpr(commands[idx].args[0]) : undefined;
    idx++;
  }

  // STATS (required)
  if (idx >= commands.length || commands[idx].name !== 'stats') return null;
  const statsResult = parseStatsCommand(commands[idx]);
  if (!statsResult) return null;
  idx++;

  // Optional EVAL commands (the trailing `EVAL severity = ...` is parsed separately below)
  const evaluations: EvaluationDefinition[] = [];
  while (idx < commands.length && commands[idx].name === 'eval') {
    if (isSeverityEval(commands[idx])) break;
    const ev = parseEvalCommand(commands[idx]);
    if (!ev) return null;
    evaluations.push(ev);
    idx++;
  }

  // Optional alert conditions WHERE (must be last command)
  let alertConditions: AlertCondition[] = [
    { id: generateId(), metric: '', comparator: Comparator.GT, threshold: [100] },
  ];
  let conditionOperator: ConditionOperator = 'AND';

  if (idx < commands.length && commands[idx].name === 'where') {
    const condResult = parseAlertConditions(commands[idx]);
    if (!condResult) return null;
    alertConditions = condResult.conditions;
    conditionOperator = condResult.operator;
    idx++;
  }

  // Optional trailing EVAL severity = ... (emitted after the breach WHERE)
  let severity: SeverityConfig | undefined;
  if (idx < commands.length && isSeverityEval(commands[idx])) {
    const parsedSeverity = parseSeverityEval(commands[idx], alertConditions);
    if (!parsedSeverity) return null;
    severity = parsedSeverity;
    idx++;
  }

  // If there are remaining unparsed commands, the query doesn't match our structure
  if (idx !== commands.length) return null;

  let recovery: RecoveryConfig | undefined;
  if (recoveryQuery?.trim()) {
    const block = extractRecoveryBlock(recoveryQuery);
    if (block) {
      const parsed = parseRecoveryBlock(block);
      if (parsed) {
        recovery = {
          conditions: parsed.conditions,
          conditionOperator: parsed.conditionOperator,
        };
      }
    }
  }

  return {
    indexPattern,
    timeField: '@timestamp',
    filterQuery,
    stats: statsResult.stats,
    evaluations,
    alertConditions,
    conditionOperator,
    groupByFields: statsResult.groupByFields,
    ...(recovery ? { recovery } : {}),
    ...(severity ? { severity } : {}),
  };
};

/**
 * Best-effort parser for Discover ES|QL queries that may not match the full
 * threshold builder structure. Falls back through increasingly loose extraction:
 *
 * 1. `parseThresholdEsql` — full builder state for complete threshold queries
 * 2. Loose FROM + WHERE extraction — index pattern and optional pre-STATS filter
 * 3. `null` — nothing extractable (invalid ES|QL, no FROM, etc.)
 */
export const parseDiscoverQueryForBuilder = (query: string): ThresholdFormValues | null => {
  const full = parseThresholdEsql(query);
  if (full) {
    return {
      ...full,
      alertConditions: reconcileAlertConditionMetrics(
        full.alertConditions,
        full.stats,
        full.evaluations
      ),
    };
  }

  if (!query.trim()) return null;

  const { root, errors } = Parser.parse(query);
  if (errors.length > 0) return null;

  const commands = root.commands;
  if (commands.length === 0) return null;

  const fromCmd = commands[0];
  if (fromCmd.name !== 'from') return null;

  const sourceArg = fromCmd.args.find((a) => isSource(a as ESQLSingleAstItem));
  if (!sourceArg) return null;
  const indexPattern = (sourceArg as ESQLSingleAstItem & { name: string }).name;
  if (!indexPattern || typeof indexPattern !== 'string') return null;

  let filterQuery: string | undefined;
  if (commands.length > 1 && commands[1].name === 'where') {
    filterQuery = commands[1].args.length > 0 ? printExpr(commands[1].args[0]) : undefined;
  }

  return {
    ...DEFAULT_THRESHOLD_FORM_VALUES,
    indexPattern,
    filterQuery,
    stats: DEFAULT_THRESHOLD_FORM_VALUES.stats.map((s) => ({ ...s, id: generateId() })),
    evaluations: [],
    alertConditions: DEFAULT_THRESHOLD_FORM_VALUES.alertConditions.map((c) => ({
      ...c,
      id: generateId(),
    })),
    groupByFields: [],
  };
};
