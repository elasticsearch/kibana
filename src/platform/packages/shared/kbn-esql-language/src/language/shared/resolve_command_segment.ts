/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isSubQuery, Walker } from '@elastic/esql';
import type { ESQLAstQueryExpression } from '@elastic/esql/types';
import { getTokenCommandStart, type EsqlLexerToken } from './lexer_scope';

export interface CommandSegment {
  start: number; // Absolute offset where this command segment starts in the full query.
  end: number; // Absolute offset where this command segment ends, currently the cursor.
  text: string; // fullText.slice(start, end), current command text up to the cursor.
}

/** Returns command-local cursor text without relying on repaired command end locations. */
export function resolveCommandSegment(
  fullText: string,
  offset: number,
  root: ESQLAstQueryExpression,
  tokens: EsqlLexerToken[]
): CommandSegment {
  const commandStart = getTokenCommandStart(fullText, offset, tokens, getQueryParenStarts(root));

  return {
    start: commandStart,
    end: offset,
    text: fullText.slice(commandStart, offset),
  };
}

/** Finds parenthesized query scopes whose inner pipes delimit commands rather than expressions. */
function getQueryParenStarts(root: ESQLAstQueryExpression): Set<number> {
  const starts = new Set<number>();

  Walker.walk(root, {
    visitParens: (node) => {
      const isQueryParens = isSubQuery(node) && Boolean(node.child?.commands?.length);

      if (isQueryParens) {
        starts.add(node.location.min);
      }
    },
  });

  return starts;
}
