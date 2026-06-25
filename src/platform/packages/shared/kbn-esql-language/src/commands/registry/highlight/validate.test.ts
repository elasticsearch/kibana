/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mockContext } from '../../../__tests__/commands/context_fixtures';
import { expectErrors } from '../../../__tests__/commands/validation';
import { validate } from './validate';

const highlightExpectErrors = (query: string, expectedErrors: string[], context = mockContext) => {
  return expectErrors(query, expectedErrors, context, 'highlight', validate);
};

describe('HIGHLIGHT Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // The query text is constrained to a string literal by the grammar, so a non-string query
  // (e.g. `HIGHLIGHT 123`) is a parser syntax error, not a semantic one. validate() never
  // receives the integer, so it reports nothing for these two cases.
  it('does not report a non-string query (handled by the parser as a syntax error)', () => {
    highlightExpectErrors('FROM index | HIGHLIGHT 123', []);
  });

  it('does not report a non-string query and ON field (handled by the parser)', () => {
    highlightExpectErrors('FROM index | HIGHLIGHT 123 ON 456', []);
  });

  it('reports an unknown WITH parameter name', () => {
    highlightExpectErrors('FROM index | HIGHLIGHT 123 ON 456 WITH { "test": 789 }', [
      'Unknown parameter "test".',
    ]);
  });

  it('reports a WITH parameter with a wrong value type', () => {
    highlightExpectErrors('FROM index | HIGHLIGHT "ring" ON textField WITH { "encoder": true }', [
      'Invalid type for parameter "encoder". Expected type: keyword. Received: boolean.',
    ]);
  });

  it('does not report errors for a valid query', () => {
    highlightExpectErrors(
      'FROM index | HIGHLIGHT "ring" ON textField WITH { "encoder": "html" }',
      []
    );
  });
});
