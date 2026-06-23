/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ESQLAstAllCommands } from '@elastic/esql/types';
import type { ICommandCallbacks } from '../types';
import { type ISuggestionItem, type ICommandContext } from '../types';
import {
  newLineAndPipeCompleteItems,
  asCompletionItem,
  assignCompletionItem,
  commaCompleteItem,
  getNewUserDefinedColumnSuggestion,
} from '../complete_items';
import { columnExists } from '../../definitions/utils/autocomplete/helpers';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  if (/(?:rename|,)\s+\S+\s+a$/i.test(innerText)) {
    return [asCompletionItem];
  }

  // If the left side of the rename is a column that exists, we suggest the 'AS' completion item.
  // If it doesn't exist, we suggest the '=' completion item.
  const match = innerText.match(/(?:rename|,)\s+(\S+)\s+a?$/i);
  if (match) {
    const leftSideOfRename = match[1];
    return columnExists(leftSideOfRename, context) ? [asCompletionItem] : [assignCompletionItem];
  }

  if (/(?:rename|,)\s+\S+\s+a?$/i.test(innerText)) {
    return [asCompletionItem, assignCompletionItem];
  }

  if (/rename(?:\s+\S+\s+(as|=)\s+\S+\s*,)*\s+\S+\s+(as|=)\s+[^\s,]+\s+$/i.test(innerText)) {
    return [...newLineAndPipeCompleteItems, { ...commaCompleteItem, text: ', ' }];
  }

  if (/as\s+$/i.test(innerText)) {
    return [];
  }

  const suggestions =
    (await callbacks?.getByType?.('any', [], {
      advanceCursor: true,
      openSuggestions: true,
    })) ?? [];

  if (!/=\s+$/i.test(innerText)) {
    suggestions.push(
      getNewUserDefinedColumnSuggestion(callbacks?.getSuggestedUserDefinedColumnName?.() || '')
    );
  }

  return suggestions;
}
