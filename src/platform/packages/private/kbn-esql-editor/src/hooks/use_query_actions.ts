/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { AggregateQuery } from '@kbn/es-query';
import { QuerySource, type TelemetryQuerySubmittedProps } from '@kbn/esql-types';
import { prettifyQuery } from '@kbn/esql-utils';
import { monaco } from '@kbn/code-editor';
import type { ESQLEditorTelemetryService } from '../telemetry/telemetry_service';
import { getToggleCommentLines } from '../helpers';
import type { ESQLEditorProps } from '../types';

interface UseQueryActionsParams {
  editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>;
  editorModel: React.MutableRefObject<monaco.editor.ITextModel | undefined>;
  isLoading: boolean | undefined;
  allowQueryCancellation: boolean | undefined;
  measuredEditorWidth: number;
  onTextLangQuerySubmit: ESQLEditorProps['onTextLangQuerySubmit'];
  onQueryUpdate: (value: string) => void;
  telemetryService: ESQLEditorTelemetryService;
}

export const useQueryActions = ({
  editorRef,
  editorModel,
  isLoading,
  allowQueryCancellation,
  measuredEditorWidth,
  onTextLangQuerySubmit,
  onQueryUpdate,
  telemetryService,
}: UseQueryActionsParams) => {
  const [isQueryLoading, setIsQueryLoading] = useState(true);
  // Read via ref inside onQuerySubmit to avoid recreating the callback on every loading toggle,
  // which would cascade to onUpdateAndSubmitQuery and all downstream consumers.
  const isQueryLoadingRef = useRef(isQueryLoading);
  isQueryLoadingRef.current = isQueryLoading;
  const abortControllerRef = useRef(new AbortController());

  const onQuerySubmit = useCallback(
    (source: TelemetryQuerySubmittedProps['source']) => {
      if (isQueryLoadingRef.current && isLoading && allowQueryCancellation) {
        abortControllerRef.current.abort();
        setIsQueryLoading(false);
      } else {
        setIsQueryLoading(true);
        const abc = new AbortController();
        abortControllerRef.current = abc;

        const currentValue = editorRef.current?.getValue();

        if (currentValue) {
          telemetryService.trackQuerySubmitted({
            source,
            query: currentValue,
          });
        }
        onTextLangQuerySubmit({ esql: currentValue } as AggregateQuery, abc);
      }
    },
    [isLoading, allowQueryCancellation, onTextLangQuerySubmit, telemetryService, editorRef]
  );

  const onUpdateAndSubmitQuery = useCallback(
    (newQuery: string, querySource: QuerySource) => {
      // notify telemetry that a query has been submitted from the history panel
      if (querySource === QuerySource.HISTORY || querySource === QuerySource.STARRED) {
        telemetryService.trackQueryHistoryClicked(querySource === QuerySource.STARRED);
      }
      // Update the query state first, then submit on the next tick so React
      // processes the state change before the submit reads the editor value.
      onQueryUpdate(newQuery);
      setTimeout(() => {
        onQuerySubmit(querySource);
      }, 0);
    },
    [onQuerySubmit, onQueryUpdate, telemetryService]
  );

  const onPrettifyQuery = useCallback(() => {
    const qs = editorRef.current?.getValue();
    if (qs) {
      const editor = editorRef.current;
      const layoutInfo = editor?.getLayoutInfo();
      const widthForWrap = layoutInfo?.contentWidth ?? measuredEditorWidth;
      const charWidth =
        editor?.getOption(monaco.editor.EditorOption.fontInfo).typicalHalfwidthCharacterWidth ?? 8;
      const lineWidthChars = widthForWrap > 0 ? Math.floor(widthForWrap / charWidth) : undefined;
      const prettyCode = prettifyQuery(qs, lineWidthChars);
      if (qs !== prettyCode) {
        onQueryUpdate(prettyCode);
      }
    }
  }, [editorRef, onQueryUpdate, measuredEditorWidth]);

  const onCommentLine = useCallback(() => {
    const currentSelection = editorRef?.current?.getSelection();
    const startLineNumber = currentSelection?.startLineNumber;
    const endLineNumber = currentSelection?.endLineNumber;
    if (startLineNumber && endLineNumber) {
      const lines: string[] = [];
      for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
        lines.push(editorModel.current?.getLineContent(lineNumber) ?? '');
      }

      const toggledLines = getToggleCommentLines(lines);

      const edits = toggledLines.map((text, idx) => {
        const lineNumber = startLineNumber + idx;
        return {
          range: {
            startLineNumber: lineNumber,
            startColumn: 0,
            endLineNumber: lineNumber,
            endColumn: (lines[idx]?.length ?? 0) + 1,
          },
          text,
        };
      });
      // executeEdits allows to keep edit in history
      editorRef.current?.executeEdits('comment', edits);
    }
  }, [editorRef, editorModel]);

  useEffect(() => {
    if (!isLoading) setIsQueryLoading(false);
  }, [isLoading]);

  useEffect(() => {
    return () => {
      abortControllerRef.current.abort();
    };
  }, []);

  const queryRunButtonProperties = useMemo(() => {
    if (allowQueryCancellation && isLoading) {
      return {
        label: i18n.translate('esqlEditor.query.cancel', {
          defaultMessage: 'Cancel',
        }),
        color: 'text',
      };
    }
    return {
      label: i18n.translate('esqlEditor.query.searchLabel', {
        defaultMessage: 'Search',
      }),
      color: 'primary',
    };
  }, [allowQueryCancellation, isLoading]);

  return {
    onQuerySubmit,
    onUpdateAndSubmitQuery,
    onPrettifyQuery,
    onCommentLine,
    queryRunButtonProperties,
    isQueryLoading,
  };
};
