/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { getMockCallbacks, mockContext } from '../../../__tests__/commands/context_fixtures';
import { autocomplete } from './autocomplete';
import { expectSuggestions } from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { findAutocompleteAstPosition } from '../../../language/shared/parse_for_autocomplete_query';
import { METADATA_FIELDS } from '../options/metadata';
import { getRecommendedQueriesTemplatesFromExtensions } from '../options/recommended_queries';

const metadataFields = [...METADATA_FIELDS].sort();

const editorExtensions = {
  recommendedQueries: [
    {
      name: 'Timeseries rate',
      query: 'TS logs* | STATS SUM(RATE(bytes)',
    },
  ],
  recommendedFields: [],
};

const tsExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext,
  offset?: number
) => {
  const updatedContext = {
    ...context,
    editorExtensions,
  };
  return expectSuggestions(
    query,
    expectedSuggestions,
    updatedContext,
    'ts',
    mockCallbacks,
    autocomplete,
    offset
  );
};

describe('TS Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks before each test to ensure isolation
    mockCallbacks = getMockCallbacks();
  });
  describe('... <sources> ...', () => {
    const suggest = async (query: string) => {
      const cursorPosition = query.length;
      const { command } = findAutocompleteAstPosition(query, cursorPosition);
      if (!command) {
        throw new Error('Command not found in the parsed query');
      }
      return autocomplete(query, command, mockCallbacks, mockContext, cursorPosition);
    };

    test('suggests Browse data sources in empty source slots when enabled', async () => {
      mockCallbacks.canSuggestResourceBrowser = jest.fn().mockResolvedValue(true);

      const suggestions = await suggest('TS ');
      const labels = suggestions.map((s) => s.label);

      expect(labels[0]).toEqual('Browse data sources');
    });

    test('can suggest timeseries indices (and aliases)', async () => {
      const suggestions = await suggest('TS ');
      const labels = suggestions.map((s) => s.label);

      expect(labels).toEqual([
        'timeseries_index',
        'timeseries_index_with_alias',
        'time_series_index',
        'timeseries_index_alias_1',
        'timeseries_index_alias_2',
      ]);
    });

    test('can suggest timeseries after one already selected', async () => {
      const suggestions = await suggest('TS timeseries_index,  ');
      const labels = suggestions.map((s) => s.label);

      expect(labels).toEqual(['timeseries_index_with_alias', 'time_series_index']);
    });

    test('discriminates between indices and aliases', async () => {
      const suggestions = await suggest('TS ');
      const indices: string[] = suggestions
        .filter((s) => s.detail === 'Timeseries')
        .map((s) => s.label)
        .sort();
      const aliases: string[] = suggestions
        .filter((s) => s.detail === 'Alias')
        .map((s) => s.label)
        .sort();

      expect(indices).toEqual([
        'time_series_index',
        'timeseries_index',
        'timeseries_index_with_alias',
      ]);
      expect(aliases).toEqual(['timeseries_index_alias_1', 'timeseries_index_alias_2']);
    });
  });

  describe('... METADATA <fields>', () => {
    const metadataFieldsAndIndex = metadataFields.filter((field) => field !== '_index');

    test('on <// TS index METADATA field1, /kbd>SPACE</kbd> without comma ",", suggests adding metadata', async () => {
      const extensionsSuggestions = getRecommendedQueriesTemplatesFromExtensions(
        editorExtensions.recommendedQueries
      ).map((s) => s.text);
      const expected = ['\n', 'METADATA ', ',', '| ', ...extensionsSuggestions].sort();

      await tsExpectSuggestions('ts time_series_index ', expected);
    });

    test('on <kbd>SPACE</kbd> after "METADATA" keyword suggests all metadata fields', async () => {
      await tsExpectSuggestions('ts time_series_index METADATA /', metadataFields);
    });

    test('metadata field prefixes', async () => {
      await tsExpectSuggestions('ts time_series_index METADATA _', metadataFields);
      await tsExpectSuggestions('ts time_series_index METADATA _sour', metadataFields);
    });

    test('on <kbd>SPACE</kbd> after "METADATA" column suggests command and pipe operators', async () => {
      await tsExpectSuggestions('ts time_series_index metadata _index ', ['\n', ',', '| ']);
      await tsExpectSuggestions('ts time_series_index metadata _index, _source ', [
        '\n',
        ',',
        '| ',
      ]);
      await tsExpectSuggestions(`ts time_series_index metadata ${METADATA_FIELDS.join(', ')} `, [
        '\n',
        '| ',
      ]);
    });

    test('filters out already used metadata fields', async () => {
      await tsExpectSuggestions('ts time_series_index metadata _index, ', metadataFieldsAndIndex);
    });
  });

  describe('standalone (isStandalone) queries', () => {
    const standaloneExtensions = {
      recommendedQueries: [
        {
          name: 'Search all metrics',
          query: 'TS metrics-*',
          description: 'Searches all available metrics',
          isStandalone: true,
        },
        {
          name: 'Timeseries rate',
          query: 'TS logs* | STATS SUM(RATE(bytes)',
        },
      ],
      recommendedFields: [],
    };

    const contextWithStandalone = {
      ...mockContext,
      editorExtensions: standaloneExtensions,
    };

    const extensionSuggestions = getRecommendedQueriesTemplatesFromExtensions(
      standaloneExtensions.recommendedQueries
    );

    test('standalone suggestion appears after space alongside other suggestions', async () => {
      const expected = [
        '\n',
        'METADATA ',
        ',',
        '| ',
        ...extensionSuggestions.map((s) => s.text),
      ].sort();

      await expectSuggestions(
        'ts timeseries_index ',
        expected,
        contextWithStandalone,
        'ts',
        mockCallbacks,
        autocomplete
      );
    });
  });
});
