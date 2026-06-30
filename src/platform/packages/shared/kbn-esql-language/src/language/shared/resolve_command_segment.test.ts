/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseAutocompleteQuery } from './parse_for_autocomplete_query';
import { resolveCommandSegment } from './resolve_command_segment';

function resolve(queryWithCursor: string) {
  const offset = queryWithCursor.indexOf('^');
  if (offset === -1) {
    throw new Error(`Missing cursor marker in query: ${queryWithCursor}`);
  }

  const fullText = queryWithCursor.replace('^', '');
  const { root, tokens } = parseAutocompleteQuery(fullText, offset);

  return resolveCommandSegment(fullText, offset, root, tokens);
}

function expectCommandCursor(queryWithCursor: string, textBeforeCursor: string) {
  const cursor = resolve(queryWithCursor);

  expect(cursor.text).toBe(textBeforeCursor);
  expect(cursor.end - cursor.start).toBe(textBeforeCursor.length);
}

describe('resolveCommandSegment', () => {
  it('resolves an empty command text at the beginning of the query', () => {
    expectCommandCursor('^FROM a', '');
  });

  it('resolves command text in the initial command', () => {
    expectCommandCursor('FROM ^', 'FROM ');
  });

  it('resolves command text before cursor for a top-level command', () => {
    expectCommandCursor('FROM a | SORT field^ | LIMIT 10', 'SORT field');
  });

  it('resolves an empty command after a pipe', () => {
    expectCommandCursor('FROM a | ^', '');
  });

  it('resolves an empty command after a pipe without trailing whitespace', () => {
    expectCommandCursor('FROM a |^', '');
  });

  it('resolves multi-token command text', () => {
    expectCommandCursor('FROM a | INLINE STATS count = COUNT(^)', 'INLINE STATS count = COUNT(');
  });

  it('resolves command text inside a fork branch', () => {
    expectCommandCursor('FROM a | FORK (STATS AVG(field) | SORT ^) (WHERE x == 1)', 'SORT ');
  });

  it('resolves command text inside a fork branch without an in-branch pipe', () => {
    expectCommandCursor('FROM a | FORK (LIMIT 1) (SORT ^)', 'SORT ');
  });

  it('resolves an empty command inside a fork branch after a pipe', () => {
    expectCommandCursor('FROM a | FORK (STATS AVG(field) | ^) (WHERE x == 1)', '');
  });

  it('resolves command text inside a subquery', () => {
    expectCommandCursor('FROM a, (FROM b | WHERE ^) | LIMIT 10', 'WHERE ');
  });

  it('resolves command text inside a fork branch nested in a subquery', () => {
    expectCommandCursor('FROM a, (FROM b | FORK (WHERE x > 0 | SORT ^) (LIMIT 1))', 'SORT ');
  });

  it('resolves command text inside a subquery nested in a fork branch', () => {
    expectCommandCursor('FROM a | FORK (WHERE field IN (FROM b | WHERE ^)) (LIMIT 1)', 'WHERE ');
  });

  it.each([
    ['double quoted string', 'FROM a | EVAL x = "a|b" | STATS ^'],
    ['backtick identifier', 'FROM a | EVAL `a|b` = 1 | STATS ^'],
    ['triple quoted string', 'FROM a | EVAL x = """a|b""" | STATS ^'],
    ['block comment', 'FROM a | EVAL x = 1 /* | */ | STATS ^'],
    ['single-line comment', 'FROM a | EVAL x = 1 // | comment\n| STATS ^'],
  ])('ignores pipes inside %s', (_, query) => {
    expectCommandCursor(query, 'STATS ');
  });

  it('keeps pipes inside ENRICH quoted identifiers command-local', () => {
    expectCommandCursor(
      'FROM a | ENRICH policy WITH `a|b` = field^',
      'ENRICH policy WITH `a|b` = field'
    );
  });

  it('keeps pipes inside ENRICH quoted policy names command-local', () => {
    expectCommandCursor(
      'FROM a | ENRICH "policy|name" WITH field^',
      'ENRICH "policy|name" WITH field'
    );
  });

  it('does not let an earlier ENRICH quoted identifier capture later commands', () => {
    expectCommandCursor('FROM a | ENRICH policy WITH `a|b` = field | STATS ^', 'STATS ');
  });

  it('ignores delimiters after the cursor', () => {
    expectCommandCursor('FROM a | EVAL f(g(^, )', 'EVAL f(g(');
  });

  it('ignores pipes inside an unfinished block comment', () => {
    expectCommandCursor('FROM a | EVAL x = 1 /* comment |^', 'EVAL x = 1 /* comment |');
  });

  it('does not start a new command inside an unfinished block comment', () => {
    expectCommandCursor('FROM a | EVAL x = 1 /* comment | SORT ^', 'EVAL x = 1 /* comment | SORT ');
  });
});
