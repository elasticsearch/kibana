/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext } from '../../../__tests__/commands/context_fixtures';
import { validate } from './validate';
import { expectErrors } from '../../../__tests__/commands/validation';
import type { ICommandContext } from '../types';

const statsExpectErrors = (query: string, expectedErrors: string[], context = mockContext) => {
  return expectErrors(query, expectedErrors, context, 'stats', validate);
};

describe('STATS Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('STATS <aggregates> [ BY <grouping> ]', () => {
    const newColumns = new Map(mockContext.columns);
    newColumns.set('doubleField * 3.281', {
      name: 'doubleField * 3.281',
      type: 'double',
      location: { min: 0, max: 10 },
      userDefined: true,
    });
    newColumns.set('avg_doubleField', {
      name: 'avg_doubleField',
      type: 'double',
      location: { min: 0, max: 10 },
      userDefined: true,
    });
    const context: ICommandContext = {
      ...mockContext,
      columns: newColumns,
    };
    test('no errors on correct usage', () => {
      statsExpectErrors('from a_index | stats by textField', []);
      statsExpectErrors(
        `FROM index
            | EVAL doubleField * 3.281
            | STATS avg_doubleField = AVG(\`doubleField * 3.281\`)`,
        [],
        context
      );
      statsExpectErrors(
        `FROM index | STATS AVG(doubleField) by round(doubleField) + 1 | EVAL \`round(doubleField) + 1\` / 2`,
        [],
        context
      );
    });

    describe('... <aggregates> ...', () => {
      test('no errors on correct usage', () => {
        statsExpectErrors('from a_index | stats avg(doubleField) by 1', []);
        statsExpectErrors('from a_index | stats count(`doubleField`)', []);
        statsExpectErrors('from a_index | stats count(*)', []);
        statsExpectErrors('from a_index | stats count()', []);
        statsExpectErrors('from a_index | stats col0 = count(*)', []);
        statsExpectErrors('from a_index | stats col0 = count()', []);
        statsExpectErrors('from a_index | stats col0 = avg(doubleField), count(*)', []);
        statsExpectErrors(`from a_index | stats sum(case(false, 0, 1))`, []);
        statsExpectErrors(`from a_index | stats col0 = sum( case(false, 0, 1))`, []);
        statsExpectErrors('from a_index | stats ??func(doubleField)', []);
        statsExpectErrors('from a_index | stats avg(??field)', []);

        // "or" must accept "null"
        statsExpectErrors('from a_index | stats count(textField == "a" or null)', []);
      });

      test('sub-command can reference aggregated field', () => {
        for (const subCommand of ['keep', 'drop', 'eval']) {
          statsExpectErrors(
            'from a_index | stats count(`doubleField`) | ' +
              subCommand +
              ' `count(``doubleField``)` ',
            []
          );
        }
      });

      test('sub-command can reference aggregated field from WHERE clause', () => {
        statsExpectErrors(
          'from a_index | stats top10count = sum(doubleField) WHERE textField == "a" | eval result = top10count + 1',
          []
        );
      });

      test('CASE function can reference aggregated field from WHERE clause', () => {
        statsExpectErrors(
          'from a_index | stats top10count = sum(doubleField) WHERE textField == "a" | eval result = CASE(textField == "b", top10count, 0)',
          []
        );
      });

      test('errors when input is not an aggregate function', () => {
        statsExpectErrors('from a_index | stats doubleField ', [
          'Expected an aggregate function or group but got "doubleField" of type FieldAttribute',
        ]);
      });

      test('allows bare fields in STATS when source command is TS', () => {
        statsExpectErrors('TS a_index | stats doubleField', []);
      });

      test('various errors', () => {
        statsExpectErrors('from a_index | stats avg(doubleField) by wrongField', [
          'Unknown column "wrongField"',
        ]);
        statsExpectErrors('from a_index | stats avg(doubleField) by wrongField + 1', [
          'Unknown column "wrongField"',
        ]);
        statsExpectErrors('from a_index | stats avg(doubleField) by col0 = wrongField + 1', [
          'Unknown column "wrongField"',
        ]);
        statsExpectErrors('from a_index | stats col0 = avg(fn(number)), count(*)', [
          'Unknown function FN',
        ]);
      });

      test('allows WHERE clause', () => {
        statsExpectErrors('FROM a_index | STATS col0 = avg(doubleField) WHERE 123', []);
      });

      test('allows IN operator in WHERE clause', () => {
        statsExpectErrors(
          'FROM a_index | STATS col0 = avg(doubleField) WHERE textField IN ("a", "b")',
          []
        );
        statsExpectErrors(
          'FROM a_index | STATS col0 = avg(doubleField) WHERE doubleField IN (doubleField, doubleField)',
          []
        );
      });

      test('allows NOT IN operator in WHERE clause', () => {
        statsExpectErrors(
          'FROM a_index | STATS col0 = avg(doubleField) WHERE textField NOT IN ("a", "b")',
          []
        );
      });
    });

    describe('... BY <grouping>', () => {
      test('no errors on correct usage', () => {
        statsExpectErrors(
          'from a_index | stats avg(doubleField), percentile(doubleField, 50) by ipField',
          []
        );
        statsExpectErrors(
          'from a_index | stats avg(doubleField), percentile(doubleField, 50) BY ipField',
          []
        );
        statsExpectErrors(
          'from a_index | stats avg(doubleField), percentile(doubleField, 50) + 1 by ipField',
          []
        );
        statsExpectErrors('from a_index | stats avg(doubleField) by ??field', []);
        for (const op of ['+', '-', '*', '/', '%']) {
          statsExpectErrors(
            `from a_index | stats avg(doubleField) ${op} percentile(doubleField, 50) BY ipField`,
            []
          );
        }
      });

      test('various errors', () => {
        statsExpectErrors('from a_index | stats avg(doubleField) by percentile(doubleField, 20)', [
          'Function PERCENTILE not allowed in BY',
        ]);
        statsExpectErrors(
          'from a_index | stats avg(doubleField) by textField, percentile(doubleField, 50) by ipField',
          ['Function PERCENTILE not allowed in BY']
        );
      });

      const parenthesizedByErrors: Array<[string, string[]]> = [
        ['from a_index | stats avg(doubleField) by (wrongField)', ['Unknown column "wrongField"']],
        [
          'from a_index | stats avg(doubleField) by (percentile(doubleField, 20))',
          ['Function PERCENTILE not allowed in BY'],
        ],
      ];

      test.each(parenthesizedByErrors)(
        'validates errors inside parenthesized BY expressions: %s',
        (query, expectedErrors) => {
          statsExpectErrors(query, expectedErrors);
        }
      );

      describe('constant-only parameters', () => {
        test('no errors', () => {
          statsExpectErrors('from index | stats by bucket(dateField, 1 + 30 / 10, "", "")', []);
          statsExpectErrors(
            'from index | stats by bucket(dateField, 1 + 30 / 10, concat("", ""), "")',
            []
          );
        });
      });
    });

    describe('nesting', () => {
      const NESTING_LEVELS = 4;
      const NESTED_DEPTHS = Array(NESTING_LEVELS)
        .fill(0)
        .map((_, i) => i + 1);

      for (const nesting of NESTED_DEPTHS) {
        describe(`depth = ${nesting}`, () => {
          describe('operators', () => {
            const operatorsWrapping = Array(nesting).fill('+1').join('');

            test('no errors', () => {
              statsExpectErrors(
                `from a_index | stats 5 + avg(doubleField) ${operatorsWrapping}`,
                []
              );
              statsExpectErrors(
                `from a_index | stats 5 ${operatorsWrapping} + avg(doubleField)`,
                []
              );
            });
          });

          describe('EVAL', () => {
            const evalWrapping = Array(nesting).fill('round(').join('');
            const closingWrapping = Array(nesting).fill(')').join('');

            test('no errors', () => {
              statsExpectErrors(
                `from a_index | stats ${evalWrapping} sum(doubleField) ${closingWrapping}`,
                []
              );
              statsExpectErrors(
                `from a_index | stats ${evalWrapping} sum(doubleField) ${closingWrapping} + ${evalWrapping} sum(doubleField) ${closingWrapping}`,
                []
              );
              statsExpectErrors(
                `from a_index | stats ${evalWrapping} sum(doubleField + doubleField) ${closingWrapping}`,
                []
              );
              statsExpectErrors(
                `from a_index | stats ${evalWrapping} sum(doubleField + round(doubleField)) ${closingWrapping}`,
                []
              );
              statsExpectErrors(
                `from a_index | stats ${evalWrapping} sum(doubleField + round(doubleField)) ${closingWrapping} + ${evalWrapping} sum(doubleField + round(doubleField)) ${closingWrapping}`,
                []
              );
              statsExpectErrors(
                `from a_index | stats sum(${evalWrapping} doubleField ${closingWrapping} )`,
                []
              );
              statsExpectErrors(
                `from a_index | stats sum(${evalWrapping} doubleField ${closingWrapping} ) + sum(${evalWrapping} doubleField ${closingWrapping} )`,
                []
              );
            });
          });
        });
      }
    });
  });
});
