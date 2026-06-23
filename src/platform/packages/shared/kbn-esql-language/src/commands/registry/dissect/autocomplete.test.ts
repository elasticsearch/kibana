/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext, getMockCallbacks } from '../../../__tests__/commands/context_fixtures';
import { autocomplete } from './autocomplete';
import {
  expectSuggestions,
  getFieldNamesByType,
  mockFieldsWithTypes,
} from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { ESQL_STRING_TYPES } from '../../definitions/types';

const dissectExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'dissect',
    mockCallbacks,
    autocomplete
  );
};

describe('DISSECT Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;
  beforeEach(() => {
    jest.clearAllMocks();

    mockCallbacks = getMockCallbacks();

    const expectedFields = getFieldNamesByType(ESQL_STRING_TYPES);
    mockFieldsWithTypes(mockCallbacks, expectedFields);
  });

  it('suggests fields after DISSECT', async () => {
    const contextWithoutControls = {
      ...mockContext,
      supportsControls: false,
    };

    const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);

    await dissectExpectSuggestions(
      'from a | DISSECT ',
      expectedStringFields.map((fieldName) => `${fieldName} `),
      mockCallbacks,
      contextWithoutControls
    );

    await dissectExpectSuggestions(
      'from a | DISSECT key/',
      expectedStringFields.map((fieldName) => `${fieldName} `),
      mockCallbacks,
      contextWithoutControls
    );
  });

  const constantPattern = '"%{firstWord}" ';
  it('suggests a pattern after a field name', async () => {
    await dissectExpectSuggestions('from a | DISSECT keywordField ', [constantPattern]);
  });

  it('suggests an append separator or pipe after a pattern', async () => {
    dissectExpectSuggestions(`from a | DISSECT keywordField ${constantPattern} /`, [
      'APPEND_SEPARATOR = ',
      '| ',
      '\n',
    ]);
    dissectExpectSuggestions(`from a | DISSECT keywordField ${constantPattern} /`, [
      'APPEND_SEPARATOR = ',
      '| ',
      '\n',
    ]);
  });

  it('suggests append separators', async () => {
    await dissectExpectSuggestions(
      `from a | DISSECT keywordField ${constantPattern} append_separator = `,
      ['":" ', '";" ']
    );
  });

  it('suggests a pipe after an append separator', async () => {
    await dissectExpectSuggestions(
      `from a | DISSECT keywordField ${constantPattern} append_separator = ":" /`,
      ['| ', '\n']
    );
  });
});
