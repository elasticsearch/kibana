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
import {
  expectSuggestions,
  getFunctionSignaturesByReturnType,
} from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { Location } from '../types';

const rowExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(query, expectedSuggestions, context, 'row', mockCallbacks, autocomplete);
};

describe('ROW Autocomplete', () => {
  const functions = getFunctionSignaturesByReturnType(Location.ROW, 'any', { scalar: true });
  it('suggests functions and an assignment for new expressions', async () => {
    const expectedSuggestions = [' = ', ...functions];

    await rowExpectSuggestions('ROW ', expectedSuggestions);
    await rowExpectSuggestions('ROW foo = "bar", ', expectedSuggestions);
  });

  it('suggests only functions after an assignment', async () => {
    await rowExpectSuggestions('ROW col0 = ', functions);
  });

  it('suggests a comma and a pipe after a complete expression', async () => {
    const expected = [', ', '| ', '\n'];

    await rowExpectSuggestions('ROW col0 = 23 ', expected);
    await rowExpectSuggestions('ROW ABS(23) ', expected);
    await rowExpectSuggestions('ROW ABS(23), col0=234 ', expected);
  });
});
