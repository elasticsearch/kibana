/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLAstCommand } from '@elastic/esql/types';
import { Builder, Parser } from '@elastic/esql';
import {
  esqlCommandRegistry,
  unwrapExpressionParens,
  type ESQLCommandSummary,
} from '@kbn/esql-language';
import type { FieldSummary } from '@kbn/esql-language/src/commands/registry/types';

function processCommand(
  command: ESQLAstCommand,
  query: string,
  targetSets: {
    newColumns: Set<string>;
    renamedColumnsPairs: Set<[string, string]>;
    metadataColumns: Set<string>;
    aggregates: Set<FieldSummary>;
    grouping: Set<FieldSummary>;
  }
): void {
  const commandDef = esqlCommandRegistry.getCommandByName(command.name);

  if (commandDef?.methods.summary) {
    const summary = commandDef.methods.summary(command, query);

    if (summary.newColumns) {
      summary.newColumns.forEach((col) => targetSets.newColumns.add(col));
    }

    if (summary.renamedColumnsPairs) {
      summary.renamedColumnsPairs.forEach((pair) => targetSets.renamedColumnsPairs.add(pair));
    }

    if (summary.metadataColumns) {
      summary.metadataColumns.forEach((col) => targetSets.metadataColumns.add(col));
    }

    if (summary.aggregates) {
      summary.aggregates.forEach((aggregate) => targetSets.aggregates.add(aggregate));
    }

    if (summary.grouping) {
      summary.grouping.forEach((group) => targetSets.grouping.add(group));
    }
  }
}

/**
 * Analyzes the provided ES|QL query and returns a summary of new columns,
 * renamed columns, and metadata columns introduced by the commands in the query.
 * @param query The ES|QL query string to analyze.
 * @returns An object containing sets of new columns, renamed column pairs, metadata columns, aggregates, and grouping.
 */
export function getQuerySummary(query: string): ESQLCommandSummary {
  const { root } = Parser.parse(query);
  unwrapExpressionParens(root);

  const allNewColumns = new Set<string>();
  const allRenamedColumnsPairs = new Set<[string, string]>();
  const allMetadataColumns = new Set<string>();
  const allAggregates = new Set<FieldSummary>();
  const allGroupings = new Set<FieldSummary>();

  for (const command of root.commands) {
    processCommand(command, query, {
      newColumns: allNewColumns,
      renamedColumnsPairs: allRenamedColumnsPairs,
      metadataColumns: allMetadataColumns,
      aggregates: allAggregates,
      grouping: allGroupings,
    });
  }

  return {
    newColumns: allNewColumns,
    renamedColumnsPairs: allRenamedColumnsPairs,
    metadataColumns: allMetadataColumns,
    aggregates: allAggregates,
    grouping: allGroupings,
  };
}

/**
 * Returns an array of summaries, one for each command of the specified type.
 * If there are multiple commands of the same type, each will have its own summary in the array.
 */
export function getQuerySummaryPerCommandType(
  query: string,
  commandType: string
): ESQLCommandSummary[] {
  const { root } = Parser.parseQuery(query);
  unwrapExpressionParens(root);
  const summaries: ESQLCommandSummary[] = [];

  for (const command of root.commands) {
    if (command.name !== commandType) {
      continue;
    }

    const allNewColumns = new Set<string>();
    const allRenamedColumnsPairs = new Set<[string, string]>();
    const allMetadataColumns = new Set<string>();
    const allAggregates = new Set<FieldSummary>();
    const allGroupings = new Set<FieldSummary>();

    processCommand(command, query, {
      newColumns: allNewColumns,
      renamedColumnsPairs: allRenamedColumnsPairs,
      metadataColumns: allMetadataColumns,
      aggregates: allAggregates,
      grouping: allGroupings,
    });

    summaries.push({
      newColumns: allNewColumns,
      renamedColumnsPairs: allRenamedColumnsPairs,
      metadataColumns: allMetadataColumns,
      aggregates: allAggregates,
      grouping: allGroupings,
    });
  }

  return summaries;
}

/**
 * Analyzes a specific command within an ES|QL query and returns a summary of it.
 */
export function getSummaryPerCommand(query: string, command: ESQLAstCommand): ESQLCommandSummary {
  // unwrapExpressionParens mutates its input. This command belongs to the caller's AST,
  // so clone it and wrap it in a real query node;
  const normalizedRoot = Builder.expression.query([structuredClone(command)]);
  unwrapExpressionParens(normalizedRoot);
  const [normalizedCommand] = normalizedRoot.commands;
  const allNewColumns = new Set<string>();
  const allRenamedColumnsPairs = new Set<[string, string]>();
  const allMetadataColumns = new Set<string>();
  const allAggregates = new Set<FieldSummary>();
  const allGroupings = new Set<FieldSummary>();

  processCommand(normalizedCommand, query, {
    newColumns: allNewColumns,
    renamedColumnsPairs: allRenamedColumnsPairs,
    metadataColumns: allMetadataColumns,
    aggregates: allAggregates,
    grouping: allGroupings,
  });

  return {
    newColumns: allNewColumns,
    renamedColumnsPairs: allRenamedColumnsPairs,
    metadataColumns: allMetadataColumns,
    aggregates: allAggregates,
    grouping: allGroupings,
  };
}

/**
 * Checks if a given field name is a computed column (generated by the ES|QL query),
 * excluding original index fields.
 * @param fieldName The name of the field to check.
 * @param summary The ES|QL query summary.
 * @returns True if the field is computed by the query (not from index), false otherwise.
 */
export function isComputedColumn(fieldName: string, summary: ESQLCommandSummary): boolean {
  return summary.newColumns.has(fieldName) || Boolean(summary.metadataColumns?.has(fieldName));
}
