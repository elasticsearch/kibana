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
import { expectSuggestions, getFieldNamesByType } from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';

const renameExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'rename',
    mockCallbacks,
    autocomplete
  );
};

describe('RENAME Autocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suggests fields', async () => {
    const expectedSuggestions = [' = ', ...getFieldNamesByType('any')];
    await renameExpectSuggestions('from a | rename ', expectedSuggestions);
    await renameExpectSuggestions('from a | rename fie', expectedSuggestions);
    await renameExpectSuggestions('from a | rename field AS foo,', [...expectedSuggestions, ' = ']);
    await renameExpectSuggestions('from a | rename field = foo, ', expectedSuggestions);
    await renameExpectSuggestions('from a | rename field AS foo, fie', expectedSuggestions);
    await renameExpectSuggestions('from a | rename field = foo, fie', expectedSuggestions);
  });

  it('suggests AS after an existing field', async () => {
    await renameExpectSuggestions('from a | rename textField ', ['AS ']);
    await renameExpectSuggestions('from a | rename keywordField AS foo, textField ', ['AS ']);
    await renameExpectSuggestions('from a | rename keywordField as foo , textField ', ['AS ']);
  });

  it('suggests = after a field that does not exist', async () => {
    await renameExpectSuggestions('from a | rename field ', ['= ']);
    await renameExpectSuggestions('from a | rename keywordField AS foo, field ', ['= ']);
    await renameExpectSuggestions('from a | rename keywordField as foo , field ', ['= ']);
  });

  it('suggests nothing after AS', async () => {
    await renameExpectSuggestions('from a | rename keywordField AS ', []);
  });

  it('suggests fields after =', async () => {
    await renameExpectSuggestions('from a | rename field = ', getFieldNamesByType('any'));
  });

  it('suggests pipe and comma after complete expression', async () => {
    await renameExpectSuggestions('from a | rename field AS foo ', ['| ', ', ', '\n']);
  });
});
