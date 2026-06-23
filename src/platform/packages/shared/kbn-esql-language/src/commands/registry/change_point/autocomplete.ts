/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  ESQLAstAllCommands,
  ESQLAstField,
  ESQLColumn,
  ESQLCommandOption,
} from '@elastic/esql/types';
import { withAutoSuggest } from '../../definitions/utils/autocomplete/helpers';
import { ESQL_NUMBER_TYPES } from '../../definitions/types';
import {
  byCompleteItem,
  newLineAndPipeCompleteItems,
  onCompleteItem,
  asCompletionItem,
} from '../complete_items';
import type { ISuggestionItem, ICommandCallbacks, ICommandContext } from '../types';
import { Location } from '../types';
import { buildUserDefinedColumnsDefinitions } from '../../definitions/utils/autocomplete/helpers';
import { suggestFieldsList } from '../../definitions/utils/autocomplete/fields_list';

export enum Position {
  VALUE = 'value',
  AFTER_VALUE = 'after_value',
  ON_COLUMN = 'on_column',
  AFTER_ON_CLAUSE = 'after_on_clause',
  AS_TYPE_COLUMN = 'as_type_clause',
  AS_P_VALUE_COLUMN = 'as_p_value_column',
  AFTER_AS_CLAUSE = 'after_as_clause',
  BY_CLAUSE = 'by_clause',
}

export const getPosition = (query: string, command: ESQLAstAllCommands): Position | undefined => {
  if (command.args.length < 2) {
    if (query.match(/CHANGE_POINT\s+\S*$/i)) {
      return Position.VALUE;
    }

    if (query.match(/CHANGE_POINT\s+\S+\s*\S*$/i)) {
      return Position.AFTER_VALUE;
    }
  }

  const lastArg = command.args[command.args.length - 1];

  if (query.match(/on\s+\S*$/i)) {
    return Position.ON_COLUMN;
  }

  if (!Array.isArray(lastArg) && lastArg.name === onCompleteItem.label.toLowerCase()) {
    if (query.match(/on\s+\S+\s+$/i)) {
      return Position.AFTER_ON_CLAUSE;
    }
  }

  if (query.match(/as\s+$/i)) {
    return Position.AS_TYPE_COLUMN;
  }

  if (!Array.isArray(lastArg) && lastArg.name === asCompletionItem.label.toLowerCase()) {
    if (query.match(/as\s+\S+,\s*\S*$/i)) {
      return Position.AS_P_VALUE_COLUMN;
    }

    if (query.match(/as\s+\S+,\s*\S+\s+$/i)) {
      return Position.AFTER_AS_CLAUSE;
    }
  }

  if (!Array.isArray(lastArg) && lastArg.name === byCompleteItem.label.toLowerCase()) {
    return Position.BY_CLAUSE;
  }
};

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  const pos = getPosition(innerText, command);

  switch (pos) {
    case Position.VALUE:
      const numericFields =
        (await callbacks?.getByType?.(ESQL_NUMBER_TYPES, [], {
          advanceCursor: true,
          openSuggestions: true,
        })) ?? [];
      return numericFields;
    case Position.AFTER_VALUE: {
      return [onCompleteItem, asCompletionItem, byCompleteItem, ...newLineAndPipeCompleteItems];
    }
    case Position.ON_COLUMN: {
      const onFields =
        (await callbacks?.getByType?.('any', [], {
          advanceCursor: true,
          openSuggestions: true,
        })) ?? [];
      return onFields;
    }
    case Position.AFTER_ON_CLAUSE:
      return [asCompletionItem, byCompleteItem, ...newLineAndPipeCompleteItems];
    case Position.AS_TYPE_COLUMN: {
      // add comma and space
      return buildUserDefinedColumnsDefinitions(['changePointType']).map((v) =>
        withAutoSuggest({
          ...v,
          text: v.text + ', ',
        })
      );
    }
    case Position.AS_P_VALUE_COLUMN: {
      return buildUserDefinedColumnsDefinitions(['pValue']).map((v) => withAutoSuggest(v));
    }
    case Position.AFTER_AS_CLAUSE: {
      return [byCompleteItem, ...newLineAndPipeCompleteItems];
    }
    case Position.BY_CLAUSE: {
      const byNode = command.args[command.args.length - 1] as ESQLCommandOption;

      const usedColumns = byNode.args
        .filter((arg): arg is ESQLColumn => !Array.isArray(arg) && arg.type === 'column')
        .map((arg) => arg.parts.join('.'));

      return suggestFieldsList(
        query,
        command,
        byNode.args as ESQLAstField[],
        Location.CHANGE_POINT_BY,
        callbacks,
        context,
        cursorPosition ?? innerText.length,
        {
          allowSingleColumnFields: true,
          disableNewColumnSuggestion: true,
          ignoredColumnsForEmptyExpression: usedColumns,
        }
      );
    }
    default:
      return [];
  }
}
