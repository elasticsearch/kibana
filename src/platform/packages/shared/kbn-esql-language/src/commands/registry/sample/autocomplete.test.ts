/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext } from '../../../__tests__/commands/context_fixtures';
import { autocomplete } from './autocomplete';
import { expectSuggestions } from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';

const sampleExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'sample',
    mockCallbacks,
    autocomplete
  );
};

describe('SAMPLE Autocomplete', () => {
  test('suggests percentages', async () => {
    sampleExpectSuggestions('from a | SAMPLE ', ['.1 ', '.01 ', '.001 ']);
  });

  test('suggests pipe after number', async () => {
    sampleExpectSuggestions('from a | SAMPLE .48 ', ['| ', '\n']);
  });
});
