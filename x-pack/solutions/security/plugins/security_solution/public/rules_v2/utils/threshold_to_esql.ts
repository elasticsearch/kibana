/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  Builder,
  BasicPrettyPrinter,
  Parser,
  isFunctionExpression,
  isColumn,
  isSource,
  isOptionNode,
} from '@elastic/esql';
import type {
  ESQLSingleAstItem,
  ESQLCommand,
  ESQLFunction,
  ESQLAstItem,
} from '@elastic/esql/types';

export interface ThresholdConfig {
  indexPatterns: string[];
  thresholdFields: string[];
  thresholdValue: number;
  cardinalityField?: string;
  cardinalityValue?: number;
  filterQuery?: string;
  filterLanguage?: 'kuery';
}

export interface ParsedThresholdConfig {
  indexPatterns: string[];
  thresholdFields: string[];
  thresholdValue: number;
  cardinalityField?: string;
  cardinalityValue?: number;
  filterQuery?: string;
}

const escapeField = (field: string): string =>
  /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field) ? field : `\`${field}\``;

const parseFragment = (src: string): ESQLSingleAstItem | null => {
  try {
    const { root, errors } = Parser.parse(`ROW x = 1 | WHERE ${src}`);
    if (errors.length > 0) return null;
    const whereCmd = root.commands.find((c) => c.name === 'where');
    if (whereCmd && whereCmd.args.length > 0) {
      return whereCmd.args[0] as ESQLSingleAstItem;
    }
  } catch {
    /* malformed expression */
  }
  return null;
};

const parseStatsCommand = (statsFields: string[], groupByFields: string[]): ESQLSingleAstItem[] => {
  const groupBy =
    groupByFields.length > 0 ? ` BY ${groupByFields.map(escapeField).join(', ')}` : '';
  const src = `ROW x = 1 | STATS ${statsFields.join(', ')}${groupBy}`;
  const { root } = Parser.parse(src);
  const statsCmd = root.commands.find((c) => c.name === 'stats');
  return statsCmd ? (statsCmd.args as ESQLSingleAstItem[]) : [];
};

/**
 * Converts a threshold rule configuration into an ES|QL query string
 * using the @elastic/esql AST builder for robust, structured output.
 */
export const buildThresholdEsqlQuery = (config: ThresholdConfig): string => {
  const {
    indexPatterns,
    thresholdFields,
    thresholdValue,
    cardinalityField,
    cardinalityValue,
    filterQuery,
    filterLanguage,
  } = config;

  if (indexPatterns.length === 0) {
    throw new Error(
      'Cannot build threshold ES|QL query: no index patterns specified. ' +
        'Rules that use only a data view without explicit index patterns cannot be converted.'
    );
  }

  const commands = [];

  // FROM
  commands.push(
    Builder.command({
      name: 'from',
      args: indexPatterns.map((idx) => Builder.expression.source.index(idx)),
    })
  );

  // WHERE (user-supplied global filter)
  if (filterQuery?.trim()) {
    if (filterLanguage === 'kuery') {
      const escaped = filterQuery.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const kqlAst = parseFragment(`KQL("${escaped}")`);
      if (kqlAst) {
        commands.push(Builder.command({ name: 'where', args: [kqlAst] }));
      }
    } else {
      const filterAst = parseFragment(filterQuery.trim());
      if (filterAst) {
        commands.push(Builder.command({ name: 'where', args: [filterAst] }));
      }
    }
  }

  // WHERE (null filter for group-by fields)
  if (thresholdFields.length > 0) {
    const nullChecks = thresholdFields.map((f) => `${escapeField(f)} IS NOT NULL`);
    const nullFilterAst = parseFragment(nullChecks.join(' AND '));
    if (nullFilterAst) {
      commands.push(Builder.command({ name: 'where', args: [nullFilterAst] }));
    }
  }

  // STATS
  const statsAssignments: string[] = ['threshold.count = COUNT(*)'];
  if (cardinalityField && cardinalityValue != null) {
    statsAssignments.push(
      `threshold.cardinality = COUNT_DISTINCT(${escapeField(cardinalityField)})`
    );
  }
  const statsArgs = parseStatsCommand(statsAssignments, thresholdFields);
  commands.push(Builder.command({ name: 'stats', args: statsArgs }));

  // WHERE (threshold condition)
  const thresholdAst = parseFragment(`threshold.count >= ${thresholdValue}`);
  if (thresholdAst) {
    commands.push(Builder.command({ name: 'where', args: [thresholdAst] }));
  }

  // WHERE (cardinality condition)
  if (cardinalityField && cardinalityValue != null) {
    const cardAst = parseFragment(`threshold.cardinality >= ${cardinalityValue}`);
    if (cardAst) {
      commands.push(Builder.command({ name: 'where', args: [cardAst] }));
    }
  }

  const root = Builder.expression.query(commands);
  return BasicPrettyPrinter.multiline(root, { pipeTab: '' });
};

// --- Parsing helpers ---

const getColumnName = (node: ESQLAstItem): string | null => {
  if (isColumn(node)) return node.name;
  return null;
};

const printExpr = (node: ESQLAstItem): string =>
  BasicPrettyPrinter.expression(node as ESQLSingleAstItem);

const isNullFilterWhere = (cmd: ESQLCommand): boolean => {
  const printed = cmd.args.map(printExpr).join(' ');
  return printed.includes('IS NOT NULL');
};

const isThresholdConditionWhere = (cmd: ESQLCommand): boolean => {
  const printed = cmd.args.map(printExpr).join(' ');
  return printed.includes('threshold.count') || printed.includes('threshold.cardinality');
};

const extractComparison = (fn: ESQLFunction, metricPrefix: string): number | null => {
  if (!['>=', '>', '<=', '<'].includes(fn.name)) return null;
  const left = getColumnName(fn.args[0] as ESQLAstItem);
  if (!left?.startsWith(metricPrefix)) return null;
  const rightNode = fn.args[1] as ESQLSingleAstItem;
  if ('value' in rightNode && typeof rightNode.value === 'number') {
    return rightNode.value;
  }
  const parsed = Number(printExpr(rightNode));
  return isNaN(parsed) ? null : parsed;
};

const extractCardinalityFieldFromStats = (statsCmd: ESQLCommand): string | undefined => {
  for (const arg of statsCmd.args) {
    const printed = printExpr(arg);
    const match = printed.match(/COUNT_DISTINCT\((.+?)\)/i);
    if (match) {
      const field = match[1].trim();
      return field.startsWith('`') && field.endsWith('`') ? field.slice(1, -1) : field;
    }
  }
  return undefined;
};

const extractGroupByFields = (statsCmd: ESQLCommand): string[] => {
  for (const arg of statsCmd.args) {
    if (isOptionNode(arg) && arg.name === 'by') {
      return arg.args
        .map((a) => getColumnName(a as ESQLAstItem))
        .filter((n): n is string => n != null);
    }
  }
  return [];
};

/**
 * Parses a threshold ES|QL query back into its constituent configuration
 * values using the @elastic/esql AST parser.
 *
 * Returns `null` if the query cannot be parsed.
 */
export const parseThresholdEsqlQuery = (query: string): ParsedThresholdConfig | null => {
  let root;
  try {
    const result = Parser.parse(query);
    if (result.errors.length > 0) return null;
    root = result.root;
  } catch {
    return null;
  }

  let indexPatterns: string[] = [];
  let thresholdFields: string[] = [];
  let thresholdValue = 200;
  let cardinalityField: string | undefined;
  let cardinalityValue: number | undefined;
  let filterQuery: string | undefined;

  for (const cmd of root.commands) {
    switch (cmd.name) {
      case 'from':
        indexPatterns = cmd.args
          .filter((a) => isSource(a as ESQLSingleAstItem))
          .map((a) => (a as ESQLSingleAstItem & { name: string }).name);
        break;

      case 'stats':
        thresholdFields = extractGroupByFields(cmd);
        cardinalityField = extractCardinalityFieldFromStats(cmd);
        break;

      case 'where':
        if (isNullFilterWhere(cmd)) {
          // skip null filter WHERE — it's derived from group-by fields
        } else if (isThresholdConditionWhere(cmd)) {
          for (const arg of cmd.args) {
            if (isFunctionExpression(arg as ESQLSingleAstItem)) {
              const fn = arg as ESQLFunction;
              const countVal = extractComparison(fn, 'threshold.count');
              if (countVal != null) {
                thresholdValue = countVal;
              }
              const cardVal = extractComparison(fn, 'threshold.cardinality');
              if (cardVal != null) {
                cardinalityValue = cardVal;
              }
            }
          }
        } else {
          filterQuery = cmd.args.map(printExpr).join(' AND ');
        }
        break;
    }
  }

  return {
    indexPatterns,
    thresholdFields,
    thresholdValue,
    cardinalityField,
    cardinalityValue,
    ...(filterQuery ? { filterQuery } : {}),
  };
};
