/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { ESQLAstAllCommands, ESQLAstUserAgentCommand } from '@elastic/esql/types';
import { isStringLiteral } from '@elastic/esql';
import type { MapParameters } from '../../definitions/utils/autocomplete/map_expression';
import { getCommandMapExpressionSuggestions } from '../../definitions/utils/autocomplete/map_expression';
import { suggestForExpression } from '../../definitions/utils/autocomplete/expressions';
import { ESQL_STRING_TYPES } from '../../definitions/types';
import {
  assignCompletionItem,
  buildAddValuePlaceholder,
  buildMapValueCompleteItem,
  newLineAndPipeCompleteItems,
  withCompleteItem,
} from '../complete_items';
import type { ICommandCallbacks, ICommandContext, ISuggestionItem } from '../types';
import { Location } from '../types';
import { getPosition, getPropertiesList, UserAgentPosition } from './utils';

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

  const userAgentCommand = command as ESQLAstUserAgentCommand;
  const position = getPosition(userAgentCommand, cursorPosition);

  switch (position) {
    case UserAgentPosition.AFTER_USER_AGENT_KEYWORD:
      return [
        {
          label: 'Columns prefix',
          text: '${1:user_agent} = ',
          asSnippet: true,
          kind: 'Reference',
          detail: 'The prefix for the columns being created.',
        },
      ];

    case UserAgentPosition.AFTER_TARGET_FIELD:
      return [assignCompletionItem];

    case UserAgentPosition.AFTER_ASSIGN: {
      // Only pass expressionRoot when the cursor is inside an incomplete sub-expression.
      // For empty / cursor-at-end-of-complete cases, treat as empty.
      const expressionRoot = userAgentCommand.expression;
      const { suggestions } = await suggestForExpression({
        query,
        expressionRoot,
        command,
        cursorPosition,
        location: Location.EVAL,
        context,
        callbacks,
        options: {
          preferredExpressionType: [...ESQL_STRING_TYPES],
        },
      });
      return suggestions;
    }

    case UserAgentPosition.AFTER_EXPRESSION:
      return [withCompleteItem, ...newLineAndPipeCompleteItems];

    case UserAgentPosition.AFTER_WITH_KEYWORD:
      return [buildAddValuePlaceholder('config')];

    case UserAgentPosition.WITHIN_OPTIONS: {
      const availableParameters: MapParameters = {
        regex_file: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.userAgent.autocomplete.regexFileDescription',
            { defaultMessage: 'Parser configuration file name' }
          ),
          suggestions: [buildMapValueCompleteItem('_default_')],
        },
        extract_device_type: {
          type: 'boolean',
          description: i18n.translate(
            'kbn-esql-language.commands.userAgent.autocomplete.extractDeviceTypeDescription',
            { defaultMessage: 'Extract device type (Desktop, Phone, Tablet)' }
          ),
          suggestions: [buildMapValueCompleteItem('true'), buildMapValueCompleteItem('false')],
        },
        properties: {
          type: 'array',
          description: i18n.translate(
            'kbn-esql-language.commands.userAgent.autocomplete.propertiesDescription',
            { defaultMessage: 'List of properties to extract' }
          ),
          suggestions: [buildMapValueCompleteItem('[ $0 ]', '[]')],
        },
      };
      return getCommandMapExpressionSuggestions(
        query.substring(0, cursorPosition),
        availableParameters
      );
    }

    case UserAgentPosition.WITHIN_PROPERTIES_ARRAY: {
      const propertiesList = getPropertiesList(userAgentCommand);
      const usedValues = new Set(
        propertiesList?.values.filter(isStringLiteral).map((v) => v.valueUnquoted) ?? []
      );
      return ['name', 'version', 'os', 'device']
        .filter((v) => !usedValues.has(v))
        .map((v) => buildMapValueCompleteItem(`"${v}"`));
    }

    case UserAgentPosition.AFTER_COMMAND:
      return newLineAndPipeCompleteItems;

    default:
      return [];
  }
}
