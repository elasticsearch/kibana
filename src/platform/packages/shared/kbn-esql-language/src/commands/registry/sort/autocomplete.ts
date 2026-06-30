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
import {
  columnExists as _columnExists,
  withAutoSuggest,
} from '../../definitions/utils/autocomplete/helpers';
import { suggestForExpression } from '../../definitions/utils';
import {
  commaCompleteItem,
  newLineCompleteItem,
  newLineAndPipeCompleteItems,
  pipeCompleteItem,
} from '../complete_items';
import {
  Location,
  type ICommandCallbacks,
  type ICommandContext,
  type ISuggestionItem,
} from '../types';
import {
  getSortPos,
  getSuggestionsAfterCompleteExpression,
  rightAfterColumn,
  sortModifierSuggestions,
} from './utils';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  if (!callbacks?.getByType) {
    return [];
  }
  const innerText = query.substring(0, cursorPosition);
  const prependSpace = (suggestion: ISuggestionItem) => ({
    ...suggestion,
    text: ' ' + suggestion.text,
  });

  // Temporary during command-context migration: migrated commands are called through
  // autocomplete preparation, so prepared command text is expected to exist.
  const commandText = context!.commandSegment!.text;

  const { position: pos, expressionRoot } = getSortPos(commandText, command);

  switch (pos) {
    case 'expression': {
      const columnExists = (name: string) => _columnExists(name, context);
      const alreadyDeclaredFields = (command as ESQLCommand).args
        .filter(isColumn)
        .map((arg) => arg.parts.join('.'));

      const { suggestions: expressionSuggestions, computed } = await suggestForExpression({
        query,
        expressionRoot,
        command,
        cursorPosition,
        location: Location.SORT,
        context,
        callbacks,
        options: {
          addSpaceAfterFirstField: false,
          addSpaceAfterOperator: true,
          openSuggestions: true,
          ignoredColumnsForEmptyExpression: alreadyDeclaredFields,
        },
      });

      const suggestions: ISuggestionItem[] = [];

      if (computed.isComplete && !computed.insideFunction) {
        suggestions.push(
          ...getSuggestionsAfterCompleteExpression(innerText, expressionRoot, columnExists)
        );
      }

      if (!rightAfterColumn(innerText, expressionRoot, columnExists)) {
        suggestions.push(...expressionSuggestions);
      }

      return suggestions;
    }

    case 'order_complete': {
      return [
        newLineCompleteItem,
        { ...pipeCompleteItem, text: ' | ', preserveTypedPrefix: true },
        withAutoSuggest({ ...commaCompleteItem, text: ', ', preserveTypedPrefix: true }),
        { ...prependSpace(sortModifierSuggestions.NULLS_FIRST), preserveTypedPrefix: true },
        { ...prependSpace(sortModifierSuggestions.NULLS_LAST), preserveTypedPrefix: true },
      ];
    }

    case 'after_order': {
      return [
        sortModifierSuggestions.NULLS_FIRST,
        sortModifierSuggestions.NULLS_LAST,
        ...newLineAndPipeCompleteItems,
        withAutoSuggest({ ...commaCompleteItem, text: ', ' }),
      ].map((suggestion) => ({
        ...suggestion,
      }));
    }

    case 'nulls_complete': {
      return [
        newLineCompleteItem,
        { ...pipeCompleteItem, text: ' | ', preserveTypedPrefix: true },
        withAutoSuggest({ ...commaCompleteItem, text: ', ', preserveTypedPrefix: true }),
      ];
    }

    case 'after_nulls': {
      return [
        ...newLineAndPipeCompleteItems,
        withAutoSuggest({ ...commaCompleteItem, text: ', ' }),
      ];
    }

    default: {
      return [];
    }
  }
}
