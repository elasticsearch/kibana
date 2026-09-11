/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Builder, isFunctionExpression, isColumn } from '@elastic/esql';
import type { ESQLCommand } from '@elastic/esql/types';

/**
 * Minimal single-column dataflow walker over an ES|QL command pipeline.
 *
 * Mirrors the per-command transfer-function structure of the `columnsAfter`
 * registry in `@kbn/esql-language` (which is async and requires ES field
 * callbacks, so it cannot be used synchronously here). Commands without a
 * registered transfer function are treated as schema-preserving.
 */

/** Scope state of a single tracked column while walking pipeline commands. */
export interface TrackedColumnState {
  /** Current column name at this point of the pipeline. */
  name: string;
}

interface TransferContext {
  /** When true, KEEP commands missing the column are extended to retain it. */
  ensureKept: boolean;
}

type CommandTransfer = (
  command: ESQLCommand,
  state: TrackedColumnState,
  context: TransferContext
) => TrackedColumnState;

/**
 * RENAME remaps the tracked column. Handles both `RENAME old AS new` and
 * `RENAME new = old` forms.
 */
const renameTransfer: CommandTransfer = (command, state) => {
  let currentName = state.name;
  for (const arg of command.args) {
    if (Array.isArray(arg) || !isFunctionExpression(arg)) continue;
    const [left, right] = arg.args;
    if (Array.isArray(left) || Array.isArray(right) || !isColumn(left) || !isColumn(right)) {
      continue;
    }
    if (arg.name === 'as' && left.name === currentName) {
      currentName = right.name;
    } else if (arg.name === '=' && right.name === currentName) {
      currentName = left.name;
    }
  }
  return { name: currentName };
};

/**
 * KEEP projects the schema. With `ensureKept`, the tracked column is appended
 * to the projection when missing so it survives the command.
 */
const keepTransfer: CommandTransfer = (command, state, { ensureKept }) => {
  const isListed = command.args.some((arg) => isColumn(arg) && arg.name === state.name);
  if (!isListed && ensureKept) {
    command.args.push(Builder.expression.column(state.name));
  }
  return state;
};

const identityTransfer: CommandTransfer = (_command, state) => state;

const transferFns: Record<string, CommandTransfer> = {
  rename: renameTransfer,
  keep: keepTransfer,
};

/**
 * Folds the tracked column's scope state through the pipeline, applying each
 * command's transfer function in order (RENAME remaps the name, KEEP projects
 * it, all other commands preserve scope). With `ensureKept`, KEEP commands are
 * mutated so the column survives the whole segment.
 */
const walkColumn = (
  commands: ESQLCommand[],
  columnName: string,
  ensureKept: boolean
): TrackedColumnState =>
  commands.reduce<TrackedColumnState>(
    (state, command) =>
      (transferFns[command.name] ?? identityTransfer)(command, state, { ensureKept }),
    { name: columnName }
  );

/**
 * Resolves the final name of a column after walking pipeline commands.
 * Read-only: never mutates the AST.
 */
export const resolveTrackedColumn = (
  commands: ESQLCommand[],
  columnName: string
): TrackedColumnState => walkColumn(commands, columnName, false);

/**
 * Resolves the final name of a column and mutates KEEP commands along the way
 * so the column survives the whole pipeline segment.
 */
export const trackColumnAndEnsureKept = (
  commands: ESQLCommand[],
  columnName: string
): TrackedColumnState => walkColumn(commands, columnName, true);
