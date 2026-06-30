/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ESQLAstAllCommands, ESQLAstField } from '@elastic/esql/types';
import { FULL_TEXT_SEARCH_FUNCTIONS } from '../../definitions/constants';
import type { ICommandCallbacks } from '../types';
import { type ICommandContext, type ISuggestionItem } from '../types';
import { suggestFieldsList } from '../../definitions/utils/autocomplete/fields_list';
import { Location } from '../types';

export const FUNCTIONS_TO_IGNORE = {
  names: [...FULL_TEXT_SEARCH_FUNCTIONS],
  allowedInsideFunctions: Object.fromEntries(
    FULL_TEXT_SEARCH_FUNCTIONS.map((fn) => [fn, ['score']])
  ) as Record<(typeof FULL_TEXT_SEARCH_FUNCTIONS)[number], string[]>,
};

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  return suggestFieldsList(
    query,
    command,
    command.args as ESQLAstField[],
    Location.EVAL,
    callbacks,
    context,
    cursorPosition,
    {
      getFunctionsToIgnore: () => FUNCTIONS_TO_IGNORE,
      preferredExpressionType: 'any',
    }
  );
}
