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
import { expectSuggestions, getFieldNamesByType } from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { ESQL_STRING_TYPES } from '../../definitions/types';

const fuseExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext,
  offset?: number
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'fuse',
    mockCallbacks,
    autocomplete,
    offset
  );
};

describe('FUSE Autocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('FUSE arguments', () => {
    it('suggests all FUSE arguments + FUSE types if FUSE has no arguments', async () => {
      await fuseExpectSuggestions('FROM a | FUSE /', [
        '\n',
        'linear ',
        'rrf ',
        'SCORE BY ',
        'KEY BY ',
        'GROUP BY ',
        'WITH { $0 }',
        '| ',
      ]);
    });

    it('does not suggest FUSE types if FUSE already has one', async () => {
      await fuseExpectSuggestions('FROM a | FUSE linear /', [
        '\n',
        'SCORE BY ',
        'KEY BY ',
        'GROUP BY ',
        'WITH { $0 }',
        '| ',
      ]);
    });

    it('does not suggest already used arguments', async () => {
      await fuseExpectSuggestions('FROM a | FUSE linear SCORE BY x KEY BY y ', [
        '\n',
        'GROUP BY ',
        'WITH { $0 }',
        '| ',
      ]);
    });

    // A bug in the parser makes it to missbehave if the map is not the last argument
    // - unskip when fixed in ES side.
    it.skip('allows WITH map to be at any configuration place', async () => {
      await fuseExpectSuggestions(
        'FROM a | FUSE WITH { "item": "value", "item2": 33 } SCORE BY duration ',
        ['GROUP BY ', 'KEY BY ', '| ']
      );
    });

    it('does not suggest FUSE type if another argument has been added', async () => {
      await fuseExpectSuggestions('FROM a | FUSE SCORE BY x /', [
        '\n',
        'KEY BY ',
        'GROUP BY ',
        'WITH { $0 }',
        '| ',
      ]);
    });
  });

  describe('SCORE BY', () => {
    it('suggests double fields after SCORE BY', async () => {
      const expectedDoubleFields = getFieldNamesByType('double');
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedDoubleFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear SCORE BY /',
        expectedDoubleFields,
        mockCallbacks
      );
    });

    it('suggests partial double fields after SCORE BY', async () => {
      const expectedDoubleFields = getFieldNamesByType('double');
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedDoubleFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear SCORE BY doubleFi/',
        expectedDoubleFields,
        mockCallbacks
      );
    });
  });

  describe('GROUP BY', () => {
    it('suggests string fields after GROUP BY', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear GROUP BY /',
        expectedStringFields,
        mockCallbacks
      );
    });

    it('suggests partial string fields after GROUP BY', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear GROUP BY textFi/',
        expectedStringFields,
        mockCallbacks
      );
    });
  });

  describe('KEY BY', () => {
    it('suggests string fields after KEY BY', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear KEY BY /',
        expectedStringFields,
        mockCallbacks
      );
    });

    it('suggests partial string fields after KEY BY', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear KEY BY textFi/',
        expectedStringFields,
        mockCallbacks
      );
    });

    it('suggests string fields after a comma following KEY BY', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear KEY BY keywordField, /',
        expectedStringFields,
        mockCallbacks
      );
    });

    it('suggests partial string fields after a comma following KEY BY', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear KEY BY keywordField, textFi/',
        expectedStringFields,
        mockCallbacks
      );
    });

    it('does not suggest already used fields after a comma following KEY BY', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE KEY BY keywordField, textField, /',
        expectedStringFields,
        mockCallbacks
      );
      expect(mockCallbacks.getByType).toHaveBeenCalledWith(
        ESQL_STRING_TYPES,
        ['keywordField', 'textField'], // Ignored fields
        { openSuggestions: true }
      );
    });

    it('suggests other config arguments after KEY BY fields', async () => {
      await fuseExpectSuggestions('FROM a | FUSE KEY BY keywordField, textField ', [
        '\n',
        'SCORE BY ',
        'GROUP BY ',
        'WITH { $0 }',
        '| ',
      ]);
    });

    it('suggests other config arguments and a comma immediately after a field', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE KEY BY keywordField, textField',
        [
          'textField \n',
          'textField GROUP BY ',
          'textField SCORE BY ',
          'textField WITH { $0 }',
          'textField | ',
          'textField, ',
        ],
        mockCallbacks
      );
    });

    it('works properly if its preceded by other configs', async () => {
      const expectedStringFields = getFieldNamesByType(ESQL_STRING_TYPES);
      const mockCallbacks = getMockCallbacks();
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedStringFields.map((name) => ({ label: name, text: name }))
      );
      await fuseExpectSuggestions(
        'FROM a | FUSE linear SCORE BY keywordField GROUP BY keywordField WITH {} KEY BY /',
        expectedStringFields,
        mockCallbacks
      );
    });
  });

  describe('WITH', () => {
    it('suggests empty map if WITH is empty', async () => {
      await fuseExpectSuggestions('FROM a | FUSE linear WITH ', ['{ $0 }']);
    });

    it('suggests rank_constant and weights as parameters when FUSE method is rrf', async () => {
      await fuseExpectSuggestions('FROM a | FUSE rrf WITH { ', [
        '"rank_constant": ',
        '"weights": { $0 }',
      ]);
    });

    it('suggests rank_constant and weights as parameters when no FUSE method is provided', async () => {
      await fuseExpectSuggestions('FROM a | FUSE WITH { ', [
        '"rank_constant": ',
        '"weights": { $0 }',
      ]);
    });

    it('suggests 60 as default value for rank_constant parameter', async () => {
      await fuseExpectSuggestions('FROM a | FUSE rrf WITH { "rank_constant": ', ['60']);
    });

    it('suggests normalizer and weights as parameters when FUSE method is linear', async () => {
      await fuseExpectSuggestions('FROM a | FUSE linear WITH { ', [
        '"normalizer": "$0"',
        '"weights": { $0 }',
      ]);
    });

    it('suggests parameter values for normalizer parameter', async () => {
      await fuseExpectSuggestions('FROM a | FUSE linear WITH { "normalizer": "', [
        '"none"',
        '"minmax"',
      ]);
    });

    it('suggests nothing within weights sub map', async () => {
      await fuseExpectSuggestions('FROM a | FUSE linear WITH { "weights": { ', []);
      await fuseExpectSuggestions('FROM a | FUSE linear WITH { "weights": { "', []);
      await fuseExpectSuggestions('FROM a | FUSE linear WITH { "weights": { "fork1": ', []);
      await fuseExpectSuggestions('FROM a | FUSE linear WITH { "weights": { "fork1": "', []);
    });
  });
});
