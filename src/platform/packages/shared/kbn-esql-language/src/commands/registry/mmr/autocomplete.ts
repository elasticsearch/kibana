/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { ESQLAstAllCommands, ESQLAstField, ESQLAstMmrCommand } from '@elastic/esql/types';
import { suggestForExpression } from '../../definitions/utils';
import type { MapParameters } from '../../definitions/utils/autocomplete/map_expression';
import { getCommandMapExpressionSuggestions } from '../../definitions/utils/autocomplete/map_expression';
import { suggestFieldsList } from '../../definitions/utils/autocomplete/fields_list';
import {
  mmrLambdaMapSuggestion,
  mmrLambdaValueSuggestion,
  mmrLimitKeywordSuggestion,
  mmrLimitValueSuggestions,
  mmrQueryVectorSuggestion,
  newLineAndPipeCompleteItems,
  onCompleteItem,
  withCompleteItem,
} from '../complete_items';
import type { ICommandCallbacks, ICommandContext, ISuggestionItem } from '../types';
import { Location } from '../types';
import { getPosition, getVectorFieldSuggestions, MMR_VECTOR_TYPES, MmrPosition } from './utils';

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
  const mmrCommand = command as ESQLAstMmrCommand;
  const position = getPosition(mmrCommand);

  switch (position) {
    case MmrPosition.AFTER_MMR_KEYWORD: {
      const queryVectorExpression = mmrCommand.queryVector;

      if (command.args.length === 0) {
        const { suggestions: queryVectorSuggestions } = await suggestForExpression({
          query,
          command,
          cursorPosition,
          location: Location.MMR,
          context,
          callbacks,
          options: {
            preferredExpressionType: MMR_VECTOR_TYPES,
            suggestFields: false,
            suggestFunctions: true,
          },
        });

        return [onCompleteItem, mmrQueryVectorSuggestion, ...queryVectorSuggestions];
      }

      const suggestions = await suggestFieldsList(
        query,
        command,
        [queryVectorExpression as ESQLAstField],
        Location.MMR,
        callbacks,
        context,
        cursorPosition,
        {
          afterCompleteSuggestions: [onCompleteItem],
          includePipeAndCommaSuggestions: false,
          allowSingleColumnFields: true,
          preferredExpressionType: MMR_VECTOR_TYPES,
        }
      );

      return suggestions.length > 0 ? suggestions : [onCompleteItem];
    }

    case MmrPosition.AFTER_ON_KEYWORD:
      return getVectorFieldSuggestions(innerText, callbacks, context);

    case MmrPosition.AFTER_FIELD:
      return [mmrLimitKeywordSuggestion];

    case MmrPosition.AFTER_LIMIT_KEYWORD:
      return mmrLimitValueSuggestions();

    case MmrPosition.AFTER_LIMIT_VALUE:
      return [withCompleteItem, ...newLineAndPipeCompleteItems];

    case MmrPosition.AFTER_WITH_KEYWORD:
      return [mmrLambdaMapSuggestion];

    case MmrPosition.WITHIN_OPTIONS: {
      const availableParameters: MapParameters = {
        lambda: {
          type: 'number',
          description: i18n.translate(
            'kbn-esql-language.commands.mmr.autocomplete.lambdaDescription',
            {
              defaultMessage: 'MMR lambda value',
            }
          ),
          suggestions: [mmrLambdaValueSuggestion],
        },
      };

      return getCommandMapExpressionSuggestions(innerText, availableParameters, false);
    }

    case MmrPosition.AFTER_COMMAND:
      return newLineAndPipeCompleteItems;

    default:
      return [];
  }
}
