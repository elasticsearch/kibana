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
  suggest,
  getOperatorSuggestions,
} from '../../../__tests__/commands/autocomplete';

import {
  patternMatchOperators,
  inOperators,
  nullCheckOperators,
} from '../../definitions/all_operators';

import type { ICommandCallbacks } from '../types';
import { Location } from '../types';

const expectedFieldSuggestions = getFieldNamesByType('any');
const expectedFunctionSuggestions = getFunctionSignaturesByReturnType(Location.SORT, 'any', {
  scalar: true,
});

// String operators for text/keyword fields (no comparison operators)
const stringOperatorSuggestions = getOperatorSuggestions([
  ...patternMatchOperators,
  ...inOperators,
  ...nullCheckOperators,
]);

const sortExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'sort',
    mockCallbacks,
    autocomplete
  );
};

describe('SORT Autocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // @TODO — test for replacement ranges when we support that.
  // test for replacement range in NULLS FIRST/LAST in all possible positions
  //  including after whitespace... test that replacement range gets added to all suggestions
  //  and IS NULL/IS NOT NULL scenarios
  //  and after a field name starting with an N
  // test for comma replacement range after whitespace

  describe('SORT <expression> ...', () => {
    test('suggests column', async () => {
      await sortExpectSuggestions('from a | sort ', [
        ...expectedFieldSuggestions,
        ...expectedFunctionSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keyw', [
        ...expectedFieldSuggestions,
        ...expectedFunctionSuggestions,
      ]);
      const filteredFieldSuggestions = expectedFieldSuggestions.filter((s) => s !== 'keywordField');
      await sortExpectSuggestions('from a | sort keywordField, ', [
        ...filteredFieldSuggestions,
        ...expectedFunctionSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField, doubl', [
        ...filteredFieldSuggestions,
        ...expectedFunctionSuggestions,
      ]);
    });

    it('suggests modifers after complete column name', async () => {
      await sortExpectSuggestions('from a | sort keywordField', [
        '\n',
        'keywordField, ',
        'keywordField | ',
        'keywordField ASC',
        'keywordField DESC',
        'keywordField NULLS FIRST',
        'keywordField NULLS LAST',
      ]);
      await sortExpectSuggestions('from a | sort keywordField, doubleField', [
        '\n',
        'doubleField, ',
        'doubleField | ',
        'doubleField ASC',
        'doubleField DESC',
        'doubleField NULLS FIRST',
        'doubleField NULLS LAST',
      ]);
    });

    it('suggests modifers and expression operators after column + whitespace', async () => {
      await sortExpectSuggestions('from a | sort keywordField ', [
        '\n',
        ', ',
        '| ',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ...stringOperatorSuggestions,
      ]);

      await sortExpectSuggestions('from a | sort doubleField ASC, keywordField ', [
        '\n',
        ', ',
        '| ',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ...stringOperatorSuggestions,
      ]);
    });

    it('suggests within functions', async () => {
      const suggestions = await suggest(
        'FROM a | SORT TRIM(',
        undefined,
        'sort',
        undefined,
        autocomplete
      );
      expect(suggestions).not.toHaveLength(0);
    });
  });

  describe('... [ ASC / DESC ] ...', () => {
    test('suggests all modifiers on first space', async () => {
      await sortExpectSuggestions('from a | sort keywordField ', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
    });

    test('when user starts to type ASC modifier', async () => {
      await sortExpectSuggestions('from a | sort keywordField A', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField ASC', [
        '\n',
        'ASC NULLS FIRST',
        'ASC NULLS LAST',
        'ASC, ',
        'ASC | ',
      ]);
      await sortExpectSuggestions('from a | sort keywordField asc', [
        '\n',
        'asc NULLS FIRST',
        'asc NULLS LAST',
        'asc, ',
        'asc | ',
      ]);
    });

    test('when user starts to type DESC modifier', async () => {
      await sortExpectSuggestions('from a | sort keywordField D', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField DESC ', [
        '\n',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
      ]);
      await sortExpectSuggestions('from a | sort keywordField desc', [
        '\n',
        'desc NULLS FIRST',
        'desc NULLS LAST',
        'desc, ',
        'desc | ',
      ]);
    });
  });

  describe('... [ NULLS FIRST / NULLS LAST ]', () => {
    test('suggests nulls modifier after order modifier + space', async () => {
      await sortExpectSuggestions('from a | sort keywordField ASC ', [
        '\n',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
      ]);
    });

    test('when user starts to type NULLS modifiers', async () => {
      // @TODO check for replacement range
      await sortExpectSuggestions('from a | sort keywordField N', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField null', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField nulls', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField nulls ', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
    });

    test('when user types NULLS FIRST', async () => {
      await sortExpectSuggestions('from a | sort keywordField NULLS F', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField NULLS FI', [
        '\n',
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
    });

    test('when user types NULLS LAST', async () => {
      await sortExpectSuggestions('from a | sort keywordField NULLS L', [
        '\n',
        'ASC',
        'DESC',
        'NULLS LAST',
        'NULLS FIRST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
      await sortExpectSuggestions('from a | sort keywordField NULLS LAS', [
        '\n',
        'ASC',
        'DESC',
        'NULLS LAST',
        'NULLS FIRST',
        ', ',
        '| ',
        ...stringOperatorSuggestions,
      ]);
    });

    test('after nulls are entered, suggests comma or pipe', async () => {
      await sortExpectSuggestions('from a | sort keywordField NULLS LAST ', ['\n', ', ', '| ']);
    });
  });
});
