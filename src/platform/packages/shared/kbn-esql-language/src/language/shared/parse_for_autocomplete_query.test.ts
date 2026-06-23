/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Walker } from '@elastic/esql';
import type {
  ESQLAstAllCommands,
  ESQLAstItem,
  ESQLAstQueryExpression,
  ESQLSingleAstItem,
} from '@elastic/esql/types';
import { isMarkerNode } from '../../commands/definitions/utils/ast';
import {
  findAutocompleteAstPosition,
  getAutocompleteCursorContext,
  parseAutocompleteQuery,
} from './parse_for_autocomplete_query';

function assertNoMarker(
  node: ESQLSingleAstItem | ESQLAstAllCommands | ESQLAstQueryExpression | undefined,
  query: string,
  label: string
) {
  if (!node) {
    return;
  }

  Walker.walk(node, {
    visitAny(current) {
      if (isMarkerNode(current as ESQLAstItem)) {
        throw new Error(`Marker node found in ${label} for query: ${query}`);
      }
    },
  });
}

describe('getAutocompleteCursorContext', () => {
  const markerInsertionQueries = [
    ['empty source command', 'FROM '],
    ['source command after comma', 'FROM employees, '],
    ['empty timeseries source command', 'TS '],
    ['timeseries source command after comma', 'TS timeseries_index, '],
    ['row assignment', 'ROW total = '],
    ['eval assignment', 'FROM employees | EVAL total = '],
    ['inline cast type', 'FROM employees | EVAL casted = keywordField::'],
    ['function argument', 'FROM employees | EVAL total = ROUND(salary, '],
    ['where binary expression', 'FROM employees | WHERE age > '],
    ['where list value', 'FROM employees | WHERE age IN (1, '],
    ['stats aggregation after comma', 'FROM employees | STATS total = SUM(salary), '],
    ['stats where predicate', 'FROM employees | STATS MIN(salary) WHERE age > '],
    ['fork branch expression', 'FROM employees | FORK (WHERE age > '],
    ['grok field argument', 'FROM employees | GROK '],
    ['dissect field argument', 'FROM employees | DISSECT '],
    ['rerank on field list', 'FROM employees | RERANK "query" ON keywordField, '],
    ['subquery expression', 'FROM (FROM employees | EVAL total = '],
  ];

  it.each(markerInsertionQueries)(
    'returns marker-free autocomplete parse data for %s',
    (_, query) => {
      const parsed = parseAutocompleteQuery(query, query.length);

      expect(parsed.innerText).toBe(query);
      expect(parsed.tokens.length).toBeGreaterThan(0);
      assertNoMarker(parsed.root, query, 'root');

      const { root, command, node, option, containingFunction } = findAutocompleteAstPosition(
        query,
        query.length
      );

      assertNoMarker(root, query, 'root');
      assertNoMarker(command, query, 'command');
      assertNoMarker(node, query, 'node');
      assertNoMarker(option, query, 'option');
      assertNoMarker(containingFunction, query, 'containingFunction');

      const { astContext } = getAutocompleteCursorContext(query, query.length);

      assertNoMarker(astContext.astForContext, query, 'astForContext');
      assertNoMarker(astContext.command, query, 'command');
      assertNoMarker(astContext.node, query, 'node');
      assertNoMarker(astContext.option, query, 'option');
      assertNoMarker(astContext.containingFunction, query, 'containingFunction');
    }
  );

  it.each([
    'FROM employees | EVAL total = ',
    'ROW total = ',
    'FROM employees | EVAL total = ROUND(salary, ',
    'FROM employees | WHERE age IN (1, ',
  ])('resolves an expression context (not just marker-free) for %s', (query) => {
    const { astContext } = getAutocompleteCursorContext(query, query.length);

    expect(astContext.type).toBe('expression');
  });
});
