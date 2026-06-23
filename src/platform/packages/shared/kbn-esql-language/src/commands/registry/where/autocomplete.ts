/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ESQLAstAllCommands, ESQLSingleAstItem } from '@elastic/esql/types';
import { newLineAndPipeCompleteItems } from '../complete_items';
import { suggestForExpression } from '../../definitions/utils';
import type { ICommandCallbacks } from '../types';
import { type ISuggestionItem, type ICommandContext, Location } from '../types';

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

  const expressionRoot = command.args[0] as ESQLSingleAstItem | undefined;

  const { suggestions, computed } = await suggestForExpression({
    query,
    expressionRoot,
    command,
    cursorPosition,
    location: Location.WHERE,
    context,
    callbacks,
    options: {
      preferredExpressionType: 'boolean',
      allowSubquery: context?.subquerySupport === true,
    },
  });

  const { expressionType, isComplete, insideFunction } = computed;

  if (expressionType === 'boolean' && isComplete && !insideFunction) {
    suggestions.push(...newLineAndPipeCompleteItems);
  }

  return suggestions;
}
