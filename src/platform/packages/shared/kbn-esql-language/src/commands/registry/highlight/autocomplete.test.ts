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
  withCompleteItem,
  pipeCompleteItem,
  newLineCompleteItem,
  commaCompleteItem,
} from '../complete_items';
import { expectSuggestions, suggest } from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { buildConstantsDefinitions } from '../../definitions/utils/literals';

const QUERY_LITERAL = buildConstantsDefinitions([QUERY_TEXT_SNIPPET], '')[0].text;

interface QueryComponents {
  query?: string;
  onClause?: string;
  withClause?: string;
}

const buildHighlightQuery = (components: QueryComponents): string => {
  let query = 'from a | highlight';

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

const expectHighlightSuggestions = async (
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
      'highlight',
      mockCallbacks,
      autocomplete,
      offset
    );
  }

  const results = await suggest(query, context, 'highlight', mockCallbacks, autocomplete, offset);
  const texts = results.map((r) => r.text);

  if (expected.contains?.length) {
    expect(texts).toEqual(expect.arrayContaining(expected.contains));
  }

  if (expected.notContains?.length) {
    expect(texts).not.toEqual(expect.arrayContaining(expected.notContains));
  }
};

describe('HIGHLIGHT Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallbacks = getMockCallbacks();
    (mockCallbacks.getColumnsForQuery as jest.Mock).mockResolvedValue([...lookupIndexFields]);
  });

  describe('Basic command structure', () => {
    test('suggests query literal after HIGHLIGHT keyword', async () => {
      await expectHighlightSuggestions('from a | highlight ', [QUERY_LITERAL], mockCallbacks);
    });

    test('suggests ON keyword after a complete query', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({ query: '"search query"' }) + ' ',
        [onCompleteItem.text],
        mockCallbacks
      );
    });

    test('suggests text and keyword fields after ON keyword', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({ query: '"search query"' }) + ' ON ',
        {
          contains: ['textField', 'keywordField'],
          notContains: ['integerField'],
        },
        mockCallbacks
      );
    });

    test('suggests field continuations after a complete field', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({ query: '"search query"', onClause: 'keywordField' }),
        {
          contains: [
            commaCompleteItem.text.endsWith(' ')
              ? commaCompleteItem.text
              : `${commaCompleteItem.text} `,
            withCompleteItem.text,
            pipeCompleteItem.text,
            'textField',
          ],
        },
        mockCallbacks
      );
    });

    test('suggests more fields after a field list and comma', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({ query: '"search query"', onClause: 'textField,' }) + ' ',
        {
          contains: ['keywordField'],
          notContains: ['integerField'],
        },
        mockCallbacks
      );
    });
  });

  describe('WITH clause functionality', () => {
    test('suggests opening braces when WITH is already typed', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({ query: '"search query"', onClause: 'textField' }) + ' WITH ',
        ['{ $0 }'],
        mockCallbacks
      );
    });

    test('suggests parameter keys inside an empty WITH map', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({ query: '"search query"', onClause: 'textField', withClause: '{ ' }),
        {
          contains: ['"pre_tags": "$0"', '"encoder": "$0"', '"number_of_fragments": '],
        },
        mockCallbacks
      );
    });

    test('does not suggest already-used parameter keys after a comma', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "encoder": "html", ',
        }),
        {
          contains: ['"order": "$0"'],
          notContains: ['"encoder": "$0"'],
        },
        mockCallbacks
      );
    });

    test('suggests predefined values for the encoder parameter', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "encoder": "',
        }),
        ['"default"', '"html"'],
        mockCallbacks
      );
    });

    test('suggests predefined values for the order parameter', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "order": "',
        }),
        ['"none"', '"score"'],
        mockCallbacks
      );
    });

    test('suggests only pipe and newline after a complete WITH map', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "encoder": "html" }',
        }) + ' ',
        [newLineCompleteItem.text, pipeCompleteItem.text],
        mockCallbacks
      );
    });

    test('does not suggest unsupported parameter values', async () => {
      await expectHighlightSuggestions(
        buildHighlightQuery({
          query: '"search query"',
          onClause: 'textField',
          withClause: '{ "unsupported_param": "',
        }),
        [],
        mockCallbacks
      );
    });
  });
});
