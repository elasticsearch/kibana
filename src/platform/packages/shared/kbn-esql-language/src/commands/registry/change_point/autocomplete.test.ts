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
  getFunctionSignaturesByReturnType,
} from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { Location } from '../types';
import { ESQL_NUMBER_TYPES } from '../../definitions/types';
import {
  byCompleteItem,
  pipeCompleteItem,
  commaCompleteItem,
  onCompleteItem,
  asCompletionItem,
} from '../complete_items';

const BY = byCompleteItem.text;
const ON = onCompleteItem.text;
const AS = asCompletionItem.text;
const PIPE = pipeCompleteItem.text;
const COMMA = `${commaCompleteItem.text} `;

const allScalarFunctionsForBy = getFunctionSignaturesByReturnType(
  Location.CHANGE_POINT_BY,
  'any',
  { scalar: true, grouping: true },
  undefined,
  undefined,
  BY
);

const changePointExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'change_point',
    mockCallbacks,
    autocomplete
  );
};

describe('CHANGE_POINT Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;
  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    mockCallbacks = getMockCallbacks();
    jest.clearAllMocks();
  });
  it('suggests value columns of numeric types', async () => {
    const expectedNumericFields = getFieldNamesByType(ESQL_NUMBER_TYPES);
    (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
      expectedNumericFields.map((name) => ({ label: name, text: name }))
    );
    await changePointExpectSuggestions(
      `from a | change_point /`,
      expectedNumericFields,
      mockCallbacks
    );
  });

  it('suggests ON after value column', async () => {
    await changePointExpectSuggestions(`from a | change_point value /`, ['\n', ON, AS, BY, PIPE]);
  });

  it('suggests fields after ON', async () => {
    const expectedFields = getFieldNamesByType('any');
    await changePointExpectSuggestions(`from a | change_point value on /`, expectedFields);

    await changePointExpectSuggestions(`from a | change_point value on fi/`, expectedFields);
  });

  describe('AS', () => {
    it('suggests AS after ON <field>', async () => {
      await changePointExpectSuggestions(`from a | change_point value on field `, [
        '\n',
        AS,
        BY,
        PIPE,
      ]);
    });

    it('suggests default field name for AS clauses with an empty ON', async () => {
      await changePointExpectSuggestions(`from a | change_point value as `, ['changePointType, ']);

      await changePointExpectSuggestions(
        `from a | change_point value on field as changePointType,/`,
        ['pValue']
      );
    });

    it('suggests default field name for AS clauses', async () => {
      await changePointExpectSuggestions(`from a | change_point value on field as `, [
        'changePointType, ',
      ]);

      await changePointExpectSuggestions(
        `from a | change_point value on field as changePointType,/`,
        ['pValue']
      );
    });

    it('suggests a default pValue column name', async () => {
      await changePointExpectSuggestions(
        `from a | change_point value on field as changePointType,pValu/`,
        ['pValue']
      );
    });

    it('suggests pipe after complete command', async () => {
      await changePointExpectSuggestions(
        `from a | change_point value on field as changePointType, pValue `,
        ['\n', BY, PIPE]
      );
    });
  });

  describe('configuration order', () => {
    it('suggests the pipe after the AS clause, On clause should not be suggested', async () => {
      await changePointExpectSuggestions(
        `from a | change_point value as changePointType, pValue `,
        ['\n', BY, PIPE]
      );
    });
  });

  describe('BY', () => {
    it('suggests fields and functions after BY', async () => {
      const expected = [...getFieldNamesByType('any'), ...allScalarFunctionsForBy];
      await changePointExpectSuggestions(`from a | change_point value by `, expected);
    });

    it('suggests fields and functions after BY <field>,', async () => {
      const expected = [
        ...getFieldNamesByType('any').filter((name) => name !== 'keywordField'),
        ...allScalarFunctionsForBy,
      ];
      await changePointExpectSuggestions(`from a | change_point value by keywordField, `, expected);
    });

    it('suggests comma and pipe after a complete grouping field', async () => {
      await changePointExpectSuggestions(`from a | change_point value by keywordField `, [
        '\n',
        COMMA,
        PIPE,
      ]);
    });

    it('suggests fields after BY in full form (value ON field AS type, pvalue BY)', async () => {
      const expected = [...getFieldNamesByType('any'), ...allScalarFunctionsForBy];
      await changePointExpectSuggestions(
        `from a | change_point value on field as changePointType, pValue by `,
        expected
      );
    });
  });
});
