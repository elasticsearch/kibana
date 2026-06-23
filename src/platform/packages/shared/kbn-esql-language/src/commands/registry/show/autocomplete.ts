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
import type { ICommandCallbacks } from '../types';
import { type ISuggestionItem, type ICommandContext } from '../types';
import { newLineAndPipeCompleteItems } from '../complete_items';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);
  // SHOW INFO /
  if (/INFO\s+$/i.test(innerText)) {
    return newLineAndPipeCompleteItems;
  }
  // SHOW LOLZ /
  else if (/SHOW\s+\S+\s+$/i.test(innerText)) {
    return [];
  }
  // SHOW /
  return [
    {
      text: 'INFO',
      detail: i18n.translate('kbn-esql-language.esql.show.info.detail', {
        defaultMessage: 'Get information about the Elasticsearch cluster.',
      }),
      kind: 'Method',
      label: 'INFO',
    },
  ];
}
