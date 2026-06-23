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
  getFieldNamesByType,
  getFunctionSignaturesByReturnType,
  getOperatorSuggestions,
} from '../../../__tests__/commands/autocomplete';
import {
  defaultLimitValueSuggestions,
  pipeCompleteItem,
  commaCompleteItem,
  byCompleteItem,
} from '../complete_items';
import type { ICommandCallbacks } from '../types';
import { Location } from '../types';
import { comparisonFunctions, arithmeticOperators } from '../../definitions/all_operators';

const commaWithSpaceText = `${commaCompleteItem.text} `;

const limitExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'limit',
    mockCallbacks,
    autocomplete
  );
};

const allScalarFunctionsForBy = getFunctionSignaturesByReturnType(
  Location.LIMIT_BY,
  'any',
  {
    scalar: true,
    grouping: true,
  },
  undefined,
  undefined,
  'by'
);

describe('LIMIT Autocomplete', () => {
  const limitValueTexts = defaultLimitValueSuggestions.map((value) => `${value} `);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('LIMIT <number>', () => {
    test('suggests numbers', async () => {
      await limitExpectSuggestions('from a | limit /', limitValueTexts);
    });

    test('suggests numbers when value is still missing', async () => {
      await limitExpectSuggestions('FROM kibana_sample_data_logs | LIMIT   ', limitValueTexts);
    });

    test('suggests BY and pipe after number', async () => {
      await limitExpectSuggestions('from a | limit 4 ', [
        byCompleteItem.text,
        pipeCompleteItem.text,
        '\n',
      ]);
    });
  });

  describe('LIMIT <number> BY', () => {
    test('suggests columns and functions after BY', async () => {
      const expected = [...getFieldNamesByType('any'), ...allScalarFunctionsForBy];

      await limitExpectSuggestions('from a | limit 10 by ', expected);
      await limitExpectSuggestions('from a | limit 10 BY ', expected);
    });

    test('suggests pipe and comma after complete column', async () => {
      const operatorSuggestions = [
        ...getOperatorSuggestions(comparisonFunctions),
        ...getOperatorSuggestions(arithmeticOperators),
      ].filter((op) => op !== '-');

      await limitExpectSuggestions('from a | limit 10 by integerField ', [
        pipeCompleteItem.text,
        commaWithSpaceText,
        '\n',
        ...operatorSuggestions,
      ]);
    });

    test('suggests columns after comma', async () => {
      const expected = [
        ...getFieldNamesByType('any').filter((name) => name !== 'integerField'),
        ...allScalarFunctionsForBy,
      ];

      await limitExpectSuggestions('from a | limit 10 by integerField, ', expected);
    });
  });

  describe('LIMIT <param>', () => {
    test('suggests BY and pipe after parameter', async () => {
      await limitExpectSuggestions('from a | limit ?rows ', [
        byCompleteItem.text,
        pipeCompleteItem.text,
        '\n',
      ]);
    });
  });
});
