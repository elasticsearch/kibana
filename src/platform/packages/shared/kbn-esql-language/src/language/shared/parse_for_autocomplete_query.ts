/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Parser, PromQLParser } from '@elastic/esql';
import type { PromQLAstQueryExpression } from '@elastic/esql';
import type { ESQLAstQueryExpression } from '@elastic/esql/types';
import {
  correctPromqlQuerySyntax,
  correctQuerySyntax,
  findAstPosition,
  removeAutocompleteMarkers,
} from '../../commands/definitions/utils/ast';
import { getCursorContext } from './get_cursor_context';
import { getEsqlLexerTokens, type EsqlLexerToken } from './lexer_scope';

interface ParsedAutocompleteQuery {
  innerText: string;
  root: ESQLAstQueryExpression;
  tokens: EsqlLexerToken[];
}

/**
 * Parses the query up to the cursor for autocomplete.
 * It fixes incomplete input before parsing and returns AST data built from the corrected text.
 */
export function parseAutocompleteQuery(fullText: string, offset: number): ParsedAutocompleteQuery {
  const innerText = fullText.substring(0, offset);
  // Keep tokens tied to the real editor text; correctedQuery can add synthetic markers/brackets.
  const tokens = getEsqlLexerTokens(innerText);
  const correctedQuery = correctQuerySyntax(innerText);
  const { root } = Parser.parse(correctedQuery, { withFormatting: true });
  const cleanRoot = removeAutocompleteMarkers(root);

  return {
    innerText,
    root: cleanRoot,
    tokens,
  };
}

/**
 * PromQL counterpart of {@link parseAutocompleteQuery}: corrects partial PromQL syntax,
 * parses it, and strips autocomplete markers from the resulting AST.
 */
export function parsePromqlAutocompleteQuery(query: string): {
  correctedQuery: string;
  root: PromQLAstQueryExpression;
} {
  const correctedQuery = correctPromqlQuerySyntax(query);
  const { root } = PromQLParser.parse(correctedQuery);

  return {
    correctedQuery,
    root: removeAutocompleteMarkers(root),
  };
}

/** Parses the query and resolves the cursor context (command, option, node). */
export function getAutocompleteCursorContext(fullText: string, offset: number) {
  const parsed = parseAutocompleteQuery(fullText, offset);

  return {
    ...parsed,
    astContext: getCursorContext(parsed.innerText, parsed.root, offset),
  };
}

/** Parses the query and locates the AST node at the cursor position. */
export function findAutocompleteAstPosition(fullText: string, offset: number) {
  const parsed = parseAutocompleteQuery(fullText, offset);

  return {
    ...parsed,
    ...findAstPosition(parsed.root, offset),
  };
}
