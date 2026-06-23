/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isArray } from 'lodash';
import type { ISuggestionItem } from '@kbn/esql-language/src/commands/registry/types';
import { monaco } from '../../../../monaco_imports';
import type { MonacoMessage } from '../providers/types';

// From Monaco position to linear offset
export function monacoPositionToOffset(expression: string, position: monaco.Position): number {
  const lines = expression.split(/\n/);
  let offset = 0;

  for (let i = 0; i < position.lineNumber - 1; i++) {
    offset += lines[i].length + 1; // +1 for the newline character
  }

  // one-based to zero-based indexing
  offset += position.column - 1;

  return offset;
}

/**
 * Given an offset range, returns a monaco IRange object.
 *
 * IMPORTANT NOTE:
 * offset ranges are ZERO-based and NOT end-inclusive — [start, end)
 * monaco ranges are ONE-based and NOT end-inclusive — [start, end)
 */
export const offsetRangeToMonacoRange = (
  expression: string,
  range: { start: number; end: number }
):
  | {
      startColumn: number;
      endColumn: number;
      startLineNumber: number;
      endLineNumber: number;
    }
  | undefined => {
  let startColumn = NaN;
  let endColumn = 0;
  let startOfCurrentLine = 0;
  let currentLine = 1;

  // find the line and start column
  for (let i = 0; i <= expression.length; i++) {
    if (i < expression.length && expression[i] === '\n') {
      currentLine++;
      startOfCurrentLine = i + 1;
    }

    if (i === range.start) {
      startColumn = i + 1 - startOfCurrentLine;
      endColumn = startColumn + range.end - range.start;
      break;
    }
  }

  if (isNaN(startColumn)) {
    return;
  }

  return {
    startLineNumber: currentLine,
    endLineNumber: currentLine,
    startColumn,
    endColumn,
  };
};

export const getDecorationHoveredMessages = (
  word: monaco.editor.IWordAtPosition,
  position: monaco.Position,
  model: monaco.editor.ITextModel
): string[] => {
  try {
    const wordRange = new monaco.Range(
      position.lineNumber,
      word.startColumn,
      position.lineNumber,
      word.endColumn
    );

    const decorations = model.getDecorationsInRange(wordRange);

    return decorations
      .map((decoration) => {
        const hoverMessage = decoration.options.hoverMessage;
        if (!hoverMessage) return '';

        if (isArray(hoverMessage)) {
          return hoverMessage
            .map((msg) => msg.value || '')
            .filter(Boolean)
            .join(', ');
        }

        return hoverMessage.value || '';
      })
      .filter(Boolean);
  } catch (error) {
    // Silently fail to avoid breaking the hover functionality
    // eslint-disable-next-line no-console
    console.error('Error extracting decoration hover messages:', error);
    return [];
  }
};

/**
 * Extracts the suggestions with custom commands from a list of suggestions.
 * Suggestions with editor.action.triggerSuggest are excluded.
 * @param suggestions
 * @returns
 */
export const filterSuggestionsWithCustomCommands = (suggestions: ISuggestionItem[]): string[] => {
  return suggestions
    .filter(
      (suggestion) => suggestion.command && suggestion.command.id !== 'editor.action.triggerSuggest'
    )
    .map((suggestion) => suggestion.command!.id); // we know command is defined because of the filter
};
/**
 * Given a marker it returns the editor message from which it was created.
 * @param messages
 * @param marker
 * @returns
 */
export const findMessageByMarker = (
  messages: MonacoMessage[],
  marker: monaco.editor.IMarkerData
): MonacoMessage | undefined =>
  messages.find(
    (m) =>
      m.startLineNumber === marker.startLineNumber &&
      m.startColumn === marker.startColumn &&
      m.endLineNumber === marker.endLineNumber &&
      m.endColumn === marker.endColumn &&
      m.message === marker.message
  );
