/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import {
  mockContext,
  lookupIndexFields,
  getMockCallbacks,
} from '../../../__tests__/commands/context_fixtures';
import { QUERY_TEXT_SNIPPET, autocomplete } from './autocomplete';
import {
  onCompleteItem,
  pipeCompleteItem,
  commaCompleteItem,
  withCompleteItem,
  assignCompletionItem,
} from '../complete_items';
import { Location } from '../types';
import {
  expectSuggestions,
  getFieldNamesByType,
  getFunctionSignaturesByReturnType,
  suggest,
} from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { buildConstantsDefinitions } from '../../definitions/utils/literals';
import {
  logicalOperators,
  comparisonFunctions,
  patternMatchOperators,
  inOperators,
  nullCheckOperators,
} from '../../definitions/all_operators';

// ============================================================================
// Operator Suggestions - Derived from Real Definitions
// ============================================================================

const OPERATOR_SUGGESTIONS = {
  LOGICAL: logicalOperators.map(({ name }) => name.toUpperCase()),
  COMPARISON: comparisonFunctions.map(({ name }) => name.toUpperCase()),
  PATTERN: [...patternMatchOperators.map(({ name }) => name.toUpperCase()), ':'], // ':' is assignment, keep for now
  SET: inOperators.map(({ name }) => name.toUpperCase()),
  EXISTENCE: nullCheckOperators.map(({ name }) => name.toUpperCase()),
};

// Helper to add placeholder to operator labels for test expectations
const addPlaceholder = (operators: string[]) => operators.map((op) => `${op} $0`);

const QUERY_LITERAL = buildConstantsDefinitions([QUERY_TEXT_SNIPPET], '')[0].text;
const NEXT_ACTIONS = [
  '\n',
  withCompleteItem.text,
  commaCompleteItem.text.endsWith(' ') ? commaCompleteItem.text : `${commaCompleteItem.text} `,
  pipeCompleteItem.text,
];

const NEXT_ACTIONS_EXPRESSIONS = [...NEXT_ACTIONS, ...addPlaceholder(OPERATOR_SUGGESTIONS.LOGICAL)];

// ============================================================================
// Query Builder and Test Helpers
// ============================================================================

interface QueryComponents {
  query?: string;
  targetField?: string;
  targetAssignment?: string;
  onClause?: string;
  withClause?: string;
}

const buildRerankQuery = (components: QueryComponents): string => {
  let query = 'from a | rerank';

  if (components.targetField) {
    query += ` ${components.targetField}`;
  }

  if (components.targetAssignment !== undefined) {
    query += ` = ${components.targetAssignment}`;
  }

  if (components.query) {
    query += ` ${components.query}`;
  }

  if (components.onClause) {
    query += ` on ${components.onClause}`;
  }

  if (components.withClause) {
    query += ` with ${components.withClause}`;
  }

  return query;
};

type ExpectedSuggestions = string[] | { contains?: string[]; notContains?: string[] };

const expectRerankSuggestions = async (
  query: string,
  expected: ExpectedSuggestions,
  mockCallbacks?: ICommandCallbacks,
  context = mockContext,
  offset?: number
): Promise<void> => {
  if (Array.isArray(expected)) {
    return expectSuggestions(
      query,
      expected,
      context,
      'rerank',
      mockCallbacks,
      autocomplete,
      offset
    );
  }

  const results = await suggest(query, context, 'rerank', mockCallbacks, autocomplete, offset);
  const texts = results.map((r) => r.text);

  if (expected.contains?.length) {
    expect(texts).toEqual(expect.arrayContaining(expected.contains));
  }

  if (expected.notContains?.length) {
    expect(texts).not.toEqual(expect.arrayContaining(expected.notContains));
  }
};

describe('RERANK Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallbacks = getMockCallbacks();
    (mockCallbacks.getColumnsForQuery as jest.Mock).mockResolvedValue([...lookupIndexFields]);
  });

  // ============================================================================
  // Basic Command Structure Tests
  // ============================================================================

  describe('Basic command structure', () => {
    test('suggests query literal and target field after RERANK keyword', async () => {
      const expectedSuggestions = [QUERY_LITERAL, 'col0 = '];

      (mockCallbacks.getSuggestedUserDefinedColumnName as jest.Mock).mockReturnValue('col0');

      await expectRerankSuggestions('from a | rerank', expectedSuggestions, mockCallbacks);
    });

    test('suggests ON keyword after complete query', async () => {
      await expectRerankSuggestions(buildRerankQuery({ query: '"search query"' }) + ' ', [
        onCompleteItem.text,
      ]);
    });

    test('suggests assignment operator after target field name', async () => {
      await expectRerankSuggestions(buildRerankQuery({ targetField: 'col0' }) + ' ', ['= ']);
    });

    test('suggests assignment operator after target field when earlier command text contains a pipe', async () => {
      await expectRerankSuggestions('from a | eval x = "a|b" | rerank col0 ', ['= ']);
    });

    test('suggests query literal after target field assignment', async () => {
      await expectRerankSuggestions(
        buildRerankQuery({ targetField: 'col0', targetAssignment: '' }),
        { contains: [QUERY_LITERAL] }
      );
    });

    test('suggests ON after complete target field assignment', async () => {
      await expectRerankSuggestions(
        buildRerankQuery({ targetField: 'col0', targetAssignment: '"query"' }) + ' ',
        [onCompleteItem.text]
      );
    });

    test('suggests field columns after ON keyword', async () => {
      const query = buildRerankQuery({ query: '"search query"' }) + ' ON ';

      await expectRerankSuggestions(
        query,
        {
          contains: ['textField', 'keywordField'],
          notContains: ['integerField'],
        },
        mockCallbacks
      );
    });

    test('suggests text and keyword fields after an incomplete assignment in ON clause', async () => {
      const query = `${buildRerankQuery({ query: '"search query"', onClause: 'col0 =' })} `;

      await expectRerankSuggestions(
        query,
        {
          contains: ['textField', 'keywordField'],
          notContains: ['integerField'],
        },
        mockCallbacks
      );
    });

    test('suggests field columns after a list of keyword fields and comma', async () => {
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField, col0 = TRUE, keywordField, integerField,',
        }) + ' ';

      await expectRerankSuggestions(
        query,
        {
          contains: ['textField', 'keywordField'],
          notContains: ['integerField'],
        },
        mockCallbacks
      );
    });

    test('suggests field continuations after selecting a field', async () => {
      const query = buildRerankQuery({ query: '"search query"', onClause: 'keywordField' });

      await expectRerankSuggestions(
        query,
        {
          contains: [
            ', ',
            'WITH { $0 }',
            '| ',
            ...getFieldNamesByType(['text', 'keyword']),
            ...getFunctionSignaturesByReturnType(Location.RERANK, ['text', 'keyword'], {
              scalar: true,
            }),
          ],
        },
        mockCallbacks
      );
    });

    test('suggests continuations after field with more trailing spaces', async () => {
      const query = buildRerankQuery({ query: '"search query"', onClause: 'keywordField' }) + ' ';

      await expectRerankSuggestions(query, NEXT_ACTIONS);
    });
  });

  // ============================================================================
  // Boolean Expression Tests
  // ============================================================================

  describe('Boolean expressions', () => {
    test.each([
      {
        name: 'arithmetic expression (non-boolean)',
        expression: 'integerField = integerField + 1',
      },
      { name: 'function call (non-boolean)', expression: 'integerField = round(integerField)' },
    ])('handles $name correctly', async ({ expression }) => {
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: expression,
        }) + ' ';

      await expectRerankSuggestions(query, {
        notContains: addPlaceholder(OPERATOR_SUGGESTIONS.LOGICAL),
        contains: addPlaceholder(OPERATOR_SUGGESTIONS.COMPARISON),
      });
    });

    test('handles assign item after a list with boolean expressions (this check the quality of our regex)', async () => {
      const complexExpression = 'textField = NOT (keywordField LIKE "a*"), customField';
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: complexExpression + ' ',
        }) + ' ';

      await expectRerankSuggestions(query, [assignCompletionItem.text]);
    });

    test('handles complex nested boolean expressions', async () => {
      const complexExpression = 'textField = NOT (keywordField LIKE "a*") AND (integerField < 10)';
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: complexExpression,
        }) + ' ';

      await expectRerankSuggestions(query, NEXT_ACTIONS_EXPRESSIONS);
    });

    test('suggests next actions after simple field assignment', async () => {
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: 'col0 = keywordField',
        }) + ' ';

      await expectRerankSuggestions(query, {
        contains: NEXT_ACTIONS,
      });
    });
  });

  describe('Terminal operators', () => {
    test.each([
      ...OPERATOR_SUGGESTIONS.COMPARISON.map((op) => [op, '"test_value"']),
      ...OPERATOR_SUGGESTIONS.PATTERN.map((op) => [op, '"pattern*"']),
      ...OPERATOR_SUGGESTIONS.SET.map((op) => [op, '("option1", "option2", "option3")']),
      ...OPERATOR_SUGGESTIONS.EXISTENCE.map((op) => [op, '']),
    ])('Complete %s operator shows continuations', async (operator, value) => {
      const operatorClause = value ? `${operator} ${value}` : operator;
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: `textField = keywordField ${operatorClause}`,
        }) + ' ';

      await expectRerankSuggestions(query, NEXT_ACTIONS_EXPRESSIONS);
    });

    test('handles empty IN list as incomplete expression', async () => {
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField = keywordField IN ()',
        }) + ' ';

      await expectRerankSuggestions(query, {
        notContains: NEXT_ACTIONS_EXPRESSIONS,
      });
    });
  });

  // ============================================================================
  // WITH Clause Tests
  // ============================================================================

  describe('WITH clause functionality', () => {
    test('suggests opening braces with inference_id when WITH is already typed', async () => {
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField',
        }) + ' WITH ';

      await expectRerankSuggestions(query, ['{ "inference_id": "$0" }']);
    });

    test('suggests inference_id key in WITH map', async () => {
      const query = buildRerankQuery({
        query: '"search query"',
        onClause: 'textField',
        withClause: '{ ',
      });

      await expectRerankSuggestions(query, ['"inference_id": "$0"']);
    });

    test('suggests only pipe after complete WITH map', async () => {
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "inference_id": "inference_1" }',
        }) + ' ';

      await expectRerankSuggestions(query, ['\n', pipeCompleteItem.text]);
    });

    test('suggests inference endpoints as the values for inference_id', async () => {
      await expectRerankSuggestions(
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "inference_id": "',
        }),
        ['"inference_1"']
      );
      await expectRerankSuggestions(
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "inference_id": "i',
        }),
        ['"inference_1"']
      );
      await expectRerankSuggestions(
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "inference_id": "inf',
        }),
        ['"inference_1"']
      );
    });

    test('does not suggest anything if all the parameters are already provided', async () => {
      await expectRerankSuggestions(
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "inference_id": "inference_1", ',
        }),
        []
      );
    });

    test('does not suggest anything if the parameter name is unsupported', async () => {
      await expectRerankSuggestions(
        buildRerankQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "unsupported_param": "',
        }),
        []
      );
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================
  describe('Edge cases', () => {
    test('handles dotted field names correctly', async () => {
      const query =
        buildRerankQuery({
          query: '"search query"',
          onClause: 'host.name = TRUE',
        }) + ' ';

      await expectRerankSuggestions(query, NEXT_ACTIONS_EXPRESSIONS);
    });

    test('handles malformed expressions gracefully', async () => {
      const query = buildRerankQuery({
        query: '"search query"',
        onClause: 'textField = keywordField AND',
      });

      await expectRerankSuggestions(query, {
        contains: ['textField', 'keywordField', 'integerField'],
        notContains: NEXT_ACTIONS_EXPRESSIONS,
      });
    });
  });

  // ============================================================================
  // Parrtial Input
  // ============================================================================

  describe('Partial completions and prefixes', () => {
    test.each([
      {
        name: 'LIKE operator',
        partial: 'LI',
        notExpected: addPlaceholder([OPERATOR_SUGGESTIONS.PATTERN[0]]),
      },
      {
        name: 'IN and IS operators',
        partial: 'I',
        notExpected: [
          addPlaceholder([OPERATOR_SUGGESTIONS.SET[0]])[0],
          ...OPERATOR_SUGGESTIONS.EXISTENCE,
        ],
      },
      {
        name: 'NOT operators',
        partial: 'NO',
        notExpected: [
          addPlaceholder([OPERATOR_SUGGESTIONS.SET[1]])[0],
          addPlaceholder([OPERATOR_SUGGESTIONS.PATTERN[1]])[0],
          addPlaceholder([OPERATOR_SUGGESTIONS.PATTERN[3]])[0],
        ],
      },
    ])(
      'does not complete partial $name (strict text/keyword context)',
      async ({ partial, notExpected }) => {
        const query = buildRerankQuery({
          query: '"search query"',
          onClause: `textField = keywordField ${partial}`,
        });

        await expectRerankSuggestions(query, {
          notContains: notExpected,
        });
      }
    );
  });
});
