/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { EsqlFieldType } from '@kbn/esql-types';
import {
  mockContext,
  lookupIndexFields,
  getMockCallbacks,
} from '../../../__tests__/commands/context_fixtures';
import { Location } from '../types';
import { autocomplete } from './autocomplete';
import {
  expectSuggestions,
  getFieldNamesByType,
  getFunctionSignaturesByReturnType,
  getLiteralsByType,
  getOperatorSuggestions,
} from '../../../__tests__/commands/autocomplete';
import {
  comparisonFunctions,
  patternMatchOperators,
  inOperators,
  nullCheckOperators,
} from '../../definitions/all_operators';
import type { ICommandCallbacks } from '../types';
import type { FunctionReturnType } from '../../definitions/types';
import { FunctionDefinitionTypes, ESQL_COMMON_NUMERIC_TYPES } from '../../definitions/types';
import { findAutocompleteAstPosition } from '../../../language/shared/parse_for_autocomplete_query';
import { setTestFunctions } from '../../definitions/utils/test_functions';
import {
  getDateHistogramCompletionItem,
  getTimeseriesDateHistogramCompletionItem,
  PLACEHOLDER_CONFIG,
} from '../complete_items';
import { attachReplacementRanges } from '../../../language/autocomplete/utils/prefix_range';

const roundParameterTypes = ['double', 'integer', 'long', 'unsigned_long'] as const;
const allAggFunctions = getFunctionSignaturesByReturnType(Location.STATS, 'any', {
  agg: true,
});

const allEvalFunctionsForStats = getFunctionSignaturesByReturnType(
  Location.STATS,
  'any',
  {
    scalar: true,
    grouping: false,
  },
  undefined,
  undefined,
  'by'
);

const allGroupingFunctions = getFunctionSignaturesByReturnType(
  Location.STATS,
  'any',
  {
    grouping: true,
  },
  undefined,
  undefined,
  'by'
);

export const EXPECTED_FIELD_AND_FUNCTION_SUGGESTIONS = [
  ...getFieldNamesByType('any'),
  ...getFunctionSignaturesByReturnType(Location.SORT, 'any', {
    scalar: true,
  }),
];

// types accepted by the AVG function
export const AVG_TYPES: Array<EsqlFieldType & FunctionReturnType> = [
  'double',
  'integer',
  'long',
  'aggregate_metric_double',
  'exponential_histogram',
  'tdigest',
];

export const EXPECTED_FOR_FIRST_EMPTY_EXPRESSION = [
  'BY ',
  ' = ',
  ...allAggFunctions,
  ...allGroupingFunctions,
  ...allEvalFunctionsForStats,
];

export const EXPECTED_FOR_EMPTY_EXPRESSION = [
  ' = ',
  ...allAggFunctions,
  ...allGroupingFunctions,
  ...allEvalFunctionsForStats,
];

const statsExpectSuggestions = (
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
    'stats',
    mockCallbacks,
    autocomplete,
    offset
  );
};

describe('STATS Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks before each test to ensure isolation
    mockCallbacks = getMockCallbacks();
    (mockCallbacks.getColumnsForQuery as jest.Mock).mockResolvedValue([...lookupIndexFields]);
  });

  const suggest = async (query: string) => {
    const cursorPosition = query.length;
    const { innerText, root, command, tokens } = findAutocompleteAstPosition(query, cursorPosition);
    if (!command) {
      throw new Error('Command not found in the parsed query');
    }
    const contextWithRoot = { ...mockContext, rootAst: root };
    const suggestions = await autocomplete(
      query,
      command,
      mockCallbacks,
      contextWithRoot,
      cursorPosition
    );
    return attachReplacementRanges(innerText, suggestions, {
      commandContext: contextWithRoot,
      tokens,
    });
  };
  describe('STATS ...', () => {
    afterEach(() => setTestFunctions([]));

    describe('... <aggregates> ...', () => {
      test('suggestions for a fresh expression', async () => {
        await statsExpectSuggestions('from a | stats ', EXPECTED_FOR_FIRST_EMPTY_EXPRESSION);
        await statsExpectSuggestions('FROM a | STATS ', EXPECTED_FOR_FIRST_EMPTY_EXPRESSION);
        await statsExpectSuggestions('from a | stats a=max(b), ', EXPECTED_FOR_EMPTY_EXPRESSION);
        await statsExpectSuggestions(
          'from a | stats a=max(b) WHERE doubleField > longField, ',
          EXPECTED_FOR_EMPTY_EXPRESSION
        );
      });

      test('on assignment expression, shows all agg and eval functions', async () => {
        await statsExpectSuggestions('from a | stats a= ', [
          ...allAggFunctions,
          ...allGroupingFunctions,
          ...allEvalFunctionsForStats,
        ]);
      });

      test('on space after aggregate field', async () => {
        await statsExpectSuggestions('from a | stats a=min(integerField) ', [
          '\n',
          'WHERE ',
          'BY ',
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS,
            'any',
            { operators: true, skipAssign: true },
            ['integer']
          ),
        ]);

        await statsExpectSuggestions('FROM index1 | STATS AVG(doubleField) WHE', [
          '\n',
          'WHERE ',
          'BY ',
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS,
            'any',
            { operators: true, skipAssign: true },
            ['double']
          ),
        ]);

        await statsExpectSuggestions('FROM index1 | STATS AVG(doubleField) B', [
          '\n',
          'WHERE ',
          'BY ',
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS,
            'any',
            { operators: true, skipAssign: true },
            ['double']
          ),
        ]);
      });

      test('on function left paren', async () => {
        // set the test functions to include a time series agg function
        // to ensure it is suggested in the stats command
        // this is a workaround for the fact that the time series agg functions
        // are on snapshots atm, remove when they are on tech preview
        setTestFunctions([
          {
            type: FunctionDefinitionTypes.TIME_SERIES_AGG,
            name: 'func',
            description: '',
            signatures: [
              {
                params: [
                  {
                    name: 'field',
                    type: 'counter_double',
                    optional: false,
                  },
                ],
                returnType: 'double',
              },
              {
                params: [
                  {
                    name: 'field',
                    type: 'counter_integer',
                    optional: false,
                  },
                ],
                returnType: 'double',
              },
              {
                params: [
                  {
                    name: 'field',
                    type: 'counter_long',
                    optional: false,
                  },
                ],
                returnType: 'double',
              },
            ],
            locationsAvailable: [Location.STATS_TIMESERIES],
          },
        ]);
        const expectedFields = getFieldNamesByType([
          ...ESQL_COMMON_NUMERIC_TYPES,
          'date',
          'date_nanos',
        ]);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFields.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'from a | stats by bucket(',
          [
            ...getFieldNamesByType([...ESQL_COMMON_NUMERIC_TYPES, 'date', 'date_nanos']),
            ...getFunctionSignaturesByReturnType(
              Location.STATS_BY,
              ['date', 'date_nanos', ...ESQL_COMMON_NUMERIC_TYPES],
              {
                scalar: true,
              }
            ).map((f) => `${f},`),
          ],
          mockCallbacks
        );
        const expectedFieldsRound = getFieldNamesByType(roundParameterTypes);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFieldsRound.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'from a | stats round(',
          [
            ...getFunctionSignaturesByReturnType(Location.STATS, roundParameterTypes, {
              agg: true,
            }),
            ...getFieldNamesByType(roundParameterTypes),
            ...getFunctionSignaturesByReturnType(
              Location.STATS_BY,
              roundParameterTypes,
              { scalar: true, grouping: true },
              undefined,
              ['round']
            ),
          ],
          mockCallbacks
        );
        await statsExpectSuggestions(
          'from a | stats round(round(',
          [
            ...getFunctionSignaturesByReturnType(Location.STATS, roundParameterTypes, {
              agg: true,
            }),
            ...getFieldNamesByType(roundParameterTypes),
            ...getFunctionSignaturesByReturnType(
              Location.STATS_BY,
              roundParameterTypes,
              { scalar: true, grouping: true },
              undefined,
              ['round']
            ),
          ],
          mockCallbacks
        );
        await statsExpectSuggestions(
          'from a | stats avg(round(',
          [
            ...getFieldNamesByType(roundParameterTypes),
            ...getFunctionSignaturesByReturnType(
              Location.STATS_BY,
              roundParameterTypes,
              { scalar: true, grouping: true },
              undefined,
              ['round']
            ),
          ],
          mockCallbacks
        );
        const expectedFieldsAvg = getFieldNamesByType(AVG_TYPES);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFieldsAvg.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'from a | stats avg(',
          [
            ...expectedFieldsAvg,
            ...getFunctionSignaturesByReturnType(Location.STATS_BY, AVG_TYPES, {
              scalar: true,
              grouping: true,
            }),
          ],
          mockCallbacks
        );
        await statsExpectSuggestions(
          'TS a | stats avg(',
          [
            ...expectedFieldsAvg,
            ...getFunctionSignaturesByReturnType(
              [Location.STATS, Location.STATS_TIMESERIES],
              AVG_TYPES,
              {
                scalar: true,
                timeseriesAgg: true,
              }
            ),
            'FUNC($0)',
          ],
          mockCallbacks
        );
        await statsExpectSuggestions(
          'from a | stats round(avg(',
          [
            ...expectedFieldsAvg,
            ...getFunctionSignaturesByReturnType(
              Location.STATS_BY,
              AVG_TYPES,
              { scalar: true, grouping: true },
              undefined,
              ['round']
            ),
          ],
          mockCallbacks
        );
      });

      test('when typing inside function left paren', async () => {
        const expectedFields = getFieldNamesByType([
          ...ESQL_COMMON_NUMERIC_TYPES,
          'date',
          'date_nanos',
          'boolean',
          'ip',
          'version',
          'text',
          'keyword',
        ]);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFields.map((name) => ({ label: name, text: name }))
        );
        const expected = [
          ...expectedFields,
          ...getFunctionSignaturesByReturnType(
            Location.STATS,
            [
              ...ESQL_COMMON_NUMERIC_TYPES,
              'date',
              'boolean',
              'ip',
              'version',
              'text',
              'keyword',
              'date_nanos',
              'unsigned_long',
              'aggregate_metric_double',
              'exponential_histogram',
              'tdigest',
            ],
            {
              scalar: true,
              grouping: true,
            }
          ),
        ];

        await statsExpectSuggestions('from a | stats a=min(', expected, mockCallbacks);
        await statsExpectSuggestions('from a | stats a=min(/b), b=max(', expected, mockCallbacks);
        await statsExpectSuggestions('from a | stats a=min(b), b=max(', expected, mockCallbacks);
      });

      test('inside a function arg with hint.kind === "aggregation" (e.g. SPARKLINE first arg), only aggregation functions are suggested', async () => {
        // Mock fields just to verify they get suppressed even when the resolver would return them
        const allFields = getFieldNamesByType('any');
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          allFields.map((name) => ({ label: name, text: name }))
        );

        const expectedAggregations = getFunctionSignaturesByReturnType(
          Location.STATS,
          ['integer', 'long', 'double'],
          { agg: true, timeseriesAgg: true },
          undefined,
          ['sparkline']
        ).map((s) => `${s},`);

        await statsExpectSuggestions(
          'from a | stats SPARKLINE(',
          expectedAggregations,
          mockCallbacks
        );
      });

      test('inside function argument list', async () => {
        const expectedFieldsAvg = getFieldNamesByType(AVG_TYPES);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFieldsAvg.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'from a | stats avg(b) by stringField',
          [
            ...getFieldNamesByType(AVG_TYPES),
            ...getFunctionSignaturesByReturnType(
              Location.STATS_BY,
              [...AVG_TYPES, 'aggregate_metric_double'],
              {
                scalar: true,
                grouping: true,
              }
            ),
          ],
          mockCallbacks,
          mockContext,
          20
        );
      });

      test('when typing right paren', async () => {
        await statsExpectSuggestions(
          'from a | stats a = min(integerField) | sort b',
          [
            '\n',
            'WHERE ',
            'BY ',
            ', ',
            '| ',
            ...getFunctionSignaturesByReturnType(
              Location.STATS,
              'any',
              { operators: true, skipAssign: true },
              ['integer']
            ),
          ],
          mockCallbacks,
          mockContext,
          36
        );
      });

      test('increments suggested variable name counter', async () => {
        await statsExpectSuggestions(
          'from a | eval col0=round(b), col1=round(c) | stats ',
          EXPECTED_FOR_FIRST_EMPTY_EXPRESSION
        );
        await statsExpectSuggestions(
          'from a | stats col0=min(b),col1=c,',
          EXPECTED_FOR_EMPTY_EXPRESSION
        );
      });

      test('expressions with aggregates', async () => {
        await statsExpectSuggestions('from a | stats col0 = min(integerField) ', [
          '\n',
          'BY ',
          'WHERE ',
          '| ',
          ', ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS,
            'any',
            { operators: true, skipAssign: true },
            ['integer']
          ),
        ]);
        await statsExpectSuggestions('from a | stats col0 = min(integerField) + ', [
          ...getFunctionSignaturesByReturnType(
            Location.STATS,
            ['integer', 'double', 'long', 'dense_vector'],
            {
              scalar: true,
              agg: true,
              grouping: true,
            }
          ),
        ]);
      });

      describe('...WHERE expression...', () => {
        it('suggests fields and functions in empty expression', async () => {
          await statsExpectSuggestions('FROM a | STATS MIN(b) WHERE ', [
            ...getFieldNamesByType('any'),
            ...getFunctionSignaturesByReturnType(Location.STATS_WHERE, 'any', { scalar: true }),
          ]);
        });

        it('suggests operators after a first operand', async () => {
          await statsExpectSuggestions('FROM a | STATS MIN(b) WHERE keywordField ', [
            ...getOperatorSuggestions([
              ...comparisonFunctions,
              ...patternMatchOperators,
              ...inOperators,
              ...nullCheckOperators,
            ]),
          ]);
        });

        it('suggests after operator', async () => {
          const expectedFieldsStrings = getFieldNamesByType(['text', 'keyword']);
          (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
            expectedFieldsStrings.map((name) => ({ label: name, text: name }))
          );
          await statsExpectSuggestions(
            'FROM a | STATS MIN(b) WHERE keywordField != ',
            [
              ...expectedFieldsStrings,
              ...getFunctionSignaturesByReturnType(Location.STATS_WHERE, ['text', 'keyword'], {
                scalar: true,
              }),
            ],
            mockCallbacks
          );
        });

        it('suggests opening a list after IN in WHERE', async () => {
          await statsExpectSuggestions('FROM a | STATS MIN(b) WHERE keywordField IN ', ['($0)']);
        });

        it('suggests LIKE pattern values after LIKE in WHERE', async () => {
          await statsExpectSuggestions('FROM a | STATS MIN(b) WHERE keywordField LIKE ', [
            '"${0:*}"',
            '"${0:?}"',
          ]);
        });

        describe('completed expression suggestions', () => {
          const completedExpressionSuggestions = ['| ', ', ', 'BY '];

          test.each(completedExpressionSuggestions)(
            'suggests "%s" after complete boolean expression',
            async (suggestion) => {
              const suggestions = await suggest(
                'FROM a | STATS MIN(b) WHERE keywordField != keywordField '
              );
              expect(suggestions.map(({ text }) => text)).toContain(suggestion);
            }
          );

          test.each(completedExpressionSuggestions)(
            'does NOT suggest "%s" after complete non-boolean',
            async (suggestion) => {
              const suggestions = await suggest('FROM a | STATS MIN(b) WHERE longField + 1 ');
              expect(suggestions.map(({ text }) => text)).not.toContain(suggestion);
            }
          );
        });

        it('suggests after logical operator', async () => {
          await statsExpectSuggestions(
            `FROM a | STATS AVG(doubleField) WHERE keywordField >= keywordField AND doubleField `,
            [
              ...getFunctionSignaturesByReturnType(
                Location.STATS_WHERE,
                'boolean',
                { operators: true },
                ['double']
              ),
            ]
          );
        });
      });
    });

    describe('... BY <grouping>', () => {
      test('on space after "BY" keyword', async () => {
        const expected = [
          ' = ',
          getDateHistogramCompletionItem().text,
          ...getFieldNamesByType('any'),
          ...allEvalFunctionsForStats,
          ...allGroupingFunctions,
        ];

        await statsExpectSuggestions('from a | stats a=max(b) by ', expected);
        await statsExpectSuggestions('from a | stats a=max(b) BY ', expected);
        await statsExpectSuggestions('from a | stats a=min(b) by ', expected);
      });

      test('on partial column name', async () => {
        const expected = [
          ...allEvalFunctionsForStats,
          ...allGroupingFunctions,
          getDateHistogramCompletionItem().text,
          ' = ',
        ];

        await statsExpectSuggestions('from a | stats a=max(b) BY keywor', [
          ...expected,
          ...getFieldNamesByType('any'),
        ]);

        await statsExpectSuggestions('from a | stats a=max(b) BY integerField, keywor', [
          ...expected,
          ...getFieldNamesByType('any').filter((name) => name !== 'integerField'),
        ]);
      });

      test('on complete column name', async () => {
        await statsExpectSuggestions('from a | stats a=max(b) by integerField', [
          '\n',
          'integerField | ',
          'integerField, ',
        ]);

        await statsExpectSuggestions('from a | stats a=max(b) by col0 = integerField', [
          '\n',
          'integerField | ',
          'integerField, ',
        ]);

        await statsExpectSuggestions('from a | stats a=max(b) by keywordField, integerField', [
          '\n',
          'integerField | ',
          'integerField, ',
        ]);

        await statsExpectSuggestions(
          'from a | stats a=max(b) by keywordField, col0 = integerField',
          ['\n', 'integerField | ', 'integerField, ']
        );
      });

      test('attaches field range', async () => {
        const suggestions = await suggest('from a | stats a=max(b) by integerF');
        const fieldSuggestion = suggestions.find((s) => s.text === 'integerField');
        expect(fieldSuggestion?.rangeToReplace).toEqual({
          start: 27,
          end: 35,
        });
      });

      test('on space after grouping field', async () => {
        await statsExpectSuggestions('from a | stats a=c by keywordField ', [
          '\n',
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS_BY,
            'any',
            {
              operators: true,
              skipAssign: true,
            },
            ['keyword']
          ),
        ]);
      });

      test('on space after grouping function', async () => {
        await statsExpectSuggestions('from a | stats a=c by CATEGORIZE(keywordField) ', [
          '\n',
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS_BY,
            'any',
            {
              operators: true,
              skipAssign: true,
            },
            ['keyword']
          ),
        ]);
      });

      test('after comma "," in grouping fields', async () => {
        const fields = getFieldNamesByType('any');
        await statsExpectSuggestions('from a | stats a=c by d, ', [
          ' = ',
          getDateHistogramCompletionItem().text,
          ...fields,
          ...allEvalFunctionsForStats,
          ...allGroupingFunctions,
        ]);
        await statsExpectSuggestions('from a | stats a=min(b),', [
          ' = ',
          ...allAggFunctions,
          ...allEvalFunctionsForStats,
          ...allGroupingFunctions,
        ]);
        await statsExpectSuggestions('from a | stats avg(b) by c, ', [
          ' = ',
          getDateHistogramCompletionItem().text,
          ...fields,
          ...getFunctionSignaturesByReturnType(Location.STATS, 'any', { scalar: true }),
          ...allGroupingFunctions,
        ]);
      });

      test('on space before expression right hand side operand', async () => {
        const expectedFieldsNumeric = getFieldNamesByType(['integer', 'double', 'long']);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFieldsNumeric.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'from a | stats avg(b) by integerField % ',
          [
            ...getFieldNamesByType('integer'),
            ...getFieldNamesByType('double'),
            ...getFieldNamesByType('long'),
            ...getFunctionSignaturesByReturnType(Location.EVAL, ['integer', 'double', 'long'], {
              scalar: true,
            }),
            // Filter out functions that are not compatible with this context
            ...allGroupingFunctions.filter(
              (f) =>
                !['CATEGORIZE', 'TBUCKET', 'WITHOUT'].some((incompatible) =>
                  f.includes(incompatible)
                )
            ),
          ],
          mockCallbacks
        );
        const expectedFieldsAny = getFieldNamesByType(['any']);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFieldsAny.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'from a | stats avg(b) by col0 = ',
          [
            getDateHistogramCompletionItem().text,
            ...getFieldNamesByType('any'),
            ...allEvalFunctionsForStats,
            ...allGroupingFunctions,
          ],
          mockCallbacks
        );
        await statsExpectSuggestions(
          'from a | stats avg(b) by c, col0 = ',
          [
            getDateHistogramCompletionItem().text,
            ...getFieldNamesByType('any'),
            ...allEvalFunctionsForStats,
            ...allGroupingFunctions,
          ],
          mockCallbacks
        );
      });

      test('on space after expression right hand side operand', async () => {
        await statsExpectSuggestions('from a | stats avg(b) by doubleField % 2 ', [
          '\n',
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS_BY,
            'any',
            {
              operators: true,
              skipAssign: true,
            },
            ['double']
          ),
        ]);

        await statsExpectSuggestions('from a | stats avg(doubleField) by (integerField) ', [
          '\n',
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.STATS_BY,
            'any',
            {
              operators: true,
              skipAssign: true,
            },
            ['integer']
          ),
        ]);

        await statsExpectSuggestions(
          'from a | stats col0 = AVG(doubleField) BY col1 = BUCKET(dateField, 1 day) ',
          [
            '\n',
            ', ',
            '| ',
            ...getFunctionSignaturesByReturnType(
              Location.STATS_BY,
              'any',
              {
                operators: true,
                skipAssign: true,
              },
              ['date']
            ),
          ]
        );
      });

      test('after NOT keyword', async () => {
        await statsExpectSuggestions(
          'FROM logs-apache_error | STATS count() by keywordField <= textField NOT ',
          getOperatorSuggestions(
            [...patternMatchOperators, ...inOperators].filter((op) => !op.name.startsWith('not '))
          )
        );
      });

      test('within bucket()', async () => {
        const expectedFields = getFieldNamesByType([
          'date',
          'date_nanos',
          ...ESQL_COMMON_NUMERIC_TYPES,
        ]);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFields.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'FROM a | STATS COUNT() BY BUCKET(, 50, ?_tstart, ?_tend)',
          [
            // Note there's no space or comma in the suggested field names
            ...getFieldNamesByType(['date', 'date_nanos', ...ESQL_COMMON_NUMERIC_TYPES]),
            ...getFunctionSignaturesByReturnType(
              Location.EVAL,
              ['date', 'date_nanos', ...ESQL_COMMON_NUMERIC_TYPES],
              {
                scalar: true,
              }
            ),
          ],
          mockCallbacks,
          mockContext,
          33
        );
        await statsExpectSuggestions(
          'FROM a | STATS COUNT() BY BUCKET( , 50, ?_tstart, ?_tend)',
          [
            // Note there's no space or comma in the suggested field names
            ...getFieldNamesByType(['date', 'date_nanos', ...ESQL_COMMON_NUMERIC_TYPES]),
            ...getFunctionSignaturesByReturnType(
              Location.EVAL,
              ['date', 'date_nanos', ...ESQL_COMMON_NUMERIC_TYPES],
              {
                scalar: true,
              }
            ),
          ],
          mockCallbacks,
          mockContext,
          33
        );
        const expectedFields1 = getFieldNamesByType([
          'integer',
          'date_period',
          'time_duration',
        ] as EsqlFieldType[]);
        (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
          expectedFields1.map((name) => ({ label: name, text: name }))
        );
        await statsExpectSuggestions(
          'from a | stats avg(b) by BUCKET(dateField, 50, ?_tstart, ?_tend)',
          [
            // BUCKET second parameter (buckets) has constantOnly: true
            // Types: date_period, integer, time_duration (NOT date, so no ?_tstart/?_tend)
            ...getLiteralsByType('time_duration'),
            PLACEHOLDER_CONFIG.number.snippet,
          ],
          mockCallbacks,
          mockContext,
          43 // at the second argument (buckets) of the bucket function
        );
      });

      describe('date histogram snippet', () => {
        test('uses histogramBarTarget preference when available', async () => {
          const expectedCompletionItem = getDateHistogramCompletionItem(50);

          const suggestions = await suggest('FROM a | STATS BY ');

          expect(suggestions).toContainEqual(expect.objectContaining(expectedCompletionItem));
        });

        test('suggests TBUCKET for TS source command', async () => {
          const expectedCompletionItem = getTimeseriesDateHistogramCompletionItem(50);

          const suggestions = await suggest('TS a | STATS BY ');

          expect(suggestions).toContainEqual(expect.objectContaining(expectedCompletionItem));
          expect(suggestions).not.toContainEqual(
            expect.objectContaining(getDateHistogramCompletionItem(50))
          );
        });

        test('BUCKET constant arguments should not trigger function suggestions', async () => {
          const suggestions = await suggest('FROM a | STATS BY BUCKET(dateField, 50, ');

          const dateHistogramSuggestions = suggestions.filter((s) =>
            s.label?.includes('date histogram')
          );

          expect(dateHistogramSuggestions).toHaveLength(0);
        });
      });

      test('BUCKET should not have duplicate date literal suggestions', async () => {
        const suggestions = await suggest('FROM a | STATS BY BUCKET(dateField, 50, ');

        const labels = suggestions.map((s) => s.label);

        // Check for duplicates
        const labelCounts = new Map<string, number>();
        labels.forEach((label) => {
          labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        });

        const duplicates = Array.from(labelCounts.entries())
          .filter(([, count]) => count > 1)
          .map(([label]) => label);

        expect(duplicates).toEqual([]);
      });

      test('BUCKET with numeric field should NOT show col0 or date histogram at second param', async () => {
        const suggestions = await suggest('FROM a | STATS AVG(b) BY BUCKET(numberField, ');

        const labels = suggestions.map((s) => s.label);

        // Should NOT suggest custom STATS columns like col0
        expect(labels).not.toContain('col0');

        // Should NOT suggest "Add date histogram"
        const dateHistogramSuggestions = labels.filter((l) => l.includes('date histogram'));
        expect(dateHistogramSuggestions).toHaveLength(0);

        // Should NOT suggest date literals (?_tstart, ?_tend) for numeric buckets
        expect(labels).not.toContain('?_tstart');
        expect(labels).not.toContain('?_tend');

        // Should NOT suggest any fields (constantOnly: true)
        expect(labels).not.toContain('numberField');
        expect(labels).not.toContain('dateField');
      });

      test('BUCKET(@timestamp, 1 day should NOT suggest comma (2-param signature complete)', async () => {
        const suggestions = await suggest('FROM a | STATS BY BUCKET(dateField, 1 day ');

        const labels = suggestions.map((s) => s.label);

        // Should NOT suggest comma because 2-param signature is complete
        expect(labels).not.toContain(',');
      });

      test('after comma in BY with assignment should suggest fields and functions', async () => {
        const fields = getFieldNamesByType('any');

        await statsExpectSuggestions(
          'FROM a | STATS BY col = BUCKET(@timestamp, 50, ?_tstart, ?_tend), ',
          [
            ' = ',
            getDateHistogramCompletionItem().text,
            ...fields,
            ...getFunctionSignaturesByReturnType(Location.STATS, 'any', { scalar: true }),
            ...allGroupingFunctions,
          ]
        );
      });
    });
  });
});
