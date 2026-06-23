/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { ESQLCommandOption, ESQLAstAllCommands } from '@elastic/esql/types';
import { isColumn, isOptionNode } from '@elastic/esql';
import { withAutoSuggest } from '../../../definitions/utils/autocomplete/helpers';
import type { ISuggestionItem } from '../../types';
import { buildFieldsDefinitions } from '../../../definitions/utils/functions';
import {
  commaCompleteItem,
  newLineAndPipeCompleteItems,
  pipeCompleteItem,
} from '../../complete_items';
import { SuggestionCategory } from '../../../../language/autocomplete/utils/sorting/types';
import { endsWithNonWhitespace } from '../../../definitions/utils/regex';

export const METADATA_FIELDS = [
  '_version',
  '_id',
  '_index',
  '_source',
  '_ignored',
  '_index_mode',
  '_score',
];

export const metadataSuggestion: ISuggestionItem = withAutoSuggest({
  label: 'METADATA',
  text: 'METADATA ',
  kind: 'Reference',
  detail: i18n.translate('kbn-esql-language.esql.definitions.metadataDoc', {
    defaultMessage: 'Metadata',
  }),
  category: SuggestionCategory.VALUE,
});

const METADATA_TRAILING_FRAGMENT_REGEX = /(?:METADATA|,)\s+(\S*)$/i;

const getMetadataFragment = (innerText: string) => {
  const match = innerText.match(METADATA_TRAILING_FRAGMENT_REGEX);
  return match?.[1] ?? '';
};

export const getMetadataSuggestions = (command: ESQLAstAllCommands, queryText: string) => {
  const metadataNode = command.args.find((arg) => isOptionNode(arg) && arg.name === 'metadata') as
    | ESQLCommandOption
    | undefined;

  // FROM index METADATA ... /
  if (metadataNode) {
    return suggestForMetadata(metadataNode, queryText);
  }
};

async function suggestForMetadata(metadata: ESQLCommandOption, innerText: string) {
  const existingFields = new Set(metadata.args.filter(isColumn).map(({ name }) => name));
  const filteredMetaFields = METADATA_FIELDS.filter((name) => !existingFields.has(name));
  const suggestions: ISuggestionItem[] = [];

  // FROM something METADATA /
  // FROM something METADATA field/
  // FROM something METADATA field, /
  if (/(?:,|METADATA)\s+$/i.test(innerText) || endsWithNonWhitespace(innerText)) {
    const prefix = getMetadataFragment(innerText);

    if (prefix && METADATA_FIELDS.includes(prefix)) {
      const completionSuggestions: ISuggestionItem[] = [
        {
          ...pipeCompleteItem,
          text: ' | ',
          preserveTypedPrefix: true,
        },
      ];
      if (filteredMetaFields.length > 1) {
        completionSuggestions.push(
          withAutoSuggest({
            ...commaCompleteItem,
            text: ', ',
            preserveTypedPrefix: true,
          })
        );
      }
      suggestions.push(...completionSuggestions);
      return suggestions;
    }

    suggestions.push(...buildFieldsDefinitions(filteredMetaFields));
  } else {
    // METADATA field /
    if (existingFields.size > 0) {
      if (filteredMetaFields.length > 0) {
        suggestions.push(commaCompleteItem);
      }
      suggestions.push(...newLineAndPipeCompleteItems);
    }
  }

  return suggestions;
}
