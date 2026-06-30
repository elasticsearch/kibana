/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import type { monaco } from '@kbn/code-editor';
import { useEsqlCompletion } from './use_esql_completion';

const mockRegisterCompletionItemProvider = jest.fn();
const mockRegisterSignatureHelpProvider = jest.fn();
const mockRegisterHoverProvider = jest.fn();
const mockDisposeCompletion = jest.fn();
const mockDisposeSignature = jest.fn();
const mockDisposeHover = jest.fn();
const mockSuggest = jest.fn();
const mockGetSuggestionProvider = jest.fn();
const mockGetSignatureProvider = jest.fn();
const mockGetHoverProvider = jest.fn();
const mockUseEsqlCallbacks = jest.fn();
const mockUseRuleFormServices = jest.fn();

jest.mock('@kbn/code-editor', () => ({
  ESQL_LANG_ID: 'esql',
  ESQLLang: {
    getSuggestionProvider: (...args: unknown[]) => mockGetSuggestionProvider(...args),
    getSignatureProvider: (...args: unknown[]) => mockGetSignatureProvider(...args),
    getHoverProvider: (...args: unknown[]) => mockGetHoverProvider(...args),
  },
  monaco: {
    languages: {
      registerCompletionItemProvider: (...args: unknown[]) =>
        mockRegisterCompletionItemProvider(...args),
      registerSignatureHelpProvider: (...args: unknown[]) =>
        mockRegisterSignatureHelpProvider(...args),
      registerHoverProvider: (...args: unknown[]) => mockRegisterHoverProvider(...args),
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      CompletionItemKind: { Field: 5, Keyword: 17 },
    },
  },
}));

jest.mock('@kbn/esql-language', () => ({
  suggest: (...args: unknown[]) => mockSuggest(...args),
}));

jest.mock('../../form/hooks/use_esql_callbacks', () => ({
  useEsqlCallbacks: (...args: unknown[]) => mockUseEsqlCallbacks(...args),
}));

jest.mock('../../form/contexts/rule_form_context', () => ({
  useRuleFormServices: () => mockUseRuleFormServices(),
}));

const makeEditor = (id: string) =>
  ({ getModel: () => ({ id }) } as unknown as monaco.editor.IStandaloneCodeEditor);

const getRegisteredProvider = (): monaco.languages.CompletionItemProvider =>
  mockRegisterCompletionItemProvider.mock.calls[0][1];

describe('useEsqlCompletion', () => {
  const canonicalProvideCompletionItems = jest.fn();
  const canonicalResolveCompletionItem = jest.fn((item) => item);
  const signatureProvider = { provideSignatureHelp: jest.fn() };
  const hoverProvider = { provideHover: jest.fn() };

  // The hook's providers / refcount / model registry are module-level. Testing Library's
  // automatic cleanup unmounts every mounted hook after each test, which decrements the
  // refcount to zero and disposes the shared providers, so each test starts from a clean slate.
  beforeEach(() => {
    jest.clearAllMocks();

    mockRegisterCompletionItemProvider.mockReturnValue({ dispose: mockDisposeCompletion });
    mockRegisterSignatureHelpProvider.mockReturnValue({ dispose: mockDisposeSignature });
    mockRegisterHoverProvider.mockReturnValue({ dispose: mockDisposeHover });
    mockUseEsqlCallbacks.mockReturnValue({ getSources: jest.fn(), getColumnsFor: jest.fn() });
    mockUseRuleFormServices.mockReturnValue({
      application: {},
      http: {},
      data: { search: { search: jest.fn() } },
    });
    mockGetSuggestionProvider.mockReturnValue({
      provideCompletionItems: canonicalProvideCompletionItems,
      resolveCompletionItem: canonicalResolveCompletionItem,
    });
    mockGetSignatureProvider.mockReturnValue(signatureProvider);
    mockGetHoverProvider.mockReturnValue(hoverProvider);
  });

  const mount = (baseQuery: string, modelId: string) => {
    const hook = renderHook(() => useEsqlCompletion({ baseQuery }));
    act(() => {
      hook.result.current.onEditorMount(makeEditor(modelId));
    });
    return hook;
  };

  it('registers a single shared set of providers regardless of how many editors mount', () => {
    mount('', 'model-1');
    mount('FROM logs-*', 'model-2');

    expect(mockRegisterCompletionItemProvider).toHaveBeenCalledTimes(1);
    expect(mockRegisterSignatureHelpProvider).toHaveBeenCalledTimes(1);
    expect(mockRegisterHoverProvider).toHaveBeenCalledTimes(1);
    expect(mockRegisterCompletionItemProvider).toHaveBeenCalledWith(
      'esql',
      expect.objectContaining({ provideCompletionItems: expect.any(Function) })
    );
  });

  it('registers ES|QL completion, signature help, and hover providers', () => {
    mount('', 'model-1');

    expect(mockRegisterCompletionItemProvider).toHaveBeenCalledWith(
      'esql',
      expect.objectContaining({ provideCompletionItems: expect.any(Function) })
    );
    expect(mockRegisterSignatureHelpProvider).toHaveBeenCalledWith('esql', signatureProvider);
    expect(mockRegisterHoverProvider).toHaveBeenCalledWith('esql', hoverProvider);

    // Signature help / hover are built from callbacks exposing both getSources and getColumnsFor.
    const callbacksMatcher = expect.objectContaining({
      getSources: expect.any(Function),
      getColumnsFor: expect.any(Function),
    });
    expect(mockGetSignatureProvider).toHaveBeenCalledWith(callbacksMatcher);
    expect(mockGetHoverProvider).toHaveBeenCalledWith(callbacksMatcher);
  });

  it('registers the completion provider with the split-query trigger characters', () => {
    mount('', 'model-1');
    const provider = getRegisteredProvider();

    expect(provider.triggerCharacters).toEqual(expect.arrayContaining([' ', ',', '.', '|', '(']));
  });

  it('returns no suggestions for models it does not own', async () => {
    mount('', 'model-1');
    const provider = getRegisteredProvider();

    const result = await provider.provideCompletionItems(
      { id: 'unknown-model' } as unknown as monaco.editor.ITextModel,
      { lineNumber: 1, column: 1 } as monaco.Position,
      {} as monaco.languages.CompletionContext,
      {} as monaco.CancellationToken
    );

    expect(result).toEqual({ suggestions: [] });
    expect(mockSuggest).not.toHaveBeenCalled();
    expect(canonicalProvideCompletionItems).not.toHaveBeenCalled();
  });

  it('prepends the base query and calls suggest for a split block editor', async () => {
    const baseQuery = 'FROM logs-*\n| STATS count = COUNT(*) BY host.name';
    mockSuggest.mockResolvedValue([
      {
        label: 'count',
        text: 'count',
        kind: 'Field',
        detail: 'number',
        sortText: '1',
        filterText: 'count',
      },
    ]);

    mount(baseQuery, 'block-model');
    const provider = getRegisteredProvider();

    const model = {
      id: 'block-model',
      getValue: () => '| WHERE co',
      getOffsetAt: jest.fn(() => 10),
      getWordUntilPosition: jest.fn(() => ({ startColumn: 9, endColumn: 11 })),
    } as unknown as monaco.editor.ITextModel;
    const position = { lineNumber: 1, column: 11 } as monaco.Position;

    const result = await provider.provideCompletionItems(
      model,
      position,
      {} as monaco.languages.CompletionContext,
      {} as monaco.CancellationToken
    );

    expect(mockSuggest).toHaveBeenCalledWith(
      `${baseQuery} | WHERE co`,
      baseQuery.length + 1 + 10,
      expect.objectContaining({ getColumnsFor: expect.any(Function) })
    );
    expect(result?.suggestions).toEqual([
      expect.objectContaining({
        label: 'count',
        insertText: 'count',
        kind: 5,
        range: { startLineNumber: 1, endLineNumber: 1, startColumn: 9, endColumn: 11 },
      }),
    ]);
    expect(canonicalProvideCompletionItems).not.toHaveBeenCalled();
  });

  it('delegates to the canonical provider for editors without a base query', async () => {
    const canonicalResult = { suggestions: [{ label: 'FROM' }] };
    canonicalProvideCompletionItems.mockResolvedValue(canonicalResult);

    mount('', 'single-model');
    const provider = getRegisteredProvider();

    const model = {
      id: 'single-model',
      getValue: () => 'FROM lo',
    } as unknown as monaco.editor.ITextModel;
    const position = { lineNumber: 1, column: 8 } as monaco.Position;
    const context = {} as monaco.languages.CompletionContext;
    const token = {} as monaco.CancellationToken;

    const result = await provider.provideCompletionItems(model, position, context, token);

    expect(canonicalProvideCompletionItems).toHaveBeenCalledWith(model, position, context, token);
    expect(result).toBe(canonicalResult);
    expect(mockSuggest).not.toHaveBeenCalled();
    // The canonical provider is built from callbacks exposing both getSources and getColumnsFor.
    expect(mockGetSuggestionProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        getSources: expect.any(Function),
        getColumnsFor: expect.any(Function),
      })
    );
  });

  it('resolves completion items via the canonical provider', async () => {
    const resolvedItem = { label: 'count', documentation: 'docs' };
    canonicalResolveCompletionItem.mockReturnValue(resolvedItem);

    mount('', 'single-model');
    const provider = getRegisteredProvider();

    const item = { label: 'count' } as monaco.languages.CompletionItem;
    const result = provider.resolveCompletionItem!(item, {} as monaco.CancellationToken);

    expect(canonicalResolveCompletionItem).toHaveBeenCalledWith(item, expect.anything());
    expect(result).toBe(resolvedItem);
  });

  it('disposes the completion, signature, and hover providers only after the last editor unmounts', () => {
    const hook1 = mount('', 'model-1');
    const hook2 = mount('', 'model-2');

    hook1.unmount();
    expect(mockDisposeCompletion).not.toHaveBeenCalled();
    expect(mockDisposeSignature).not.toHaveBeenCalled();
    expect(mockDisposeHover).not.toHaveBeenCalled();

    hook2.unmount();
    expect(mockDisposeCompletion).toHaveBeenCalledTimes(1);
    expect(mockDisposeSignature).toHaveBeenCalledTimes(1);
    expect(mockDisposeHover).toHaveBeenCalledTimes(1);
  });
});
