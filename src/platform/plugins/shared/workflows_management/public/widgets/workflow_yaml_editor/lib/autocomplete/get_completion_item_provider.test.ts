/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { monaco, YAML_LANG_ID } from '@kbn/monaco';
import {
  getCompletionItemProvider,
  WORKFLOW_COMPLETION_PROVIDER_ID,
} from './get_completion_item_provider';
import {
  clearAllYamlProviders,
  interceptMonacoYamlProvider,
} from './intercept_monaco_yaml_provider';

import { isDeprecatedStepType } from '../../../../../common/schema';

// Mock dependencies
jest.mock('./suggestions/get_suggestions', () => ({
  getSuggestions: jest.fn(() => []),
  isInsideLoopBody: jest.fn(() => false),
}));

jest.mock('./context/build_autocomplete_context', () => ({
  buildAutocompleteContext: jest.fn(() => ({
    path: ['triggers', 0, 'type'],
    linePrefix: '  - type:',
    lineSuffix: '',
    isInEsqlQueryField: false,
  })),
}));

jest.mock('../../../../../common/schema', () => ({
  isDeprecatedStepType: jest.fn(() => false),
}));

describe('getCompletionItemProvider', () => {
  let mockModel: monaco.editor.ITextModel;
  let mockPosition: monaco.Position;
  let mockCompletionContext: monaco.languages.CompletionContext;
  let getState: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAllYamlProviders();
    interceptMonacoYamlProvider();

    mockModel = {
      uri: { toString: () => 'file:///test.yaml' },
      getValueInRange: jest.fn(),
      getLineContent: jest.fn(),
    } as any;

    mockPosition = {
      lineNumber: 1,
      column: 10,
    } as monaco.Position;

    mockCompletionContext = {
      triggerKind: monaco.languages.CompletionTriggerKind.Invoke,
    } as monaco.languages.CompletionContext;

    getState = jest.fn(() => ({} as any));
    (isDeprecatedStepType as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    clearAllYamlProviders();
  });

  describe('provider structure', () => {
    it('should have correct provider ID', () => {
      const provider = getCompletionItemProvider(getState);

      expect((provider as any).__providerId).toBe(WORKFLOW_COMPLETION_PROVIDER_ID);
    });

    it('should have correct trigger characters', () => {
      const provider = getCompletionItemProvider(getState);
      expect(provider.triggerCharacters).toEqual([
        '@',
        '.',
        ' ',
        '"',
        "'",
        '(',
        ':',
        '|',
        '{',
        '[',
        '?',
      ]);
    });
  });

  describe('provideCompletionItems', () => {
    it('should return empty suggestions when autocomplete context is null', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { buildAutocompleteContext } = require('./context/build_autocomplete_context');
      buildAutocompleteContext.mockReturnValueOnce(null);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result).toEqual({
        suggestions: [],
        incomplete: false,
      });
    });

    it('should quote built-in #/kibana/definitions $ref values from monaco-yaml enum completions', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const yamlProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            {
              label: '#/kibana/definitions/alertingV2NotificationGroup',
              insertText: '#/kibana/definitions/alertingV2NotificationGroup',
            },
            {
              label: '#/definitions/UserSchema',
              insertText: '#/definitions/UserSchema',
            },
            {
              label: 'already-quoted',
              insertText: "'#/kibana/definitions/alertingV2NotificationGroup'",
            },
          ],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProvider);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      const byLabel = Object.fromEntries(
        (result?.suggestions ?? []).map((s) => [
          typeof s.label === 'string' ? s.label : s.label.label,
          s.insertText,
        ])
      );
      expect(byLabel['#/kibana/definitions/alertingV2NotificationGroup']).toBe(
        "'#/kibana/definitions/alertingV2NotificationGroup'"
      );
      expect(byLabel['#/definitions/UserSchema']).toBe('#/definitions/UserSchema');
      expect(byLabel['already-quoted']).toBe("'#/kibana/definitions/alertingV2NotificationGroup'");
    });

    it('should merge workflow suggestions with YAML provider suggestions', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([
        {
          label: 'alert',
          insertText: 'alert snippet',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
      ]);

      const yamlProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            {
              label: 'scheduled',
              insertText: 'scheduled',
            },
          ],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProvider);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toHaveLength(2);
      expect(result?.suggestions?.map((s) => s.label)).toEqual(
        expect.arrayContaining(['alert', 'scheduled'])
      );
    });

    it('should filter deprecated step types from workflow and YAML suggestions', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([
        {
          label: 'kibana.createCase',
          insertText: 'kibana.createCase',
          filterText: 'kibana.createCase',
        },
      ]);

      const yamlProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            {
              label: 'kibana.createCaseDefaultSpace',
              insertText: 'kibana.createCaseDefaultSpace',
              filterText: 'kibana.createCaseDefaultSpace',
            },
            {
              label: 'scheduled',
              insertText: 'scheduled',
            },
          ],
          incomplete: false,
        }),
      };

      const deprecatedStepTypes = new Set(['kibana.createCase', 'kibana.createCaseDefaultSpace']);
      (isDeprecatedStepType as jest.Mock).mockImplementation((stepType: string) =>
        deprecatedStepTypes.has(stepType)
      );
      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProvider);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toHaveLength(1);
      expect(result?.suggestions?.[0].label).toBe('scheduled');
    });

    it('should deduplicate duplicate keys across YAML providers, preferring snippets', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const yamlProviderPlain: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            {
              label: 'alert',
              insertText: 'alert', // Plain text, no snippet
            },
          ],
          incomplete: false,
        }),
      };

      const yamlProviderSnippet: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            {
              label: 'alert',
              insertText: 'alert snippet',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            },
          ],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProviderPlain);
      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProviderSnippet);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toHaveLength(1);
      expect(result?.suggestions?.[0].label).toBe('alert');
      expect(result?.suggestions?.[0].insertTextRules).toBe(
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      );
    });

    it('should keep workflow suggestion details when both sources return snippets for same key', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([
        {
          label: 'alert',
          insertText: 'workflow alert snippet',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Workflow trigger',
        },
      ]);

      const yamlProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            {
              label: 'alert',
              insertText: 'yaml alert snippet',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: 'Schema duplicate',
            },
          ],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProvider);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toHaveLength(1);
      expect(result?.suggestions?.[0].detail).toBe('Workflow trigger');
      expect(result?.suggestions?.[0].insertText).toBe('workflow alert snippet');
    });

    it('should keep workflow suggestion when YAML has snippet for same key (workflow wins)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([
        {
          label: 'alert',
          insertText: 'alert',
          detail: 'From workflow',
        },
      ]);

      const yamlProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            {
              label: 'alert',
              insertText: 'alert snippet',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: 'From schema',
            },
          ],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProvider);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toHaveLength(1);
      expect(result?.suggestions?.[0].detail).toBe('From workflow');
      expect(result?.suggestions?.[0].insertText).toBe('alert');
      expect(result?.suggestions?.[0].insertTextRules).toBeUndefined();
    });

    it('should handle multiple YAML providers', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([
        {
          label: 'workflow-suggestion',
          insertText: 'workflow',
        },
      ]);

      const provider1: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [{ label: 'provider1-suggestion', insertText: 'provider1' }],
          incomplete: false,
        }),
      };

      const provider2: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [{ label: 'provider2-suggestion', insertText: 'provider2' }],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider1);
      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider2);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toHaveLength(3);
      expect(result?.suggestions?.map((s) => s.label)).toEqual(
        expect.arrayContaining([
          'workflow-suggestion',
          'provider1-suggestion',
          'provider2-suggestion',
        ])
      );
    });

    it('should set incomplete to true if any provider returns incomplete', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const provider1: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [],
          incomplete: false,
        }),
      };

      const provider2: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [],
          incomplete: true, // This should make the result incomplete
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider1);
      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider2);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.incomplete).toBe(true);
    });

    it('should continue with other providers if one fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const provider1: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockRejectedValue(new Error('Provider 1 failed')),
      };

      const provider2: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [{ label: 'provider2-suggestion', insertText: 'provider2' }],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider1);
      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider2);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      // Should still get suggestions from provider2
      expect(result?.suggestions).toHaveLength(1);
      expect(result?.suggestions?.[0].label).toBe('provider2-suggestion');
    });

    it('should handle providers without provideCompletionItems method', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const provider: Partial<monaco.languages.CompletionItemProvider> = {
        // No provideCompletionItems method
      };

      monaco.languages.registerCompletionItemProvider(
        YAML_LANG_ID,
        provider as monaco.languages.CompletionItemProvider
      );

      const completionProvider = getCompletionItemProvider(getState);
      const result = await completionProvider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toEqual([]);
      expect(result?.incomplete).toBe(false);
    });

    it('should call YAML providers on empty lines outside liquid blocks', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { buildAutocompleteContext } = require('./context/build_autocomplete_context');
      buildAutocompleteContext.mockReturnValueOnce({
        path: [],
        line: '',
        lineUpToCursor: '',
        lineParseResult: { matchType: 'liquid-block-keyword', fullKey: '', match: null },
        isInLiquidBlock: false,
        isInEsqlQueryField: false,
        focusedStepInfo: null,
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const yamlProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [
            { label: 'consts', insertText: 'consts' },
            { label: 'description', insertText: 'description' },
          ],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProvider);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(yamlProvider.provideCompletionItems).toHaveBeenCalled();
      expect(result?.suggestions).toHaveLength(2);
      expect(result?.suggestions?.map((s) => s.label)).toEqual(
        expect.arrayContaining(['consts', 'description'])
      );
    });

    it('should skip YAML providers for liquid-block-keyword when inside a liquid block', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { buildAutocompleteContext } = require('./context/build_autocomplete_context');
      buildAutocompleteContext.mockReturnValueOnce({
        path: ['steps', 0, 'with', 'message'],
        line: '  assign',
        lineUpToCursor: '  assign',
        lineParseResult: { matchType: 'liquid-block-keyword', fullKey: 'assign', match: null },
        isInLiquidBlock: true,
        isInEsqlQueryField: false,
        focusedStepInfo: null,
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const yamlProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue({
          suggestions: [{ label: 'should-not-appear', insertText: 'nope' }],
          incomplete: false,
        }),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, yamlProvider);

      const provider = getCompletionItemProvider(getState);
      const result = await provider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(yamlProvider.provideCompletionItems).not.toHaveBeenCalled();
      expect(result?.suggestions).toHaveLength(0);
    });

    it('should handle providers that return null or undefined', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSuggestions } = require('./suggestions/get_suggestions');
      getSuggestions.mockReturnValueOnce([]);

      const provider1: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue(null),
      };

      const provider2: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: jest.fn().mockResolvedValue(undefined),
      };

      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider1);
      monaco.languages.registerCompletionItemProvider(YAML_LANG_ID, provider2);

      const completionProvider = getCompletionItemProvider(getState);
      const result = await completionProvider.provideCompletionItems!(
        mockModel,
        mockPosition,
        mockCompletionContext,
        {} as monaco.CancellationToken
      );

      expect(result?.suggestions).toEqual([]);
      expect(result?.incomplete).toBe(false);
    });
  });
});
