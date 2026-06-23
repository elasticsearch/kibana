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

const registeredDomainExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'registered_domain',
    mockCallbacks,
    autocomplete
  );
};

describe('REGISTERED_DOMAIN > autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCallbacks = getMockCallbacks();
    mockCallbacks.getSuggestedUserDefinedColumnName = jest.fn(() => 'col0');

    const expectedFields = getFieldNamesByType(ESQL_STRING_TYPES);
    mockFieldsWithTypes(mockCallbacks, expectedFields);
  });

  it('suggests target field after command keyword', async () => {
    await registeredDomainExpectSuggestions(
      'FROM index | REGISTERED_DOMAIN ',
      ['col0 = '],
      mockCallbacks
    );
  });

  it('suggests assignment operator after target field', async () => {
    await registeredDomainExpectSuggestions(
      'FROM index | REGISTERED_DOMAIN prefix ',
      ['= '],
      mockCallbacks
    );
  });

  it('suggests string fields after assignment operator', async () => {
    await registeredDomainExpectSuggestions(
      'FROM index | REGISTERED_DOMAIN prefix = ',
      getFieldNamesByType(ESQL_STRING_TYPES).map((fieldName) => `${fieldName} `),
      mockCallbacks
    );
  });

  it('suggests pipe after complete command', async () => {
    await registeredDomainExpectSuggestions(
      'FROM index | REGISTERED_DOMAIN prefix = host ',
      ['\n', '| '],
      mockCallbacks
    );
  });
});
