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
import type { ISuggestionItem, ICommandCallbacks, ICommandContext } from '../types';
import { autocomplete as statsAutocomplete } from '../stats/autocomplete';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  if (!callbacks?.getByType || !callbacks?.getColumnsForQuery) {
    return [];
  }

  // Temporary during command-context migration: migrated commands are called through
  // autocomplete preparation, so prepared command text is expected to exist.
  const commandText = context!.commandSegment!.text;

  const currentInput = commandText.toUpperCase();
  const afterInlineMatch = currentInput.match(/^INLINE\s+(.*)$/);

  // If user typed "INLINE " + partial STATS, suggest STATS (check this first)
  if (afterInlineMatch) {
    const afterInline = afterInlineMatch[1];

    if ('STATS'.startsWith(afterInline) && afterInline.length <= 'INLINE'.length) {
      return [
        withAutoSuggest({
          label: 'STATS',
          text: 'STATS ',
          kind: 'Keyword',
          detail: i18n.translate('kbn-esql-language.esql.autocomplete.inlineStats.statsKeyword', {
            defaultMessage: 'STATS keyword',
          }),
        }),
      ];
    }
  }

  // If user typed something that could become INLINE, suggest INLINE STATS
  const trimmedInput = currentInput.trim();

  if ('INLINE'.startsWith(trimmedInput) && trimmedInput.length <= 'INLINE'.length) {
    return [
      withAutoSuggest({
        label: 'INLINE STATS',
        text: 'INLINE STATS ',
        kind: 'Keyword',
        detail: i18n.translate(
          'kbn-esql-language.esql.autocomplete.inlineStats.commandSuggestion',
          {
            defaultMessage: 'INLINE STATS command',
          }
        ),
      }),
    ];
  }

  // case "INLINE STATS" or "INLINE (...more spaces) STATS "
  const hasCompleteInlineStats = /^INLINE\s+STATS(\s|$)/.test(currentInput);
  if (hasCompleteInlineStats) {
    return statsAutocomplete(query, command, callbacks, context, cursorPosition);
  }

  return [];
}
