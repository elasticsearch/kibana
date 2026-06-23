/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';
import { monaco } from '@kbn/code-editor';
import { useCallback, useRef, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { i18n } from '@kbn/i18n';
import { isMac } from '@kbn/shared-ux-utility';

const EMPTY_LINE_HINT_CLASS = 'esqlGhostLineHint';
const COMMENT_LINE_HINT_CLASS = 'esqlGhostCommentHint';
export const CURSOR_PAUSE_MS = 400;

export type GhostHintKind = 'empty' | 'comment' | null;

/**
 * Decides which (if any) ghost hint to show for the given line.
 * - 'empty':   cursor is on a blank line in a non-empty editor
 *              (the editor's own placeholder covers the entirely-empty case).
 * - 'comment': cursor is on a `//` line — prompts the user to invoke nl-to-esql.
 * - null:      neither.
 */
export const getGhostHintKind = (
  model: monaco.editor.ITextModel,
  lineNumber: number
): GhostHintKind => {
  const trimmed = model.getLineContent(lineNumber).trim();

  if (trimmed.startsWith('//')) {
    return 'comment';
  }

  if (model.getLineContent(lineNumber) === '' && model.getValueLength() > 0) {
    return 'empty';
  }

  return null;
};

interface UseGhostLineHintParams {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>;
  editorModel: MutableRefObject<monaco.editor.ITextModel | undefined>;
  isReviewActiveRef: MutableRefObject<object | null>;
  isEnabled: boolean;
  // Suppresses the hint while a comment-to-esql generation is in flight.
  isGeneratingRef?: MutableRefObject<boolean>;
  // Forward-ref into which we write our `clearDecoration` so the comment-to-esql
  // hook can clear an already-shown hint without circular hook dependencies.
  clearGhostHintRef?: MutableRefObject<() => void>;
}

export const useGhostLineHint = ({
  editorRef,
  editorModel,
  isReviewActiveRef,
  isEnabled,
  isGeneratingRef,
  clearGhostHintRef,
}: UseGhostLineHintParams) => {
  const { euiTheme } = useEuiTheme();
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | undefined>(undefined);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Mirror isEnabled in a ref so the cursor listener — registered once at editor mount —
  // sees the latest value when the async license check resolves.
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  const commandKey = isMac ? '⌘' : 'Ctrl';
  const emptyLineHintText = i18n.translate('esqlEditor.ghostLineHint', {
    defaultMessage:
      'Type // and describe what you want, then press {commandKey}+J to generate it using AI',
    values: { commandKey },
  });
  const commentLineHintText = i18n.translate('esqlEditor.ghostCommentHint', {
    defaultMessage: 'Describe what you want, then press {commandKey}+J to generate it using AI',
    values: { commandKey },
  });

  const ghostLineHintStyle = useMemo(
    () => css`
      .${EMPTY_LINE_HINT_CLASS}::after, .${COMMENT_LINE_HINT_CLASS}::after {
        opacity: 0.4;
        font-style: italic;
        pointer-events: none;
        color: ${euiTheme.colors.textSubdued};
      }
      .${EMPTY_LINE_HINT_CLASS}::after {
        content: ${JSON.stringify(emptyLineHintText)};
      }
      .${COMMENT_LINE_HINT_CLASS}::after {
        content: ${JSON.stringify(' ' + commentLineHintText)};
      }
    `,
    [euiTheme.colors.textSubdued, emptyLineHintText, commentLineHintText]
  );

  const clearDecoration = useCallback(() => {
    decorationsRef.current?.clear();
    decorationsRef.current = undefined;
  }, []);

  // Expose clearDecoration through the forward-ref so the comment-to-esql hook
  // can hide an already-visible hint when generation starts.
  if (clearGhostHintRef) {
    clearGhostHintRef.current = clearDecoration;
  }

  const showDecoration = useCallback(
    (lineNumber: number, kind: Exclude<GhostHintKind, null>) => {
      const editor = editorRef.current;
      const model = editorModel.current;
      if (!editor || !model) return;

      decorationsRef.current?.clear();

      const isComment = kind === 'comment';
      // For comments, anchor the decoration at the end of the existing text so the
      // ::after pseudo-element renders right after the comment. For empty lines
      // there's no content, so the decoration sits at column 1.
      const column = isComment ? model.getLineMaxColumn(lineNumber) : 1;
      const afterContentClassName = isComment ? COMMENT_LINE_HINT_CLASS : EMPTY_LINE_HINT_CLASS;

      decorationsRef.current = editor.createDecorationsCollection([
        {
          range: new monaco.Range(lineNumber, column, lineNumber, column),
          options: {
            afterContentClassName,
          },
        },
      ]);
    },
    [editorRef, editorModel]
  );

  const clearTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = undefined;
    }
  }, []);

  const setupGhostLineHint = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable[] => {
      const disposables: monaco.IDisposable[] = [];

      const scheduleEvaluation = () => {
        clearDecoration();
        clearTimer();

        debounceTimerRef.current = setTimeout(() => {
          if (!isEnabledRef.current) return;
          if (isReviewActiveRef.current) return;
          if (isGeneratingRef?.current) return;

          const model = editorModel.current;
          const position = editor.getPosition();
          if (!model || !position) return;

          const kind = getGhostHintKind(model, position.lineNumber);
          if (kind) {
            showDecoration(position.lineNumber, kind);
          }
        }, CURSOR_PAUSE_MS);
      };

      // Both cursor moves and content edits restart the debounce so the hint
      // shows after the user pauses — including after typing `//` on a fresh line.
      disposables.push(editor.onDidChangeCursorPosition(scheduleEvaluation));
      disposables.push(editor.onDidChangeModelContent(scheduleEvaluation));

      disposables.push({
        dispose: () => {
          clearTimer();
          clearDecoration();
        },
      });

      return disposables;
    },
    [editorModel, clearDecoration, clearTimer, showDecoration, isReviewActiveRef, isGeneratingRef]
  );

  return {
    ghostLineHintStyle,
    setupGhostLineHint,
  };
};
