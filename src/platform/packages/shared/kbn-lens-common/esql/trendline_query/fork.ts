/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  BasicPrettyPrinter,
  Walker,
  isOptionNode,
  isFunctionExpression,
  isAssignment,
  isColumn,
  isParens,
  isQuery,
} from '@elastic/esql';
import type { ESQLCommand, ESQLProperNode, ESQLSingleAstItem } from '@elastic/esql/types';
import { resolveTrackedColumn } from './scope_walker';

/** Synthetic discriminator column added by FORK to its merged output. */
const FORK_DISCRIMINATOR_COLUMN = '_fork';

/** Returns the command lists of each FORK branch (subqueries in parens). */
const getForkBranches = (forkCommand: ESQLCommand): ESQLCommand[][] =>
  forkCommand.args
    .filter(isParens)
    .map((paren) =>
      isQuery(paren.child)
        ? paren.child.commands.filter((c): c is ESQLCommand => c.type === 'command')
        : []
    );

/**
 * Returns true when the command list contains a STATS command, including
 * STATS commands nested inside FORK branches.
 */
export const commandsHaveStats = (commands: ESQLCommand[]): boolean =>
  commands.some(
    (command) =>
      command.name === 'stats' ||
      (command.name === 'fork' && getForkBranches(command).some(commandsHaveStats))
  );

/** Returns the result column names produced by a STATS command's aggregations. */
const getStatsResultColumns = (statsCommand: ESQLCommand): string[] => {
  const columns: string[] = [];
  for (const arg of statsCommand.args) {
    if (Array.isArray(arg) || isOptionNode(arg)) continue;
    if (isAssignment(arg) && isColumn(arg.args[0])) {
      columns.push(arg.args[0].name);
    } else if (isFunctionExpression(arg) || isColumn(arg)) {
      columns.push(BasicPrettyPrinter.expression(arg));
    }
  }
  return columns;
};

/**
 * Returns true when the branch's output scope contains the given column:
 * the last STATS command produces it (directly or via an alias) and it
 * survives renames in the rest of the branch.
 */
const branchProducesColumn = (branch: ESQLCommand[], columnName: string): boolean => {
  const statsIndex = branch.findLastIndex((command) => command.name === 'stats');
  if (statsIndex === -1) return false;

  const producedColumns = getStatsResultColumns(branch[statsIndex]);
  const commandsAfterStats = branch.slice(statsIndex + 1);
  return producedColumns.some(
    (column) => resolveTrackedColumn(commandsAfterStats, column).name === columnName
  );
};

/**
 * Selects the FORK branch to derive the trendline from: the first branch whose
 * output scope contains one of the requested metric columns, otherwise the
 * first branch containing a STATS command, otherwise the first branch.
 */
const selectForkBranch = (
  branches: ESQLCommand[][],
  metricFields?: string[]
): ESQLCommand[] | undefined => {
  if (metricFields && metricFields.length > 0) {
    const match = branches.find((branch) =>
      metricFields.some((field) => branchProducesColumn(branch, field))
    );
    if (match) return match;
  }
  return branches.find((branch) => branch.some((c) => c.name === 'stats')) ?? branches[0];
};

/** Returns true when any expression in the node references `_fork`. */
const referencesForkDiscriminator = (node: ESQLProperNode): boolean => {
  let found = false;
  Walker.walk(node, {
    visitColumn: (column) => {
      if (column.name === FORK_DISCRIMINATOR_COLUMN) found = true;
    },
  });
  return found;
};

/**
 * Removes `_fork` sub-predicates from a WHERE expression. Conjuncts (AND)
 * referencing `_fork` are dropped while the remaining side is kept; any other
 * expression referencing `_fork` (comparison, OR, NOT, ...) cannot be pruned
 * without changing semantics, so `undefined` is returned to drop it entirely.
 */
const pruneForkPredicate = (node: ESQLSingleAstItem): ESQLSingleAstItem | undefined => {
  if (!referencesForkDiscriminator(node)) return node;
  if (isFunctionExpression(node) && node.name === 'and') {
    const [left, right] = node.args;
    const prunedLeft = Array.isArray(left) ? undefined : pruneForkPredicate(left);
    const prunedRight = Array.isArray(right) ? undefined : pruneForkPredicate(right);
    if (prunedLeft && prunedRight) {
      node.args = [prunedLeft, prunedRight];
      return node;
    }
    return prunedLeft ?? prunedRight;
  }
  return undefined;
};

/**
 * Removes references to the synthetic `_fork` column from commands following
 * an inlined FORK branch; after flattening the column no longer exists.
 *
 * - WHERE `_fork` sub-predicates under AND are pruned; predicates where the
 *   `_fork` reference cannot be isolated (e.g. under OR) drop the whole WHERE
 * - KEEP / DROP / SORT entries naming `_fork` are removed; commands left with
 *   no arguments are dropped
 * - RENAME pairs involving `_fork` are removed; empty RENAMEs are dropped
 * - other commands are left untouched
 */
const removeForkDiscriminatorReferences = (commands: ESQLCommand[], fromIndex: number): void => {
  // Caveat: a `WHERE _fork == "forkN"` conjunct is dropped even when it pinned
  // a different branch than the metric-driven selection; the metric column's
  // lineage wins over the user's discriminator filter for trendline purposes.
  for (let i = commands.length - 1; i >= fromIndex; i--) {
    const command = commands[i];
    if (!referencesForkDiscriminator(command)) continue;

    switch (command.name) {
      case 'where': {
        const [predicate] = command.args;
        const pruned = Array.isArray(predicate)
          ? undefined
          : pruneForkPredicate(predicate as ESQLSingleAstItem);
        if (pruned) {
          command.args = [pruned];
        } else {
          commands.splice(i, 1);
        }
        break;
      }
      case 'keep':
      case 'drop':
      case 'sort':
        // SORT entries with a direction or nulls modifier (e.g. `_fork DESC`)
        // are order nodes wrapping the column, not bare columns
        command.args = command.args.filter((arg) => {
          const column =
            !Array.isArray(arg) && arg.type === 'order' && isColumn(arg.args[0])
              ? arg.args[0]
              : arg;
          return !(isColumn(column) && column.name === FORK_DISCRIMINATOR_COLUMN);
        });
        if (command.args.length === 0) commands.splice(i, 1);
        break;
      case 'rename':
        command.args = command.args.filter((arg) => {
          if (Array.isArray(arg) || !isFunctionExpression(arg)) return true;
          return !arg.args.some(
            (side) =>
              !Array.isArray(side) && isColumn(side) && side.name === FORK_DISCRIMINATOR_COLUMN
          );
        });
        if (command.args.length === 0) commands.splice(i, 1);
        break;
      default:
        // conservative: leave unknown command shapes untouched
        break;
    }
  }
};

/**
 * Replaces FORK commands with the commands of a single selected branch so the
 * trendline rewrite operates on source columns that are in scope. After FORK,
 * only branch output columns (plus the synthetic `_fork` discriminator) are
 * available, so time bucketing cannot be appended to the whole query; instead
 * the branch whose output scope contains the metric column is inlined.
 *
 * Mutates `commands` in place. Runs until no FORK remains, so branches that
 * themselves contain FORK (and any residual FORKs) are also flattened.
 */
export const flattenForkCommands = (commands: ESQLCommand[], metricFields?: string[]): void => {
  // single forward pass: flattening never introduces a FORK before the splice
  // point, so earlier commands need no rescan
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].name !== 'fork') continue;
    const branch = selectForkBranch(getForkBranches(commands[i]), metricFields) ?? [];
    commands.splice(i, 1, ...branch);
    removeForkDiscriminatorReferences(commands, i + branch.length);
    i--; // re-check current index: inlined branch may itself start with FORK
  }
};
