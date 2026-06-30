/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  ESQLAstRerankCommand,
  ESQLMap,
  ESQLSingleAstItem,
  ESQLAstAllCommands,
  ESQLCommandOption,
} from '@elastic/esql/types';

export interface PositionContext {
  expressionRoot?: ESQLSingleAstItem;
}

export enum CaretPosition {
  RERANK_KEYWORD, // After RERANK: can be target field assignment or query
  RERANK_AFTER_TARGET_FIELD, // After potential target field: suggest assignment operator
  RERANK_AFTER_TARGET_ASSIGNMENT, // After "target_field ="
  ON_KEYWORD, // Should suggest "ON"
  ON_EXPRESSION, // After "ON": handle all field list expressions like EVAL
  AFTER_WITH_KEYWORD, // After "WITH " but before opening brace: suggest opening braces with params
  WITHIN_MAP_EXPRESSION, // After "WITH": suggest a json of params
  AFTER_COMMAND, // Command is complete, suggest pipe
}

/**
 * Determines caret position in RERANK command
 */
export function getPosition(commandText: string, command: ESQLAstAllCommands): CaretPosition {
  const rerankCommand = command as ESQLAstRerankCommand;
  const onArg = rerankCommand.args[1];
  const withArg = rerankCommand.args[2];

  if (withArg && 'type' in withArg && withArg.type === 'option') {
    const withMap = (withArg as ESQLCommandOption).args[0] as ESQLMap | undefined;

    if (!withMap || (withMap.incomplete && !withMap.text)) {
      return CaretPosition.AFTER_WITH_KEYWORD;
    }

    if (withMap.text && withMap.incomplete) {
      return CaretPosition.WITHIN_MAP_EXPRESSION;
    }

    if (!withMap.incomplete) {
      return CaretPosition.AFTER_COMMAND;
    }
  }

  if (onArg) {
    return CaretPosition.ON_EXPRESSION;
  }

  if (!!(rerankCommand.query && !rerankCommand.query.incomplete)) {
    return CaretPosition.ON_KEYWORD;
  }

  // Check targetField (only if query is not complete)
  if (rerankCommand.targetField && !rerankCommand.targetField.incomplete) {
    return CaretPosition.RERANK_AFTER_TARGET_ASSIGNMENT;
  }

  if (isAfterPotentialTargetFieldWithSpace(commandText)) {
    return CaretPosition.RERANK_AFTER_TARGET_FIELD;
  }

  return CaretPosition.RERANK_KEYWORD;
}

export function isAfterPotentialTargetFieldWithSpace(innerText: string): boolean {
  // Pattern: must have at least one non-quote word followed by space
  // !commandText.includes('"') is covered by 'withinQuotes' function in autocomplete.ts
  // However, we keep this extra safety check if it will be accidentally removed
  return innerText.endsWith(' ') && !innerText.includes('"') && /rerank\s+\w+\s+$/i.test(innerText);
}
