/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ESQLAstRerankCommand, ESQLAstAllCommands } from '@elastic/esql/types';
import type { ICommandCallbacks, ISuggestionItem, ICommandContext } from '../types';
import { SuggestionCategory } from '../../../language/autocomplete/utils/sorting/types';
import { Location } from '../types';
import { getPosition, CaretPosition } from './utils';
import {
  getNewUserDefinedColumnSuggestion,
  onCompleteItem,
  assignCompletionItem,
  withMapCompleteItem,
} from '../complete_items';
import {
  withinQuotes,
  createInferenceEndpointToCompletionItem,
} from '../../definitions/utils/autocomplete/helpers';
import { buildConstantsDefinitions } from '../../definitions/utils/literals';
import type { MapParameters } from '../../definitions/utils/autocomplete/map_expression';
import { getCommandMapExpressionSuggestions } from '../../definitions/utils/autocomplete/map_expression';
import { newLineAndPipeCompleteItems, withCompleteItem } from '../complete_items';
import { suggestFieldsList } from '../../definitions/utils/autocomplete/fields_list';

export const QUERY_TEXT = 'Your search query' as const;
export const QUERY_TEXT_SNIPPET = `"$\{0:${QUERY_TEXT}}"`;

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  const rerankCommand = command as ESQLAstRerankCommand;
  // Temporary during command-context migration: migrated commands are called through
  // autocomplete preparation, so prepared command text is expected to exist.
  const commandText = context!.commandSegment!.text;

  if (!callbacks?.getByType) {
    return [];
  }

  const position = getPosition(commandText, command);

  switch (position) {
    case CaretPosition.RERANK_KEYWORD: {
      const targetField = getNewUserDefinedColumnSuggestion(
        callbacks.getSuggestedUserDefinedColumnName?.() || ''
      );

      return [
        targetField,
        {
          ...buildConstantsDefinitions(
            [QUERY_TEXT_SNIPPET],
            '',
            undefined,
            undefined,
            SuggestionCategory.CONSTANT_VALUE
          )[0],
          label: QUERY_TEXT,
          asSnippet: true,
        },
      ];
    }

    case CaretPosition.RERANK_AFTER_TARGET_FIELD: {
      return [assignCompletionItem];
    }

    case CaretPosition.RERANK_AFTER_TARGET_ASSIGNMENT: {
      return [
        {
          ...buildConstantsDefinitions(
            [QUERY_TEXT_SNIPPET],
            '',
            undefined,
            undefined,
            SuggestionCategory.CONSTANT_VALUE
          )[0],
          label: QUERY_TEXT,
          asSnippet: true,
        },
      ];
    }

    case CaretPosition.ON_KEYWORD: {
      if (withinQuotes(commandText)) {
        return [];
      }

      return [onCompleteItem];
    }

    case CaretPosition.ON_EXPRESSION: {
      const afterCompleteSuggestions = [
        {
          ...withCompleteItem,
          text: withCompleteItem.text,
        },
      ];
      return suggestFieldsList(
        query,
        command,
        rerankCommand.fields,
        Location.RERANK,
        callbacks,
        context,
        cursorPosition,
        {
          afterCompleteSuggestions,
          allowSingleColumnFields: true,
          preferredExpressionType: ['text', 'keyword'],
        }
      );
    }

    case CaretPosition.AFTER_WITH_KEYWORD:
      return [withMapCompleteItem];

    case CaretPosition.WITHIN_MAP_EXPRESSION: {
      const endpoints = context?.inferenceEndpoints;
      const availableParameters: MapParameters = {
        inference_id: {
          type: 'string',
          suggestions: endpoints?.map(createInferenceEndpointToCompletionItem) || [],
        },
      };

      return getCommandMapExpressionSuggestions(commandText, availableParameters);
    }

    case CaretPosition.AFTER_COMMAND: {
      return newLineAndPipeCompleteItems;
    }

    default: {
      return [];
    }
  }
}
