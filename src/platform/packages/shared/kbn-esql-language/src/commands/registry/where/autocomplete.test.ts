/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext, getMockCallbacks } from '../../../__tests__/commands/context_fixtures';
import { Location } from '../types';
import { autocomplete } from './autocomplete';
import {
  DATE_DIFF_TIME_UNITS,
  expectSuggestions,
  getFieldNamesByType,
  getFunctionSignaturesByReturnType,
  mockFieldsWithTypes,
  getOperatorSuggestions,
  suggest,
} from '../../../__tests__/commands/autocomplete';
import {
  logicalOperators,
  patternMatchOperators,
  inOperators,
  nullCheckOperators,
} from '../../definitions/all_operators';
import type { ICommandCallbacks } from '../types';
import { ESQL_COMMON_NUMERIC_TYPES } from '../../definitions/types';
import { getDateLiterals } from '../../definitions/utils';
import { findAutocompleteAstPosition } from '../../../language/shared/parse_for_autocomplete_query';

const allEvalFns = getFunctionSignaturesByReturnType(Location.WHERE, 'any', {
  scalar: true,
});

const whereContext = {
  ...mockContext,
  subquerySupport: true,
};

export const EMPTY_WHERE_SUGGESTIONS = [...getFieldNamesByType('any'), ...allEvalFns];

export const EXPECTED_COMPARISON_WITH_TEXT_FIELD_SUGGESTIONS = [
  ...getFieldNamesByType(['text', 'keyword', 'ip', 'version']),
  ...getFunctionSignaturesByReturnType(Location.WHERE, ['text', 'keyword', 'ip', 'version'], {
    scalar: true,
  }),
];

const whereExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = whereContext,
  offset?: number
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'where',
    mockCallbacks,
    autocomplete,
    offset
  );
};

describe('WHERE Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks before each test to ensure isolation
    mockCallbacks = getMockCallbacks();
  });
  test('beginning an expression', async () => {
    await whereExpectSuggestions('from a | where ', EMPTY_WHERE_SUGGESTIONS);
    await whereExpectSuggestions('from a | eval col0 = 1 | where ', [
      ...getFieldNamesByType('any'),
      ...allEvalFns,
    ]);
  });

  describe('within the expression', () => {
    const whereSuggest = async (query: string) => {
      const cursorPosition = query.length;
      const { command } = findAutocompleteAstPosition(query, cursorPosition);
      if (!command) {
        throw new Error('Command not found in the parsed query');
      }
      return autocomplete(query, command, mockCallbacks, mockContext, cursorPosition);
    };
    test.each(['from a | where keywordField ', 'from a | where keywordField I'])(
      'after a field name (%s)',
      async (query) => {
        await whereExpectSuggestions(query, [
          '!= $0',
          '< $0',
          '<= $0',
          '== $0',
          '> $0',
          '>= $0',
          ...getOperatorSuggestions([
            ...patternMatchOperators,
            ...inOperators,
            ...nullCheckOperators,
          ]),
        ]);
      }
    );

    test('after a field name inside parens', async () => {
      await whereExpectSuggestions('from a | where (keywordField ', [
        '!= $0',
        '< $0',
        '<= $0',
        '== $0',
        '> $0',
        '>= $0',
        ...getOperatorSuggestions([
          ...patternMatchOperators,
          ...inOperators,
          ...nullCheckOperators,
        ]),
      ]);
    });

    test('at the start of a parenthesized expression', async () => {
      await whereExpectSuggestions('from a | where (', EMPTY_WHERE_SUGGESTIONS);
    });

    test('suggests dates after a comparison with a date', async () => {
      const expectedFields = getFieldNamesByType(['date', 'date_nanos']);
      mockFieldsWithTypes(mockCallbacks, expectedFields);
      const expectedComparisonWithDateSuggestions = [
        ...getDateLiterals().map((item) => item.text),
        ...getFieldNamesByType(['date']),
        ...getFieldNamesByType(['date_nanos']),
        ...getFunctionSignaturesByReturnType(Location.WHERE, ['date', 'date_nanos'], {
          scalar: true,
        }),
      ];
      await whereExpectSuggestions(
        'from a | where dateField == ',
        expectedComparisonWithDateSuggestions,
        mockCallbacks
      );

      await whereExpectSuggestions(
        'from a | where dateField < ',
        expectedComparisonWithDateSuggestions,
        mockCallbacks
      );

      await whereExpectSuggestions(
        'from a | where dateField >= ',
        expectedComparisonWithDateSuggestions,
        mockCallbacks
      );
    });

    test('after a comparison with a string field', async () => {
      const expectedFields = getFieldNamesByType(['text', 'keyword', 'ip', 'version']);
      mockFieldsWithTypes(mockCallbacks, expectedFields);
      await whereExpectSuggestions(
        'from a | where textField >= ',
        EXPECTED_COMPARISON_WITH_TEXT_FIELD_SUGGESTIONS,
        mockCallbacks
      );
      await whereExpectSuggestions(
        'from a | where textField >= textFiel',
        EXPECTED_COMPARISON_WITH_TEXT_FIELD_SUGGESTIONS,
        mockCallbacks
      );
    });

    test('after a logical operator', async () => {
      for (const op of ['and', 'or']) {
        await whereExpectSuggestions(`from a | where keywordField >= keywordField ${op} `, [
          ...getFieldNamesByType('any'),
          ...getFunctionSignaturesByReturnType(Location.WHERE, 'any', { scalar: true }),
        ]);
        await whereExpectSuggestions(
          `from a | where keywordField >= keywordField ${op} doubleField `,
          [
            ...getFunctionSignaturesByReturnType(Location.WHERE, 'boolean', { operators: true }, [
              'double',
            ]),
          ]
        );
      }
    });

    test('after chained logical operators', async () => {
      await whereExpectSuggestions(
        `from a | where doubleField < 1 AND doubleField > 2 OR doubleField == 3 AND `,
        [
          ...getFieldNamesByType('any'),
          ...getFunctionSignaturesByReturnType(Location.WHERE, 'any', { scalar: true }),
        ]
      );
    });

    test('after chained logical operator inside function', async () => {
      await whereExpectSuggestions(
        `from a | where CASE(doubleField < 1 AND doubleField > 2 OR doubleField == 3 AND `,
        [
          ...getFieldNamesByType('any'),
          ...getFunctionSignaturesByReturnType(Location.WHERE, 'any', { scalar: true }),
        ]
      );
    });

    test('after a logical operator numeric', async () => {
      const expectedFieldsNumeric = getFieldNamesByType(ESQL_COMMON_NUMERIC_TYPES);
      mockFieldsWithTypes(mockCallbacks, expectedFieldsNumeric);
      for (const op of ['and', 'or']) {
        await whereExpectSuggestions(
          `from a | where keywordField >= keywordField ${op} doubleField == `,
          [
            ...getFieldNamesByType(ESQL_COMMON_NUMERIC_TYPES),
            ...getFunctionSignaturesByReturnType(Location.WHERE, ESQL_COMMON_NUMERIC_TYPES, {
              scalar: true,
            }),
          ],
          mockCallbacks
        );
      }
    });

    test('suggests operators after a field name', async () => {
      await whereExpectSuggestions('from a | stats a=avg(doubleField) | where doubleField ', [
        ...getFunctionSignaturesByReturnType(
          Location.WHERE,
          'any',
          { operators: true, skipAssign: true },
          ['double']
        ),
      ]);
    });

    test('suggests function arguments', async () => {
      const expectedFields = getFieldNamesByType(['double', 'integer', 'long', 'unsigned_long']);
      (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
        expectedFields.map((name) => ({ label: name, text: name }))
      );
      // The editor automatically inject the final bracket, so it is not useful to test with just open bracket
      await whereExpectSuggestions(
        'from a | where log10(',
        [
          ...expectedFields,
          ...getFunctionSignaturesByReturnType(
            Location.WHERE,
            ['double', 'integer', 'long', 'unsigned_long'],
            { scalar: true },
            undefined,
            ['log10']
          ),
        ],
        mockCallbacks
      );
      await whereExpectSuggestions(
        'from a | WHERE pow(doubleField, ',
        [
          ...expectedFields,
          ...getFunctionSignaturesByReturnType(
            Location.WHERE,
            ['double', 'integer', 'long', 'unsigned_long'],
            { scalar: true },
            undefined,
            ['pow']
          ),
        ],
        mockCallbacks
      );
    });

    test('suggests boolean and numeric operators after a numeric function result', async () => {
      const expectedSuggestions = [
        ...getFunctionSignaturesByReturnType(
          Location.WHERE,
          'double',
          { operators: true, skipAssign: true },
          ['double']
        ),
        ...getFunctionSignaturesByReturnType(
          Location.WHERE,
          'boolean',
          { operators: true, skipAssign: true },
          ['double']
        ),
      ];

      await whereExpectSuggestions('from a | where log10(doubleField) ', expectedSuggestions);
      await whereExpectSuggestions('from a | where ROUND((doubleField)) ', expectedSuggestions);
    });

    test('suggestions after IS', async () => {
      await whereExpectSuggestions(
        'from index | WHERE keywordField IS ',
        getOperatorSuggestions(nullCheckOperators)
      );

      await whereExpectSuggestions('from index | WHERE keywordField IS NU', ['IS NULL']);
    });

    test('suggestions after NOT', async () => {
      await whereExpectSuggestions(
        'from index | WHERE keywordField not ',
        getOperatorSuggestions(
          [...patternMatchOperators, ...inOperators].filter((op) => !op.name.startsWith('not '))
        )
      );
      await whereExpectSuggestions(
        'from index | WHERE keywordField NOT ',
        getOperatorSuggestions(
          [...patternMatchOperators, ...inOperators].filter((op) => !op.name.startsWith('not '))
        )
      );
      await whereExpectSuggestions('FROM index | WHERE NOT ENDS_WITH(keywordField, "foo") ', [
        '\n',
        ...getOperatorSuggestions(logicalOperators),
        '| ',
      ]);
      await whereExpectSuggestions('from index | WHERE keywordField IS NOT ', ['IS NOT NULL']);
      await whereExpectSuggestions('from index | WHERE keywordField IS NOT      ', ['IS NOT NULL']);
    });

    test('suggestions after IN', async () => {
      await whereExpectSuggestions('from index | WHERE doubleField in ', [
        '($0)',
        '(FROM $0)',
        '(ROW $0)',
        '(TS $0)',
      ]);
      await whereExpectSuggestions('from index | WHERE doubleField not in ', [
        '($0)',
        '(FROM $0)',
        '(ROW $0)',
        '(TS $0)',
      ]);

      await whereExpectSuggestions(
        'from index | WHERE doubleField in (FROM index | KEEP doubleField) ',
        ['\n', ...getOperatorSuggestions(logicalOperators), '| ']
      );
      await whereExpectSuggestions(
        'from index | WHERE doubleField not in (FROM index | KEEP doubleField) ',
        ['\n', ...getOperatorSuggestions(logicalOperators), '| ']
      );
      await whereExpectSuggestions('from index | WHERE doubleField in (ROW doubleField = 1) ', [
        '\n',
        ...getOperatorSuggestions(logicalOperators),
        '| ',
      ]);

      const expectedFields = getFieldNamesByType(['double']);
      mockFieldsWithTypes(mockCallbacks, expectedFields);
      await whereExpectSuggestions(
        'from index | WHERE doubleField not in (',
        [
          ...getFieldNamesByType('double'),
          ...getFunctionSignaturesByReturnType(Location.WHERE, 'double', { scalar: true }),
        ],
        mockCallbacks
      );
      await whereExpectSuggestions(
        'from index | WHERE doubleField in ( textField, ',
        [
          ...getFieldNamesByType('double'),
          ...getFunctionSignaturesByReturnType(Location.WHERE, 'double', { scalar: true }),
        ],
        mockCallbacks
      );
      await whereExpectSuggestions(
        'from index | WHERE (doubleField) in ( textField, ',
        [
          ...getFieldNamesByType('double'),
          ...getFunctionSignaturesByReturnType(Location.WHERE, 'double', { scalar: true }),
        ],
        mockCallbacks
      );
    });

    test('suggestions after IS (NOT) NULL', async () => {
      await whereExpectSuggestions(
        'FROM index | WHERE tags.keyword IS NULL ',
        getOperatorSuggestions(logicalOperators)
      );

      await whereExpectSuggestions(
        'FROM index | WHERE tags.keyword IS NOT NULL ',
        getOperatorSuggestions(logicalOperators)
      );
    });

    test('suggestions after an arithmetic expression', async () => {
      await whereExpectSuggestions('FROM index | WHERE doubleField + doubleField ', [
        ...getFunctionSignaturesByReturnType(
          Location.WHERE,
          'any',
          { operators: true, skipAssign: true },
          ['double'],
          [':']
        ),
      ]);
    });

    test('pipe suggestion after complete expression', async () => {
      expect(await whereSuggest('from index | WHERE doubleField != doubleField ')).toContainEqual(
        expect.objectContaining({
          label: '|',
        })
      );
    });
  });

  describe('function parameter constraints', () => {
    it('constantOnly constraint - DATE_DIFF should suggest only constants', async () => {
      await whereExpectSuggestions(
        'from a | where DATE_DIFF(',
        DATE_DIFF_TIME_UNITS,
        mockCallbacks
      );
    });
  });

  describe('KQL function autocomplete', () => {
    const kqlSuggestions = [
      { text: 'field_name', label: 'field_name', kind: 'Field' as const },
      { text: 'other_field', label: 'other_field', kind: 'Field' as const },
    ];

    beforeEach(() => {
      mockCallbacks = {
        ...getMockCallbacks(),
        getKqlSuggestions: jest.fn().mockImplementation((kqlQuery: string) =>
          Promise.resolve(
            kqlSuggestions.map((suggestion) => ({
              ...suggestion,
              // Mimic the KQL provider's per-suggestion range: the current word (after last space to cursor).
              range: { start: kqlQuery.lastIndexOf(' ') + 1, end: kqlQuery.length },
            }))
          )
        ),
      };
    });

    it('returns KQL suggestions when cursor is inside KQL("""...)', async () => {
      await whereExpectSuggestions(
        'from index | WHERE KQL("""field_na',
        ['field_name', 'other_field'],
        mockCallbacks
      );
    });

    it('returns KQL suggestions for an empty KQL query (cursor right after """)', async () => {
      await whereExpectSuggestions(
        'from index | WHERE KQL("""',
        ['field_name', 'other_field'],
        mockCallbacks
      );
    });

    it('rangeToReplace starts at the typed word, not at the """ delimiter', async () => {
      const query = 'from index | WHERE KQL("""field_na';
      const kqlStartOffset = 'from index | WHERE KQL("""'.length;
      const results = await suggest(query, whereContext, 'where', mockCallbacks, autocomplete);

      const suggestion = results.find((s) => s.text === 'field_name');
      expect(suggestion).toBeDefined();
      expect(suggestion!.rangeToReplace).toEqual({
        start: kqlStartOffset,
        end: query.length,
      });
    });

    it('rangeToReplace covers only the current word in multi-token KQL queries', async () => {
      const query = 'from index | WHERE KQL("""fieldA AND field_na';
      const wordStart = query.lastIndexOf('field_na');
      const results = await suggest(query, whereContext, 'where', mockCallbacks, autocomplete);

      const suggestion = results.find((s) => s.text === 'field_name');
      expect(suggestion).toBeDefined();
      expect(suggestion!.rangeToReplace).toEqual({
        start: wordStart,
        end: query.length,
      });
    });
  });
});
