/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef } from 'react';
import { suggest } from '@kbn/esql-language';
import { ESQLLang, ESQL_LANG_ID, monaco } from '@kbn/code-editor';
import type { ESQLCallbacks } from '@kbn/esql-types';
import { useEsqlCallbacks } from '../../form/hooks/use_esql_callbacks';
import { useRuleFormServices } from '../../form/contexts/rule_form_context';

/**
 * Context for a single editor model. `baseQuery` and `callbacks` are read lazily
 * at suggestion time so the registered provider always sees the latest values
 * without needing to be re-registered.
 */
interface ModelContext {
  baseQuery: () => string;
  callbacks: () => ESQLCallbacks;
}

/**
 * Module-level singleton state. Exactly **one** set of ES|QL Monaco language providers
 * (completion, signature help, hover) is ever registered on `ESQL_LANG_ID`, regardless
 * of how many editors mount or whether they live inside a flyout. Each editor registers
 * its own model context on mount and removes it on unmount; a refcount disposes the
 * shared providers once the last editor unmounts. This is React Strict-Mode safe
 * (mount → unmount → mount re-registers cleanly via the refcount) and avoids the
 * duplicate-suggestion problem caused by registering more than one provider that answers
 * for the same model.
 */
const modelContexts = new Map<string, ModelContext>();
let disposables: monaco.IDisposable[] = [];
let refCount = 0;

/**
 * Latest callbacks, used by the canonical (non-block) suggestion path. App-wide
 * services are stable so all editors contribute equivalent callbacks.
 */
let currentCallbacks: ESQLCallbacks = {};

/**
 * Stable callbacks wrapper that reads the latest module-level callbacks, so the
 * canonical completion / signature / hover providers never need to be rebuilt when
 * services change.
 */
const stableCallbacks: ESQLCallbacks = {
  getSources: (ctx) => currentCallbacks.getSources?.(ctx) ?? [],
  getColumnsFor: (ctx) => currentCallbacks.getColumnsFor?.(ctx) ?? [],
};

/**
 * The canonical ES|QL suggestion provider (commands, sources, columns, plus rich
 * `resolveCompletionItem` ECS docs). Built lazily and reused for editors that have
 * no base-query prefix (single editor / base tab).
 */
let canonicalProvider: monaco.languages.CompletionItemProvider | null = null;

const getCanonicalProvider = (): monaco.languages.CompletionItemProvider | null => {
  if (!canonicalProvider) {
    canonicalProvider = ESQLLang.getSuggestionProvider?.(stableCallbacks) ?? null;
  }
  return canonicalProvider;
};

const createCompletionProvider = (): monaco.languages.CompletionItemProvider => ({
  // Union of the canonical and split-query trigger characters so autocomplete
  // fires in both modes from the single registered provider.
  triggerCharacters: [' ', ',', '.', '|', '(', '[', '?'],

  async provideCompletionItems(model, position, context, token) {
    const entry = modelContexts.get(model.id);
    // Never answer for models this provider does not own (e.g. ES|QL editors
    // elsewhere in the app, or read-only editors that never registered).
    if (!entry) {
      return { suggestions: [] };
    }

    const rawBase = entry.baseQuery();
    if (!rawBase.trim()) {
      // Single / base editor: delegate to the canonical ES|QL provider (rich docs).
      const canonical = getCanonicalProvider();
      return (
        (await canonical?.provideCompletionItems(model, position, context, token)) ?? {
          suggestions: [],
        }
      );
    }

    // Block editor (alert / recovery): prepend the base query so columns from the
    // base query's output are available for autocomplete in the appended fragment.
    const editorText = model.getValue();
    const fullQuery = `${rawBase} ${editorText}`;
    const editorOffset = model.getOffsetAt(position);
    // Offset into the full query = base length + 1 (for the joining space) + editor offset.
    const fullQueryOffset = rawBase.length + 1 + editorOffset;

    let rawSuggestions: Awaited<ReturnType<typeof suggest>>;
    try {
      rawSuggestions = await suggest(fullQuery, fullQueryOffset, entry.callbacks());
    } catch {
      // Monaco already swallows unhandled rejections from provideCompletionItems,
      // but wrapping here prevents unhandled promise rejection warnings and makes
      // the degradation explicit: autocomplete silently returns nothing on failure.
      return { suggestions: [] };
    }

    // Use word range at cursor — simpler than full range computation and works well
    // for field names, functions, and keywords which are the main autocomplete targets.
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    return {
      suggestions: rawSuggestions.map((s) => ({
        label: s.label,
        insertText: s.text,
        insertTextRules: s.asSnippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        kind: Object.prototype.hasOwnProperty.call(monaco.languages.CompletionItemKind, s.kind)
          ? monaco.languages.CompletionItemKind[
              s.kind as keyof typeof monaco.languages.CompletionItemKind
            ]
          : monaco.languages.CompletionItemKind.Field,
        detail: s.detail,
        sortText: s.sortText,
        filterText: s.filterText,
        range,
      })),
    };
  },

  resolveCompletionItem(item, token) {
    // Join-path items carry no canonical context, so resolve is a no-op for them;
    // canonical-path items get their ECS / stream documentation here.
    const canonical = getCanonicalProvider();
    return canonical?.resolveCompletionItem?.(item, token) ?? item;
  },
});

const ensureProviders = () => {
  if (disposables.length > 0) {
    return;
  }

  // Single completion provider that dispatches per model (join vs. canonical).
  disposables.push(
    monaco.languages.registerCompletionItemProvider(ESQL_LANG_ID, createCompletionProvider())
  );

  // Signature help and hover are global ES|QL language features (no per-model
  // dispatch needed); register them once alongside completion, matching the
  // behavior of the former `useEsqlAutocomplete` hook.
  const signature = ESQLLang.getSignatureProvider?.(stableCallbacks);
  if (signature) {
    disposables.push(monaco.languages.registerSignatureHelpProvider(ESQL_LANG_ID, signature));
  }

  const hover = ESQLLang.getHoverProvider?.(stableCallbacks);
  if (hover) {
    disposables.push(monaco.languages.registerHoverProvider(ESQL_LANG_ID, hover));
  }
};

const disposeProviders = () => {
  disposables.forEach((disposable) => disposable.dispose());
  disposables = [];
  canonicalProvider = null;
};

export interface UseEsqlCompletionParams {
  /**
   * The base query whose output columns provide the autocomplete context for a
   * split block editor (e.g. "FROM logs-* | STATS cpu = AVG(cpu) BY host.name").
   * Pass an empty string for a standalone / base editor — that editor's own text is
   * the full query and the canonical ES|QL suggestion provider is used directly.
   */
  baseQuery: string;
}

/**
 * Registers a model-scoped ES|QL completion context for the editor this hook is
 * mounted on, backed by a single shared Monaco completion provider.
 *
 * Usage:
 *   const { onEditorMount } = useEsqlCompletion({ baseQuery });
 *   <CodeEditor editorDidMount={onEditorMount} ... />
 *
 * Lives in the presentation layer so autocomplete works wherever the editor is
 * rendered (flyout or not), and guarantees exactly one registered provider so
 * suggestions are never duplicated.
 */
export const useEsqlCompletion = ({ baseQuery }: UseEsqlCompletionParams) => {
  const services = useRuleFormServices();
  const callbacks = useEsqlCallbacks({
    application: services.application,
    http: services.http,
    search: services.data.search.search,
  });

  const baseQueryRef = useRef(baseQuery);
  baseQueryRef.current = baseQuery;
  const callbacksRef = useRef<ESQLCallbacks>(callbacks);
  callbacksRef.current = callbacks;

  // Keep the canonical-path callbacks current without rebuilding the provider.
  useEffect(() => {
    currentCallbacks = callbacks;
  }, [callbacks]);

  const modelIdRef = useRef<string | null>(null);

  const onEditorMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    modelIdRef.current = model.id;
    modelContexts.set(model.id, {
      baseQuery: () => baseQueryRef.current,
      callbacks: () => callbacksRef.current,
    });
    currentCallbacks = callbacksRef.current;
    refCount += 1;
    ensureProviders();
  }, []);

  useEffect(() => {
    return () => {
      const id = modelIdRef.current;
      if (id === null) {
        return;
      }
      modelContexts.delete(id);
      modelIdRef.current = null;
      refCount -= 1;
      if (refCount <= 0) {
        refCount = 0;
        disposeProviders();
      }
    };
  }, []);

  return { onEditorMount };
};
