/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ESQLAstAllCommands, ESQLCommand } from '@elastic/esql/types';
import { isColumn } from '@elastic/esql';
import { withAutoSuggest } from '../../definitions/utils/autocomplete/helpers';
import type { ICommandCallbacks } from '../types';
import { type ISuggestionItem, type ICommandContext } from '../types';
import {
  newLineCompleteItem,
  pipeCompleteItem,
  newLineAndPipeCompleteItems,
  commaCompleteItem,
} from '../complete_items';
import { getLastNonWhitespaceChar } from '../../definitions/utils/autocomplete/helpers';
import { endsWithWhitespace } from '../../definitions/utils/regex';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  if (
    endsWithWhitespace(innerText) &&
    getLastNonWhitespaceChar(innerText) !== ',' &&
    !/keep\s+\S*$/i.test(innerText)
  ) {
    return [...newLineAndPipeCompleteItems, commaCompleteItem];
  }

  const alreadyDeclaredFields = (command as ESQLCommand).args
    .filter(isColumn)
    .map((arg) => arg.parts.join('.'));
  const fieldSuggestions = (await callbacks?.getByType?.('any', alreadyDeclaredFields)) ?? [];
  const completionSuggestions: ISuggestionItem[] = [
    {
      ...newLineCompleteItem,
      preserveTypedPrefix: true,
      requiresExistingColumnMatch: true,
    },
    {
      ...pipeCompleteItem,
      text: ' | ',
      preserveTypedPrefix: true,
      requiresExistingColumnMatch: true,
    },
  ];

  if (fieldSuggestions.length > 0) {
    completionSuggestions.push(
      withAutoSuggest({
        ...commaCompleteItem,
        text: ', ',
        preserveTypedPrefix: true,
        requiresExistingColumnMatch: true,
      })
    );
  }

  return [
    ...completionSuggestions,
    ...fieldSuggestions.map((suggestion) =>
      withAutoSuggest({
        ...suggestion,
        text: suggestion.text,
      })
    ),
  ];
}
