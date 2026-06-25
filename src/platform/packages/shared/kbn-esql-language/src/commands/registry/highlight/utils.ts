/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ESQLAstHighlightCommand } from '@elastic/esql/types';
import { isMap, isOptionNode } from '@elastic/esql';

export enum CaretPosition {
  HIGHLIGHT_KEYWORD, // After HIGHLIGHT: suggest query text
  ON_KEYWORD, // After query text: suggest ON keyword
  ON_EXPRESSION, // After ON: suggest field list (comma + more fields handled by suggestFieldsList)
  AFTER_WITH_KEYWORD, // After WITH but before opening brace: suggest map opener
  WITHIN_MAP_EXPRESSION, // Within WITH { ... }: suggest map parameters
  AFTER_COMMAND, // Command is complete: suggest pipe
}

export function getPosition(
  command: ESQLAstHighlightCommand,
  cursorPosition: number
): CaretPosition {
  const { queryText, namedParameters } = command;

  if (namedParameters !== undefined) {
    const map = isMap(namedParameters) ? namedParameters : undefined;
    if (!map || (map.incomplete && !map.text)) return CaretPosition.AFTER_WITH_KEYWORD;

    const isWithinMap = map.incomplete
      ? !(map.text.trimEnd().endsWith('}') && cursorPosition > map.location.max)
      : cursorPosition <= map.location.max;

    if (!isWithinMap) return CaretPosition.AFTER_COMMAND;

    return CaretPosition.WITHIN_MAP_EXPRESSION;
  }

  const hasOnOption = command.args.some(
    (arg) => isOptionNode(arg) && arg.name.toLowerCase() === 'on'
  );

  if (hasOnOption) {
    return CaretPosition.ON_EXPRESSION;
  }

  if (queryText && !queryText.incomplete) {
    return CaretPosition.ON_KEYWORD;
  }

  return CaretPosition.HIGHLIGHT_KEYWORD;
}
