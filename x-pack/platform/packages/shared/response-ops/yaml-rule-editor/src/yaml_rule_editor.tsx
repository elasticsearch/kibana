/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { CodeEditorField } from '@kbn/code-editor';
import { ESQL_AUTOCOMPLETE_TRIGGER_CHARS, monaco, YAML_LANG_ID } from '@kbn/monaco';
import { suggest } from '@kbn/esql-language';
import type { YamlRuleEditorProps } from './types';
import { DEFAULT_ESQL_PROPERTY_NAMES } from './types';
import { getSchemaProperties, getSchemaPropertyInfo, getSchemaTypeInfo } from './schema_utils';
import {
  buildYamlValidationMarkers,
  getCompletionContext,
  getExistingYamlKeys,
  getYamlPathAtPosition,
} from './yaml_utils';
import { findYamlQueryContext } from './query_context';
import { ALERTING_V2_YAML_ESQL_LANG_ID, setEsqlPropertyNames } from './monaco_language';

/**
 * Convert ES|QL suggestions to Monaco completion items
 */
const toCompletionItems = (
  suggestions: Array<{
    label: string;
    text: string;
    asSnippet?: boolean;
    kind?: string;
    detail?: string;
    documentation?: string | { value: string };
    sortText?: string;
    filterText?: string;
  }>,
  range: monaco.Range
): monaco.languages.CompletionItem[] => {
  return suggestions.map((item) => {
    const kind =
      item.kind && item.kind in monaco.languages.CompletionItemKind
        ? monaco.languages.CompletionItemKind[
            item.kind as keyof typeof monaco.languages.CompletionItemKind
          ]
        : monaco.languages.CompletionItemKind.Method;
    return {
      label: item.label,
      insertText: item.text,
      filterText: item.filterText,
      kind,
      detail: item.detail,
      documentation: item.documentation,
      sortText: item.sortText,
      insertTextRules: item.asSnippet
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      range,
    };
  });
};

/**
 * YAML Rule Editor component with ES|QL support
 *
 * This component provides a Monaco-based code editor for editing rule definitions
 * in YAML format with embedded ES|QL query support, including:
 * - Syntax highlighting for both YAML and ES|QL
 * - Auto-completion for YAML keys based on the rule schema
 * - ES|QL auto-completion within the query field
 * - Real-time validation against the rule schema
 */
export const YamlRuleEditor: React.FC<YamlRuleEditorProps> = ({
  value,
  onChange,
  onBlur,
  esqlCallbacks,
  esqlPropertyNames = DEFAULT_ESQL_PROPERTY_NAMES,
  isReadOnly = false,
  height = 'clamp(320px, calc(100vh - 500px), 750px)',
  dataTestSubj = 'alertingV2YamlRuleEditor',
  onValidate,
}) => {
  const editorSuggestDisposable = useRef<monaco.IDisposable | null>(null);
  const editorValidationDisposable = useRef<monaco.IDisposable | null>(null);
  const editorBlurDisposable = useRef<monaco.IDisposable | null>(null);
  // Hold the latest callbacks in refs so the Monaco listeners (set up once on
  // mount) always invoke the current callback without re-attaching on every
  // render.
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const onValidateRef = useRef(onValidate);
  onValidateRef.current = onValidate;

  // Update the Monaco language configuration when property names change
  useEffect(() => {
    setEsqlPropertyNames(esqlPropertyNames);
  }, [esqlPropertyNames]);

  const suggestionProvider = useMemo<monaco.languages.CompletionItemProvider>(
    () => ({
      triggerCharacters: [...ESQL_AUTOCOMPLETE_TRIGGER_CHARS, ':', ' '],
      provideCompletionItems: async (model, position) => {
        const fullText = model.getValue();
        const cursorOffset = model.getOffsetAt(position);
        const queryContext = findYamlQueryContext(fullText, cursorOffset, esqlPropertyNames);

        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        );

        // If cursor is within ES|QL query, provide ES|QL suggestions
        if (queryContext) {
          const suggestions = await suggest(
            queryContext.queryText,
            queryContext.queryOffset,
            esqlCallbacks
          );
          return {
            suggestions: toCompletionItems(suggestions, range),
          };
        }

        // Otherwise, provide YAML key/value suggestions
        const completionContext = getCompletionContext(fullText, position);
        if (!completionContext) {
          return { suggestions: [] };
        }

        // Value completions for boolean and enum types
        if (completionContext.isValuePosition && completionContext.currentKey) {
          const typeInfo = getSchemaTypeInfo([
            ...completionContext.parentPath,
            completionContext.currentKey,
          ]);
          if (typeInfo?.isBoolean) {
            return {
              suggestions: ['true', 'false'].map((val) => ({
                label: val,
                insertText: val,
                kind: monaco.languages.CompletionItemKind.Value,
                range,
              })),
            };
          }
          if (typeInfo?.enumValues) {
            return {
              suggestions: typeInfo.enumValues.map((val) => ({
                label: val,
                insertText: val,
                kind: monaco.languages.CompletionItemKind.Value,
                range,
              })),
            };
          }
          return { suggestions: [] };
        }

        // Key completions - filter out keys that already exist
        const properties = getSchemaProperties(completionContext.parentPath);
        const existingKeys = getExistingYamlKeys(fullText, completionContext.parentPath);

        return {
          suggestions: properties
            .filter(({ key }) => !existingKeys.has(key))
            .map(({ key, description, type }) => ({
              label: key,
              insertText: `${key}: `,
              kind: monaco.languages.CompletionItemKind.Property,
              detail: type,
              documentation: description ? { value: description } : undefined,
              range,
            })),
        };
      },
    }),
    [esqlCallbacks, esqlPropertyNames]
  );

  const hoverProvider = useMemo<monaco.languages.HoverProvider>(
    () => ({
      provideHover: (model, position) => {
        const path = getYamlPathAtPosition(model.getValue(), position, esqlPropertyNames);
        if (!path) {
          return null;
        }
        const propertyInfo = getSchemaPropertyInfo(path);
        if (!propertyInfo) {
          return null;
        }

        const contents: monaco.IMarkdownString[] = [];

        // Show type as code block
        contents.push({
          value: `\`\`\`yaml\n${path[path.length - 1]}: ${propertyInfo.type}\n\`\`\``,
        });

        // Show description if available
        if (propertyInfo.description) {
          contents.push({ value: propertyInfo.description });
        }

        // Show enum values if applicable
        if (propertyInfo.enumValues && propertyInfo.enumValues.length > 3) {
          const enumList = propertyInfo.enumValues.map((v) => `- \`${v}\``).join('\n');
          contents.push({ value: `**Allowed values:**\n${enumList}` });
        }

        return { contents };
      },
    }),
    [esqlPropertyNames]
  );

  const handleEditorDidMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      const model = editor.getModel();
      if (!model) {
        return;
      }

      // Force tokenization on initial render for the custom YAML+ESQL language
      monaco.editor.setModelLanguage(model, YAML_LANG_ID);
      monaco.editor.setModelLanguage(model, ALERTING_V2_YAML_ESQL_LANG_ID);

      // Auto-trigger suggestions when typing in query context
      editorSuggestDisposable.current?.dispose();
      editorSuggestDisposable.current = editor.onDidChangeModelContent(() => {
        const position = editor.getPosition();
        const currentModel = editor.getModel();
        if (!position || !currentModel) {
          return;
        }
        const offset = currentModel.getOffsetAt(position);
        if (findYamlQueryContext(currentModel.getValue(), offset, esqlPropertyNames)) {
          editor.trigger('alerting_v2', 'editor.action.triggerSuggest', null);
        }
      });

      // Set up validation markers
      onValidateRef.current?.(buildYamlValidationMarkers(model) > 0);
      editorValidationDisposable.current?.dispose();
      editorValidationDisposable.current = editor.onDidChangeModelContent(() => {
        onValidateRef.current?.(buildYamlValidationMarkers(model) > 0);
      });

      // Forward blur to the consumer via the ref so the latest onBlur is invoked.
      editorBlurDisposable.current?.dispose();
      editorBlurDisposable.current = editor.onDidBlurEditorText(() => {
        onBlurRef.current?.();
      });
    },
    [esqlPropertyNames]
  );

  const handleEditorWillUnmount = useCallback(() => {
    editorSuggestDisposable.current?.dispose();
    editorSuggestDisposable.current = null;
    editorValidationDisposable.current?.dispose();
    editorValidationDisposable.current = null;
    editorBlurDisposable.current?.dispose();
    editorBlurDisposable.current = null;
  }, []);

  return (
    <CodeEditorField
      value={value}
      onChange={onChange}
      languageId={ALERTING_V2_YAML_ESQL_LANG_ID}
      editorDidMount={handleEditorDidMount}
      editorWillUnmount={handleEditorWillUnmount}
      height={height}
      fullWidth
      dataTestSubj={dataTestSubj}
      suggestionProvider={suggestionProvider}
      hoverProvider={hoverProvider}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        wordWrap: 'on',
        lineNumbers: 'on',
        readOnly: isReadOnly,
      }}
    />
  );
};
