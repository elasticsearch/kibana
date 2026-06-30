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
import { esqlCommandRegistry } from '..';
import {
  getCommandAutocompleteDefinitions,
  byCompleteItem,
  pipeCompleteItem,
  onCompleteItem,
  asCompletionItem,
} from '../complete_items';
import { Location } from '../types';
import { autocomplete } from './autocomplete';
import {
  expectSuggestions,
  suggest,
  getFieldNamesByType,
  getFunctionSignaturesByReturnType,
} from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import type { FunctionReturnType } from '../../definitions/types';
import {
  ESQL_COMMON_NUMERIC_TYPES,
  ESQL_STRING_TYPES,
  ESQL_NUMBER_TYPES,
} from '../../definitions/types';
import { findAutocompleteAstPosition } from '../../../language/shared/parse_for_autocomplete_query';

const allEvalFnsForWhere = getFunctionSignaturesByReturnType(Location.WHERE, 'any', {
  scalar: true,
});

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

const EMPTY_WHERE_SUGGESTIONS = [...getFieldNamesByType('any'), ...allEvalFnsForWhere];

const EXPECTED_COMPARISON_WITH_TEXT_FIELD_SUGGESTIONS = [
  ...getFieldNamesByType(['text', 'keyword', 'ip', 'version']),
  ...getFunctionSignaturesByReturnType(Location.WHERE, ['text', 'keyword', 'ip', 'version'], {
    scalar: true,
  }),
];

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
const ACOS_TYPES = [...ESQL_COMMON_NUMERIC_TYPES, 'unsigned_long'] as const;

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

type ExpectedSuggestions = string[] | { contains?: string[]; notContains?: string[] };

const forkExpectSuggestions = async (
  query: string,
  expected: ExpectedSuggestions,
  mockCallbacks?: ICommandCallbacks,
  context = mockContext,
  offset?: number
): Promise<void> => {
  if (Array.isArray(expected)) {
    return expectSuggestions(query, expected, context, 'fork', mockCallbacks, autocomplete, offset);
  }

  const results = await suggest(query, context, 'fork', mockCallbacks, autocomplete, offset);
  const texts = results.map(({ text }) => text);

  if (expected.contains?.length) {
    expect(texts).toEqual(expect.arrayContaining(expected.contains));
  }

  if (expected.notContains?.length) {
    expect(texts).not.toEqual(expect.arrayContaining(expected.notContains));
  }
};

describe('FORK Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks before each test to ensure isolation
    mockCallbacks = getMockCallbacks();
    (mockCallbacks.getColumnsForQuery as jest.Mock).mockResolvedValue([...lookupIndexFields]);
  });
  describe('FORK ...', () => {
    test('suggests new branch on empty command', async () => {
      await forkExpectSuggestions('FROM a | FORK ', ['($0)']);
      await forkExpectSuggestions('FROM a | fork ', ['($0)']);
    });

    test('suggests pipe and new branch after complete branch', async () => {
      await forkExpectSuggestions('FROM a | FORK (LIMIT 100) ', ['($0)', '| ', '\n']);
      await forkExpectSuggestions('FROM a | FORK (LIMIT 100) (SORT keywordField ASC) ', [
        '($0)',
        '| ',
        '\n',
      ]);
    });

    describe('(COMMAND ... | COMMAND ...)', () => {
      const forkCommands = esqlCommandRegistry
        .getProcessingCommandNames()
        .filter((cmd) => cmd !== 'fork');

      const FORK_SUBCOMMANDS = getCommandAutocompleteDefinitions(forkCommands).map(
        (item) => item.text
      );

      it('suggests FORK sub commands in an open branch', async () => {
        await forkExpectSuggestions('FROM a | FORK (', FORK_SUBCOMMANDS);
        await forkExpectSuggestions('FROM a | FORK (WHERE 1) (', FORK_SUBCOMMANDS);
      });

      describe('delegation to subcommands', () => {
        test('where', async () => {
          await forkExpectSuggestions('FROM a | FORK (WHERE ', EMPTY_WHERE_SUGGESTIONS);
          await forkExpectSuggestions('FROM a | FORK (WHERE key', EMPTY_WHERE_SUGGESTIONS);
          const expectedFields = getFieldNamesByType(['text', 'keyword', 'ip', 'version']);
          (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
            expectedFields.map((name) => ({ label: name, text: name }))
          );
          await forkExpectSuggestions(
            'FROM a | FORK (WHERE textField != ',
            EXPECTED_COMPARISON_WITH_TEXT_FIELD_SUGGESTIONS,
            mockCallbacks
          );
          await forkExpectSuggestions(
            'FROM a | FORK (WHERE textField != text ',
            EXPECTED_COMPARISON_WITH_TEXT_FIELD_SUGGESTIONS,
            mockCallbacks
          );
        });

        test('limit', async () => {
          await forkExpectSuggestions('FROM a | FORK (LIMIT ', ['10 ', '100 ', '1000 ']);
        });

        test('sort', async () => {
          await forkExpectSuggestions(
            'FROM a | FORK (SORT ',
            EXPECTED_FIELD_AND_FUNCTION_SUGGESTIONS
          );
          await forkExpectSuggestions(
            'FROM a | FORK (LIMIT 1) (SORT ',
            EXPECTED_FIELD_AND_FUNCTION_SUGGESTIONS
          );
          await forkExpectSuggestions('FROM a | FORK (SORT integerField ', [
            'ASC',
            'DESC',
            ', ',
            '| ',
            '\n',
            'NULLS FIRST',
            'NULLS LAST',
            ...getFunctionSignaturesByReturnType(
              Location.SORT,
              'any',
              {
                operators: true,
              },
              ['integer']
            ),
          ]);
        });

        test('dissect', async () => {
          const expectedFields = getFieldNamesByType(ESQL_STRING_TYPES);
          (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
            expectedFields.map((name) => ({ label: name, text: name }))
          );
          await forkExpectSuggestions(
            'FROM a | FORK (DISSECT ',
            getFieldNamesByType(ESQL_STRING_TYPES).map((name) => `${name} `),
            mockCallbacks
          );
          await forkExpectSuggestions(
            'FROM a | FORK (DISSECT keywordField ',
            ['"%{firstWord}" '],
            mockCallbacks
          );
          await forkExpectSuggestions(
            'FROM a | FORK (DISSECT keywordField "" ',
            ['APPEND_SEPARATOR = ', '| ', '\n'],
            mockCallbacks
          );
        });

        test('keep', async () => {
          await forkExpectSuggestions('FROM a | FORK (KEEP ', [...getFieldNamesByType('any')]);
          await forkExpectSuggestions('FROM a | FORK (KEEP integerField ', [',', '| ', '\n']);
        });

        test('drop', async () => {
          await forkExpectSuggestions('FROM a | FORK (DROP ', [...getFieldNamesByType('any')]);
          await forkExpectSuggestions('FROM a | FORK (DROP integerField ', [',', '| ', '\n']);
        });

        test('mv_expand', async () => {
          await forkExpectSuggestions('FROM a | FORK (MV_EXPAND ', getFieldNamesByType('any'));
          await forkExpectSuggestions('FROM a | FORK (MV_EXPAND integerField ', ['| ', '\n']);
        });

        test('sample', async () => {
          await forkExpectSuggestions('FROM a | FORK (SAMPLE ', ['.001 ', '.01 ', '.1 ']);
          await forkExpectSuggestions('FROM a | FORK (SAMPLE 0.01 ', ['| ', '\n']);
        });

        test('rename', async () => {
          await forkExpectSuggestions('FROM a | FORK (RENAME ', [
            ' = ',
            ...getFieldNamesByType('any'),
          ]);
          await forkExpectSuggestions('FROM a | FORK (RENAME textField ', ['AS ']);
          await forkExpectSuggestions('FROM a | FORK (RENAME field ', ['= ']);
        });

        test('change_point', async () => {
          const expectedFields = getFieldNamesByType(ESQL_NUMBER_TYPES);
          (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
            expectedFields.map((name) => ({ label: name, text: name }))
          );
          await forkExpectSuggestions(
            `FROM a | FORK (CHANGE_POINT `,
            getFieldNamesByType(ESQL_NUMBER_TYPES),
            mockCallbacks
          );
          await forkExpectSuggestions(
            `FROM a | FORK (CHANGE_POINT value `,
            [
              onCompleteItem.text,
              asCompletionItem.text,
              byCompleteItem.text,
              pipeCompleteItem.text,
              '\n',
            ],
            mockCallbacks
          );
          const expectedFieldsAny = getFieldNamesByType('any');
          (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
            expectedFieldsAny.map((name) => ({ label: name, text: name }))
          );
          await forkExpectSuggestions(
            `FROM a | FORK (CHANGE_POINT value on `,
            getFieldNamesByType('any'),
            mockCallbacks
          );
        });

        test('lookup join after command name', async () => {
          await forkExpectSuggestions('FROM a | FORK (LOOKUP JOIN ', [
            '', // This is the default text that the "Create lookup index" suggestions has if no index name provided.
            'join_index ',
            'join_index_with_alias ',
            'lookup_index ',
            'join_index_alias_1 $0',
            'join_index_alias_2 $0',
          ]);
        });

        test('lookup join after ON keyword', async () => {
          await forkExpectSuggestions(
            'FROM a | FORK (LOOKUP JOIN join_index ON ',
            {
              contains: [
                'textField',
                'keywordField',
                'booleanField',
                'joinIndexOnlyField ',
                'STARTS_WITH($0)',
                'CONTAINS($0)',
              ],
            },
            mockCallbacks
          );
        });

        describe('stats', () => {
          it('suggests for empty expression', async () => {
            await forkExpectSuggestions(
              'FROM a | FORK (STATS ',
              EXPECTED_FOR_FIRST_EMPTY_EXPRESSION
            );
            await forkExpectSuggestions(
              'FROM a | FORK (STATS AVG(integerField), ',
              EXPECTED_FOR_EMPTY_EXPRESSION
            );
          });

          it('suggest within a function', async () => {
            const expectedFields = getFieldNamesByType(AVG_TYPES);
            (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
              expectedFields.map((name) => ({ label: name, text: name }))
            );
            await forkExpectSuggestions(
              'FROM a | FORK (STATS AVG(',
              [
                ...getFieldNamesByType(AVG_TYPES),
                ...getFunctionSignaturesByReturnType(
                  Location.STATS,
                  [...AVG_TYPES, 'aggregate_metric_double'],
                  { scalar: true, grouping: true }
                ),
              ],
              mockCallbacks
            );
            await forkExpectSuggestions(
              'FROM a | FORK (STATS AVG(integerField) BY ACOS(',
              [
                ...getFieldNamesByType(ACOS_TYPES),
                ...getFunctionSignaturesByReturnType(
                  Location.STATS,
                  ACOS_TYPES,
                  {
                    scalar: true,
                    grouping: true,
                  },
                  undefined,
                  ['acos']
                ),
              ],
              mockCallbacks
            );
          });

          it('supports STATS ... WHERE', async () => {
            await forkExpectSuggestions(
              'FROM a | FORK (STATS AVG(integerField) WHERE integerField ',
              [
                ...getFunctionSignaturesByReturnType(
                  Location.STATS_WHERE,
                  'any',
                  { operators: true, skipAssign: true },
                  ['integer']
                ),
              ]
            );
          });
        });

        describe('eval', () => {
          it('suggests for empty expression', async () => {
            const emptyExpressionSuggestions = [
              ' = ',
              ...getFieldNamesByType('any'),
              ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
            ];
            await forkExpectSuggestions('FROM a | FORK (EVAL ', emptyExpressionSuggestions);
            await forkExpectSuggestions(
              'FROM a | FORK (EVAL ACOS(integerField), ',
              emptyExpressionSuggestions
            );
          });

          it('suggests within a function', async () => {
            const expectedFields = getFieldNamesByType([
              'integer',
              'long',
              'unsigned_long',
              'double',
            ]);
            (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
              expectedFields.map((name) => ({ label: name, text: name }))
            );
            await forkExpectSuggestions(
              'FROM a | FORK (EVAL ACOS( ',
              [
                ...expectedFields,
                ...getFunctionSignaturesByReturnType(
                  Location.STATS,
                  ['integer', 'long', 'unsigned_long', 'double'],
                  {
                    scalar: true,
                  },
                  undefined,
                  ['acos']
                ),
              ],
              mockCallbacks
            );
          });
        });
      });

      it('suggests pipe after complete subcommands', async () => {
        const assertSuggestsPipe = async (query: string) => {
          const cursorPosition = query.length;
          const { command } = findAutocompleteAstPosition(query, cursorPosition);
          if (!command) {
            throw new Error('Command not found in the parsed query');
          }
          const suggestions = await autocomplete(
            query,
            command,
            mockCallbacks,
            mockContext,
            cursorPosition
          );
          expect(suggestions.map(({ text }) => text)).toContain('| ');
        };

        await assertSuggestsPipe('FROM a | FORK (WHERE keywordField IS NOT NULL ');
        await assertSuggestsPipe('FROM a | FORK (LIMIT 1234 ');
        await assertSuggestsPipe('FROM a | FORK (SORT keywordField ASC ');
        await assertSuggestsPipe(
          'FROM a | FORK (DISSECT keywordField "%{firstWord}" APPEND_SEPARATOR=":" '
        );
      });

      it('suggests FORK subcommands after in-branch pipe', async () => {
        await forkExpectSuggestions('FROM a | FORK (LIMIT 1234) | (', FORK_SUBCOMMANDS);
        await forkExpectSuggestions(
          'FROM a | FORK (WHERE keywordField IS NULL | LIMIT 1234 | ',
          FORK_SUBCOMMANDS
        );
        await forkExpectSuggestions(
          'FROM a | FORK (SORT longField ASC NULLS LAST) (WHERE keywordField IS NULL | LIMIT 1234 | ',
          FORK_SUBCOMMANDS
        );
      });

      describe('user-defined columns', () => {
        it('suggests user-defined columns from earlier in this branch', async () => {
          await forkExpectSuggestions(
            'FROM a | FORK (EVAL col0 = 1 | EVAL var0 = 2 | WHERE ',
            { contains: ['col0', 'var0'] },
            mockCallbacks
          );
        });

        it('does NOT suggest user-defined columns from another branch', async () => {
          await forkExpectSuggestions(
            'FROM a | FORK (EVAL foo = 1) (WHERE ',
            { notContains: ['foo'] },
            mockCallbacks
          );
        });
      });

      describe('command filtering', () => {
        it('does NOT suggest source commands', async () => {
          const sourceCommands = esqlCommandRegistry.getSourceCommandNames();

          await forkExpectSuggestions(
            'FROM a | FORK (',
            { notContains: sourceCommands.map((cmd) => cmd.toUpperCase() + ' ') },
            mockCallbacks
          );
        });

        it('does NOT suggest hidden processing commands', async () => {
          const hiddenCommands = esqlCommandRegistry.getProcessingCommandNames().filter((cmd) => {
            const commandDef = esqlCommandRegistry.getCommandByName(cmd);
            return commandDef?.metadata?.hidden === true;
          });

          await forkExpectSuggestions(
            'FROM a | FORK (',
            { notContains: hiddenCommands.map((cmd) => cmd.toUpperCase() + ' ') },
            mockCallbacks
          );
        });

        it('does NOT suggest FORK command itself', async () => {
          await forkExpectSuggestions('FROM a | FORK (', { notContains: ['FORK '] }, mockCallbacks);
        });
      });
    });
  });
});
