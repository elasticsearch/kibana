/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { ESQLAstAllCommands } from '@elastic/esql/types';
import { withAutoSuggest } from '../../definitions/utils/autocomplete/helpers';
import type { ICommandCallbacks } from '../types';
import {
  newLineAndPipeCompleteItems,
  colonCompleteItem,
  semiColonCompleteItem,
} from '../complete_items';
import { type ISuggestionItem, type ICommandContext } from '../types';
import { buildConstantsDefinitions } from '../../definitions/utils/literals';
import { ESQL_STRING_TYPES } from '../../definitions/types';
import { findAutocompleteAstPosition } from '../../../language/shared/parse_for_autocomplete_query';
import { endsWithWhitespace } from '../../definitions/utils/regex';

const appendSeparatorCompletionItem: ISuggestionItem = withAutoSuggest({
  detail: i18n.translate('kbn-esql-language.esql.definitions.appendSeparatorDoc', {
    defaultMessage:
      'The character(s) that separate the appended fields. Default to empty string ("").',
  }),
  kind: 'Reference',
  label: 'APPEND_SEPARATOR',
  text: 'APPEND_SEPARATOR = ',
});

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  const commandArgs = command.args.filter((arg) => !Array.isArray(arg) && arg.type !== 'unknown');

  // If cursor is inside a string literal, don't suggest anything
  const { node } = findAutocompleteAstPosition(query, cursorPosition);

  if (node?.type === 'literal' && node.literalType === 'keyword') {
    return [];
  }

  // DISSECT field/
  if (commandArgs.length === 1 && endsWithWhitespace(innerText)) {
    return buildConstantsDefinitions(
      ['"%{firstWord}"'],
      i18n.translate('kbn-esql-language.esql.autocomplete.aPatternString', {
        defaultMessage: 'A pattern string',
      }),
      {
        advanceCursorAndOpenSuggestions: true,
      }
    );
  }
  // DISSECT field pattern /
  else if (commandArgs.length === 2) {
    return [...newLineAndPipeCompleteItems, appendSeparatorCompletionItem];
  }
  // DISSECT field APPEND_SEPARATOR = /
  else if (/append_separator\s*=\s*$/i.test(innerText)) {
    return [colonCompleteItem, semiColonCompleteItem];
  }
  // DISSECT field APPEND_SEPARATOR = ":" /
  else if (commandArgs.some((arg) => !Array.isArray(arg) && arg.type === 'option')) {
    return newLineAndPipeCompleteItems;
  }

  // DISSECT /
  const fieldSuggestions = (await callbacks?.getByType?.(ESQL_STRING_TYPES)) ?? [];
  return fieldSuggestions.map((sug) => {
    const withSpace = {
      ...sug,
      text: `${sug.text} `,
    };

    return withAutoSuggest(withSpace);
  });
}
