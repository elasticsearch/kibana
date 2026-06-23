/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLAstAllCommands, ESQLAstField } from '@elastic/esql/types';
import type { ICommandCallbacks } from '../types';
import { Location, type ISuggestionItem, type ICommandContext } from '../types';
import {
  newLineAndPipeCompleteItems,
  byCompleteItem,
  defaultLimitValueSuggestions,
} from '../complete_items';
import { buildConstantsDefinitions } from '../../definitions/utils/literals';
import { suggestFieldsList } from '../../definitions/utils/autocomplete/fields_list';
import { getByColumns, getByOption, getPosition } from './utils';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  const position = getPosition(command, innerText);

  switch (position) {
    case 'after_limit_keyword': {
      return buildConstantsDefinitions(defaultLimitValueSuggestions, '', {
        advanceCursorAndOpenSuggestions: true,
      });
    }

    case 'after_value': {
      return [byCompleteItem, ...newLineAndPipeCompleteItems];
    }

    case 'grouping_expression': {
      const byNode = getByOption(command);
      if (!byNode) {
        return [];
      }

      return suggestFieldsList(
        query,
        command,
        byNode.args as ESQLAstField[],
        Location.LIMIT_BY,
        callbacks,
        context,
        cursorPosition ?? query.length,
        {
          ignoredColumnsForEmptyExpression: getByColumns(byNode),
          allowSingleColumnFields: true,
          disableNewColumnSuggestion: true,
        }
      );
    }

    default:
      return [];
  }
}
