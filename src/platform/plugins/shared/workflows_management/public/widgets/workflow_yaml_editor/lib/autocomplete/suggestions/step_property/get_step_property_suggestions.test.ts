/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LineCounter, Scalar } from 'yaml';
import { YAMLMap } from 'yaml';
import { monaco } from '@kbn/monaco';
import {
  getStepPropertySuggestions,
  type GetStepPropertySuggestionsContext,
} from './get_step_property_suggestions';

describe('getStepPropertySuggestions', () => {
  const createMockYamlLineCounter = (
    startPos = { line: 1, col: 1 },
    endPos = { line: 1, col: 10 }
  ): LineCounter => {
    const linePosMock = jest.fn();
    linePosMock.mockReturnValueOnce(startPos).mockReturnValueOnce(endPos);
    return { linePos: linePosMock } as unknown as LineCounter;
  };

  const createMockContext = (
    overrides?: Partial<GetStepPropertySuggestionsContext>
  ): GetStepPropertySuggestionsContext => ({
    focusedStepInfo: {
      stepId: '1',
      stepYamlNode: new YAMLMap(),
      lineStart: 1,
      lineEnd: 1,
      stepType: 'custom-type',
      propInfos: {},
    },
    focusedYamlPair: {
      keyNode: { value: 'custom-id', range: [1, 1, 1] } as Scalar,
      valueNode: { value: 'current-value', range: [5, 15, 15] } as Scalar,
      path: ['custom-id'],
    },
    yamlLineCounter: createMockYamlLineCounter(),
    ...overrides,
  });

  const createMockGetPropertyHandler = (
    search: jest.Mock | null = jest.fn().mockResolvedValue([
      { label: 'option-1', value: 'value-1' },
      { label: 'option-2', value: 'value-2' },
    ])
  ) => {
    const handler = search
      ? {
          selection: {
            search,
          },
        }
      : null;
    return jest.fn().mockReturnValue(handler);
  };

  describe('basic functionality', () => {
    it('should return suggestions for custom properties', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest.fn().mockResolvedValue([
          { label: 'custom-label', value: 'custom-value' },
          { label: 'custom-label-2', value: 'custom-value-2' },
        ])
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toHaveLength(2);
      expect(suggestions.map((s) => s.label)).toEqual(['custom-label', 'custom-label-2']);
    });

    it('should call getPropertyHandler with correct arguments for config scope', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'my-config-key', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: ['my-config-key'], // path[0] === key means it's in config
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith('custom-type', 'config', 'my-config-key');
    });

    it('should call getPropertyHandler with correct arguments for input scope', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'my-input-key', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: ['with', 'my-input-key'], // path[0] !== key means it's in input
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith('custom-type', 'input', 'my-input-key');
    });

    it('should pass current value to the search function', async () => {
      const searchMock = jest.fn().mockResolvedValue([]);
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'key', range: [1, 1, 1] } as Scalar,
          valueNode: { value: 'partial-input', range: [5, 15, 15] } as Scalar,
          path: ['key'],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler(searchMock);

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(searchMock).toHaveBeenCalledWith('partial-input', {
        stepType: 'custom-type',
        scope: 'config',
        propertyKey: 'key',
        values: { config: {}, input: {} },
      });
    });
  });

  describe('early return conditions', () => {
    it('should return empty array when focusedStepInfo is null', async () => {
      const context = createMockContext({ focusedStepInfo: null });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
      expect(getPropertyHandler).not.toHaveBeenCalled();
    });

    it('should return empty array when focusedStepInfo.stepType is null', async () => {
      const context = createMockContext({
        focusedStepInfo: {
          stepId: '1',
          stepYamlNode: new YAMLMap(),
          lineStart: 1,
          lineEnd: 1,
          stepType: null as unknown as string,
          propInfos: {},
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
      expect(getPropertyHandler).not.toHaveBeenCalled();
    });

    it('should return empty array when focusedStepInfo.stepType is undefined', async () => {
      const context = createMockContext({
        focusedStepInfo: {
          stepId: '1',
          stepYamlNode: new YAMLMap(),
          lineStart: 1,
          lineEnd: 1,
          stepType: undefined as unknown as string,
          propInfos: {},
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when focusedYamlPair is null', async () => {
      const context = createMockContext({ focusedYamlPair: null });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
      expect(getPropertyHandler).not.toHaveBeenCalled();
    });

    it('should return empty array when focusedYamlPair.valueNode is null', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'key', range: [1, 1, 1] } as Scalar,
          valueNode: null as unknown as Scalar,
          path: ['key'],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when focusedYamlPair.valueNode.range is null', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'key', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: null } as unknown as Scalar,
          path: ['key'],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when yamlLineCounter is null', async () => {
      const context = createMockContext({ yamlLineCounter: null as unknown as LineCounter });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when path is empty', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'some-key', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: [],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });
  });

  describe('property handler edge cases', () => {
    it('should return empty array when getPropertyHandler returns null', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(null);

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when propertyHandler.selection is null', async () => {
      const context = createMockContext();
      const getPropertyHandler = jest.fn().mockReturnValue(null);

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when propertyHandler.selection.search is undefined', async () => {
      const context = createMockContext();
      const getPropertyHandler = jest.fn().mockReturnValue({
        selection: {
          search: undefined,
        },
      });

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when completions array is empty', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(jest.fn().mockResolvedValue([]));

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toEqual([]);
    });
  });

  describe('config vs input scope detection', () => {
    it('should detect config scope when path has single element matching key', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'connector-id', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: ['connector-id'],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith('custom-type', 'config', 'connector-id');
    });

    it('should detect input scope when path first element differs from key', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'message', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: ['with', 'message'],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith('custom-type', 'input', 'message');
    });

    it('should detect input scope when path is deeply nested', async () => {
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'nested-prop', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: ['with', 'config', 'deeply', 'nested-prop'],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith(
        'custom-type',
        'input',
        'config.deeply.nested-prop'
      );
    });
  });

  describe('array element fields', () => {
    it('falls back to the array property handler for an indexed input path', async () => {
      const searchMock = jest.fn().mockResolvedValue([{ label: 'Duplicate', value: 'Duplicate' }]);
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'tags_to_add', range: [1, 1, 1] } as Scalar,
          valueNode: { value: 'Dup', range: [5, 15, 15] } as Scalar,
          path: ['with', 'tags_to_add', '0'],
        },
      });
      const getPropertyHandler = createMockGetPropertyHandler(searchMock);

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith('custom-type', 'input', 'tags_to_add');
      expect(searchMock).toHaveBeenCalledWith('Dup', {
        stepType: 'custom-type',
        scope: 'input',
        propertyKey: 'tags_to_add',
        values: { config: {}, input: {} },
      });
      expect(suggestions.map((s) => s.label)).toEqual(['Duplicate']);
    });

    it('falls back to the array property handler for an indexed config path', async () => {
      const getPropertyHandler = createMockGetPropertyHandler();
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'indices', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: ['indices', '2'],
        },
      });

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith('custom-type', 'config', 'indices');
    });

    it('does not strip a non-trailing numeric segment', async () => {
      const getPropertyHandler = createMockGetPropertyHandler();
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'index', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [5, 15, 15] } as Scalar,
          path: ['with', 'items', '0', 'index'],
        },
      });

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(getPropertyHandler).toHaveBeenCalledWith('custom-type', 'input', 'items.0.index');
    });
  });

  describe('suggestion properties', () => {
    it('should set CompletionItemKind.Value for all suggestions', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest.fn().mockResolvedValue([
          { label: 'opt1', value: 'val1' },
          { label: 'opt2', value: 'val2' },
        ])
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      suggestions.forEach((suggestion) => {
        expect(suggestion.kind).toBe(monaco.languages.CompletionItemKind.Value);
      });
    });

    it('should use completion value as insertText', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest.fn().mockResolvedValue([{ label: 'Display Label', value: 'actual-insert-value' }])
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions[0].insertText).toBe('actual-insert-value');
    });

    it('should include description when provided by selection', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest
          .fn()
          .mockResolvedValue([
            { label: 'option', value: 'val', description: 'This is a description' },
          ])
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions[0].detail).toBe('This is a description');
    });

    it('should include documentation when provided by completion', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest
          .fn()
          .mockResolvedValue([
            { label: 'option', value: 'val', documentation: 'Extended documentation here' },
          ])
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions[0].documentation).toBe('Extended documentation here');
    });

    it('should handle completions without optional fields', async () => {
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest.fn().mockResolvedValue([{ label: 'minimal', value: 'min-val' }])
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions[0].detail).toBeUndefined();
      expect(suggestions[0].documentation).toBeUndefined();
    });
  });

  describe('range calculation', () => {
    it('should calculate correct range from yamlLineCounter', async () => {
      const yamlLineCounter = createMockYamlLineCounter({ line: 5, col: 10 }, { line: 5, col: 25 });
      const context = createMockContext({ yamlLineCounter });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions[0].range).toEqual({
        startLineNumber: 5,
        startColumn: 10,
        endLineNumber: 5,
        endColumn: 25,
      });
    });

    it('should handle multi-line value ranges', async () => {
      const yamlLineCounter = createMockYamlLineCounter({ line: 3, col: 5 }, { line: 6, col: 2 });
      const context = createMockContext({ yamlLineCounter });
      const getPropertyHandler = createMockGetPropertyHandler();

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions[0].range).toEqual({
        startLineNumber: 3,
        startColumn: 5,
        endLineNumber: 6,
        endColumn: 2,
      });
    });

    it('should call linePos with correct offsets from valueNode.range', async () => {
      const linePosMock = jest.fn().mockReturnValue({ line: 1, col: 1 });
      const yamlLineCounter = { linePos: linePosMock } as unknown as LineCounter;
      const context = createMockContext({
        focusedYamlPair: {
          keyNode: { value: 'key', range: [1, 1, 1] } as Scalar,
          valueNode: { value: '', range: [100, 150, 150] } as Scalar,
          path: ['key'],
        },
        yamlLineCounter,
      });
      const getPropertyHandler = createMockGetPropertyHandler();

      await getStepPropertySuggestions(context, getPropertyHandler);

      expect(linePosMock).toHaveBeenCalledWith(100); // startOffset
      expect(linePosMock).toHaveBeenCalledWith(150); // endOffset
    });
  });

  describe('async behavior', () => {
    it('should properly await async search function', async () => {
      const searchMock = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([{ label: 'async-option', value: 'async-value' }]), 10);
          })
      );
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(searchMock);

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].label).toBe('async-option');
    });

    it('should handle rejected promises from search function', async () => {
      const searchMock = jest.fn().mockRejectedValue(new Error('Search failed'));
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(searchMock);

      await expect(getStepPropertySuggestions(context, getPropertyHandler)).rejects.toThrow(
        'Search failed'
      );
    });
  });

  describe('multiple completions', () => {
    it('should handle large number of completions', async () => {
      const manyCompletions = Array.from({ length: 100 }, (_, i) => ({
        label: `option-${i}`,
        value: `value-${i}`,
        detail: `Detail ${i}`,
      }));
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest.fn().mockResolvedValue(manyCompletions)
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions).toHaveLength(100);
      expect(suggestions[0].label).toBe('option-0');
      expect(suggestions[99].label).toBe('option-99');
    });

    it('should preserve order of completions', async () => {
      const orderedCompletions = [
        { label: 'zebra', value: 'z' },
        { label: 'apple', value: 'a' },
        { label: 'mango', value: 'm' },
      ];
      const context = createMockContext();
      const getPropertyHandler = createMockGetPropertyHandler(
        jest.fn().mockResolvedValue(orderedCompletions)
      );

      const suggestions = await getStepPropertySuggestions(context, getPropertyHandler);

      expect(suggestions.map((s) => s.label)).toEqual(['zebra', 'apple', 'mango']);
    });
  });

  describe('different step types', () => {
    it('should pass different step types to getPropertyHandler', async () => {
      const getPropertyHandler = createMockGetPropertyHandler();

      // Test with .slack step type
      const slackContext = createMockContext({
        focusedStepInfo: {
          stepId: '1',
          stepYamlNode: new YAMLMap(),
          lineStart: 1,
          lineEnd: 1,
          stepType: 'slack',
          propInfos: {},
        },
      });
      await getStepPropertySuggestions(slackContext, getPropertyHandler);
      expect(getPropertyHandler).toHaveBeenCalledWith('slack', 'config', 'custom-id');

      getPropertyHandler.mockClear();

      // Test with elasticsearch.index step type
      const esContext = createMockContext({
        focusedStepInfo: {
          stepId: '2',
          stepYamlNode: new YAMLMap(),
          lineStart: 5,
          lineEnd: 10,
          stepType: 'elasticsearch.index',
          propInfos: {},
        },
      });
      await getStepPropertySuggestions(esContext, getPropertyHandler);
      expect(getPropertyHandler).toHaveBeenCalledWith('elasticsearch.index', 'config', 'custom-id');
    });
  });
});
