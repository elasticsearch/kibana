/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { ESQLAstAllCommands, ESQLAstHighlightCommand } from '@elastic/esql/types';
import type { ICommandCallbacks, ISuggestionItem, ICommandContext } from '../types';
import { SuggestionCategory } from '../../../language/autocomplete/utils/sorting/types';
import { Location } from '../types';
import { getPosition, CaretPosition } from './utils';
import {
  onCompleteItem,
  withCompleteItem,
  buildAddValuePlaceholder,
  buildMapValueCompleteItem,
  newLineAndPipeCompleteItems,
} from '../complete_items';
import { buildConstantsDefinitions } from '../../definitions/utils/literals';
import { suggestFieldsList } from '../../definitions/utils/autocomplete/fields_list';
import type { MapParameters } from '../../definitions/utils/autocomplete/map_expression';
import { getCommandMapExpressionSuggestions } from '../../definitions/utils/autocomplete/map_expression';

export const QUERY_TEXT = 'Your search query' as const;
export const QUERY_TEXT_SNIPPET = `"$\{0:${QUERY_TEXT}}"`;

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  const highlightCommand = command as ESQLAstHighlightCommand;
  const innerText = query.substring(0, cursorPosition);

  if (!callbacks?.getByType) {
    return [];
  }

  const position = getPosition(highlightCommand, cursorPosition);

  switch (position) {
    case CaretPosition.HIGHLIGHT_KEYWORD: {
      return [
        {
          ...buildConstantsDefinitions(
            [QUERY_TEXT_SNIPPET],
            '',
            undefined,
            undefined,
            SuggestionCategory.CONSTANT_VALUE
          )[0],
          label: QUERY_TEXT,
          asSnippet: true,
        },
      ];
    }

    case CaretPosition.ON_KEYWORD: {
      return [onCompleteItem];
    }

    case CaretPosition.ON_EXPRESSION: {
      return suggestFieldsList(
        query,
        command,
        highlightCommand.highlightFields ?? [],
        Location.HIGHLIGHT,
        callbacks,
        context,
        cursorPosition,
        {
          afterCompleteSuggestions: [withCompleteItem],
          allowSingleColumnFields: true,
          preferredExpressionType: ['text', 'keyword'],
        }
      );
    }

    case CaretPosition.AFTER_WITH_KEYWORD: {
      return [buildAddValuePlaceholder('config')];
    }

    case CaretPosition.WITHIN_MAP_EXPRESSION: {
      const availableParameters: MapParameters = {
        pre_tags: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.preTagsDescription',
            {
              defaultMessage: 'HTML tag to insert before highlighted text (default: <em>)',
              ignoreTag: true,
            }
          ),
          suggestions: [buildMapValueCompleteItem('<em>')],
        },
        post_tags: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.postTagsDescription',
            {
              defaultMessage: 'HTML tag to insert after highlighted text (default: </em>)',
              ignoreTag: true,
            }
          ),
          suggestions: [buildMapValueCompleteItem('</em>')],
        },
        number_of_fragments: {
          type: 'number',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.numberOfFragmentsDescription',
            { defaultMessage: 'Maximum number of fragments to return (default: 5)' }
          ),
          suggestions: [buildMapValueCompleteItem('5')],
        },
        fragment_size: {
          type: 'number',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.fragmentSizeDescription',
            { defaultMessage: 'Size of each fragment in characters (default: 100)' }
          ),
          suggestions: [buildMapValueCompleteItem('100')],
        },
        encoder: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.encoderDescription',
            { defaultMessage: 'Encoding for highlighted text: default or html (default: default)' }
          ),
          suggestions: [buildMapValueCompleteItem('default'), buildMapValueCompleteItem('html')],
        },
        boundary_scanner: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.boundaryScannerDescription',
            { defaultMessage: 'How to split fragments: sentence or word (default: sentence)' }
          ),
          suggestions: [buildMapValueCompleteItem('sentence'), buildMapValueCompleteItem('word')],
        },
        boundary_scanner_locale: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.boundaryScannerLocaleDescription',
            { defaultMessage: 'Locale for boundary scanning (default: Locale.ROOT)' }
          ),
          suggestions: [],
        },
        boundary_chars: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.boundaryCharsDescription',
            { defaultMessage: 'Characters used as boundary markers (default: .,!? \\t\\n)' }
          ),
          suggestions: [],
        },
        boundary_max_scan: {
          type: 'number',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.boundaryMaxScanDescription',
            { defaultMessage: 'Maximum characters scanned for a boundary (default: 20)' }
          ),
          suggestions: [buildMapValueCompleteItem('20')],
        },
        order: {
          type: 'string',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.orderDescription',
            { defaultMessage: 'Order of fragments: none or score (default: none)' }
          ),
          suggestions: [buildMapValueCompleteItem('none'), buildMapValueCompleteItem('score')],
        },
        no_match_size: {
          type: 'number',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.noMatchSizeDescription',
            { defaultMessage: 'Characters to return when there is no match (default: 0)' }
          ),
          suggestions: [buildMapValueCompleteItem('0')],
        },
        max_analyzed_offset: {
          type: 'number',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.maxAnalyzedOffsetDescription',
            { defaultMessage: 'Maximum character offset to analyze (default: index setting)' }
          ),
          suggestions: [],
        },
        phrase_limit: {
          type: 'number',
          description: i18n.translate(
            'kbn-esql-language.commands.highlight.autocomplete.phraseLimitDescription',
            { defaultMessage: 'Maximum number of phrases to examine (default: 256)' }
          ),
          suggestions: [buildMapValueCompleteItem('256')],
        },
      };

      return getCommandMapExpressionSuggestions(innerText, availableParameters);
    }

    case CaretPosition.AFTER_COMMAND: {
      return newLineAndPipeCompleteItems;
    }

    default: {
      return [];
    }
  }
}
