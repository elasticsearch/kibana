/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import { uniqBy } from 'lodash';
import { isFunctionExpression, isLiteral } from '@elastic/esql';
import type {
  ESQLAstCompletionCommand,
  ESQLAstAllCommands,
  ESQLMap,
  ESQLCommandOption,
  ESQLSingleAstItem,
} from '@elastic/esql/types';
import { suggestForExpression } from '../../definitions/utils';
import type { MapParameters } from '../../definitions/utils/autocomplete/map_expression';
import { getCommandMapExpressionSuggestions } from '../../definitions/utils/autocomplete/map_expression';
import {
  newLineAndPipeCompleteItems,
  assignCompletionItem,
  getNewUserDefinedColumnSuggestion,
  withCompleteItem,
  withMapCompleteItem,
} from '../complete_items';
import {
  getFieldsSuggestions,
  getFunctionsSuggestions,
  getLiteralsSuggestions,
} from '../../definitions/utils';
import {
  columnExists,
  createInferenceEndpointToCompletionItem,
  withAutoSuggest,
  withinQuotes,
} from '../../definitions/utils/autocomplete/helpers';
import { buildConstantsDefinitions } from '../../definitions/utils/literals';
import {
  type ISuggestionItem,
  Location,
  type ICommandContext,
  type ICommandCallbacks,
} from '../types';
import { SuggestionCategory } from '../../../language/autocomplete/utils/sorting/types';
import { endsWithNonWhitespace } from '../../definitions/utils/regex';

export enum CompletionPosition {
  AFTER_COMPLETION = 'after_completion',
  AFTER_TARGET_FIELD = 'after_target_field', // After 'col0 ' (non-existing column), suggest '='
  AFTER_TARGET_ASSIGNMENT = 'after_target_assignment', // After 'col0 =', suggest prompt
  EXPRESSION = 'expression',
  AFTER_WITH_KEYWORD = 'after_with_keyword',
  WITHIN_MAP_EXPRESSION = 'within_map_expression',
  AFTER_COMMAND = 'after_command',
}

function getPosition(
  query: string,
  command: ESQLAstAllCommands,
  isExistingColumn: boolean
): { position: CompletionPosition | undefined; expressionRoot?: ESQLSingleAstItem } {
  const { prompt, targetField } = command as ESQLAstCompletionCommand;

  const arg1 = command.args[1];
  let paramsMap: ESQLMap | undefined;

  if (arg1 && 'type' in arg1 && arg1.type === 'option') {
    paramsMap = (arg1 as ESQLCommandOption).args[0] as ESQLMap;

    if (paramsMap && paramsMap.incomplete && !paramsMap.text) {
      return { position: CompletionPosition.AFTER_WITH_KEYWORD };
    }
  }

  if (paramsMap?.text && paramsMap.incomplete) {
    return { position: CompletionPosition.WITHIN_MAP_EXPRESSION };
  }

  if (paramsMap && !paramsMap.incomplete) {
    return { position: CompletionPosition.AFTER_COMMAND };
  }

  const expressionRoot = prompt;

  // (function, literal, or existing column) - handle as primaryExpression
  if (isFunctionExpression(expressionRoot) || isLiteral(prompt) || isExistingColumn) {
    return { position: CompletionPosition.EXPRESSION, expressionRoot };
  }

  if (targetField && !targetField.incomplete) {
    return { position: CompletionPosition.AFTER_TARGET_ASSIGNMENT };
  }

  if (prompt?.type === 'column' && query.endsWith(' ')) {
    return { position: CompletionPosition.AFTER_TARGET_FIELD };
  }

  return { position: CompletionPosition.AFTER_COMPLETION };
}
const promptText = 'Your prompt to the LLM.';
const promptSnippetText = `"$\{0:${promptText}}"`;

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  const hasTypedFragment = endsWithNonWhitespace(innerText);
  const { prompt } = command as ESQLAstCompletionCommand;
  const isExistingColumn = columnExists(prompt?.text, context);
  const { position, expressionRoot } = getPosition(innerText, command, isExistingColumn);

  if (!callbacks?.getByType) {
    return [];
  }

  const endpoints = context?.inferenceEndpoints;

  switch (position) {
    case CompletionPosition.AFTER_COMPLETION:
    case CompletionPosition.AFTER_TARGET_ASSIGNMENT: {
      const types = ['text', 'keyword', 'unknown'];
      const allSuggestions: ISuggestionItem[] = [];

      // Fields
      allSuggestions.push(
        ...(await getFieldsSuggestions(types, callbacks?.getByType, {
          ignoreColumns: [],
          values: false,
          addSpaceAfterField: false,
          openSuggestions: false,
        }))
      );

      // Date literals (policy-gated in helpers) with explicit UI options
      allSuggestions.push(
        ...getLiteralsSuggestions(types, Location.COMPLETION, {
          includeDateLiterals: true,
          includeCompatibleLiterals: false,
          addComma: false,
          advanceCursorAndOpenSuggestions: false,
        })
      );

      // Functions
      allSuggestions.push(
        ...getFunctionsSuggestions({
          location: Location.COMPLETION,
          types,
          options: { ignored: [] },
          context,
          callbacks,
        })
      );

      const fieldsAndFunctionsSuggestions = uniqBy(allSuggestions, 'label');
      const suggestions = fieldsAndFunctionsSuggestions.map((suggestion) =>
        withAutoSuggest({
          ...suggestion,
          text: `${suggestion.text} `,
        })
      );

      if (!hasTypedFragment) {
        suggestions.push({
          ...buildConstantsDefinitions(
            [promptSnippetText],
            '',
            undefined,
            undefined,
            SuggestionCategory.CONSTANT_VALUE
          )[0],
          label: promptText,
          asSnippet: true,
        });
      }

      if (position !== CompletionPosition.AFTER_TARGET_ASSIGNMENT) {
        suggestions.push(
          getNewUserDefinedColumnSuggestion(callbacks?.getSuggestedUserDefinedColumnName?.() || '')
        );
      }

      return suggestions;
    }

    case CompletionPosition.AFTER_TARGET_FIELD:
      return [assignCompletionItem];

    case CompletionPosition.EXPRESSION: {
      if (withinQuotes(innerText)) {
        return [];
      }

      if (!isLiteral(prompt)) {
        const { suggestions, computed } = await suggestForExpression({
          query,
          expressionRoot,
          command,
          cursorPosition,
          location: Location.COMPLETION,
          context,
          callbacks,
        });

        if (computed.insideFunction || !computed.isComplete) {
          return suggestions;
        }
      }

      return [
        {
          ...withCompleteItem,
          detail: i18n.translate('kbn-esql-ast.esql.definitions.completionWithDoc', {
            defaultMessage: 'Provide additional parameters for the LLM prompt.',
          }),
        },
      ];
    }

    case CompletionPosition.AFTER_WITH_KEYWORD:
      return [withMapCompleteItem];

    case CompletionPosition.WITHIN_MAP_EXPRESSION:
      const availableParameters: MapParameters = {
        inference_id: {
          type: 'string',
          suggestions: endpoints?.map(createInferenceEndpointToCompletionItem) || [],
        },
      };

      return getCommandMapExpressionSuggestions(innerText, availableParameters);

    case CompletionPosition.AFTER_COMMAND:
      return newLineAndPipeCompleteItems;

    default:
      return [];
  }
}
