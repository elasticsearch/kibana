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
import { newLineAndPipeCompleteItems } from '../complete_items';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  if (/MV_EXPAND\s+\S+\s+$/i.test(innerText)) {
    return newLineAndPipeCompleteItems;
  }

  const columnSuggestions =
    (await callbacks?.getByType?.('any', undefined, {
      advanceCursor: true,
      openSuggestions: true,
    })) ?? [];

  return columnSuggestions;
}
