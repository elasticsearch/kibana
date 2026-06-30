/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  ESQLControlVariable,
  InferenceEndpointAutocompleteItem,
  ControlTriggerSource,
} from '@kbn/esql-types';
import { ESQLVariableType } from '@kbn/esql-types';
import { i18n } from '@kbn/i18n';
import { uniqBy } from 'lodash';
import type { GetColumnsByTypeFn, ICommandContext, ISuggestionItem } from '../../../registry/types';
import type { SupportedDataType } from '../../types';
import { SuggestionCategory } from '../../../../language/autocomplete/utils/sorting/types';
import { buildConstantsDefinitions } from '../literals';
import { getColumnByName } from '../shared';

export const shouldBeQuotedText = (
  text: string,
  { dashSupported }: { dashSupported?: boolean } = {}
) => {
  return dashSupported ? /[^a-zA-Z\d_\.@-]/.test(text) : /[^a-zA-Z\d_\.@]/.test(text);
};

export const getSafeInsertText = (text: string, options: { dashSupported?: boolean } = {}) => {
  return shouldBeQuotedText(text, options) ? `\`${text.replace(/`/g, '``')}\`` : text;
};

export const buildUserDefinedColumnsDefinitions = (
  userDefinedColumns: string[]
): ISuggestionItem[] =>
  userDefinedColumns.map((label) => ({
    label,
    text: getSafeInsertText(label),
    kind: 'Variable',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.variableDefinition', {
      defaultMessage: `Column specified by the user within the ES|QL query`,
    }),
    category: SuggestionCategory.USER_DEFINED_COLUMN,
  }));

export const findFinalWord = (text: string) => {
  const words = text.split(/\s+/);
  return words[words.length - 1];
};

export function findPreviousWord(text: string) {
  const words = text.split(/\s+/);
  return words[words.length - 2];
}

export function withinQuotes(text: string) {
  const quoteCount = (text.match(/"/g) || []).length;
  return quoteCount % 2 === 1;
}

interface FieldSuggestionsOptions {
  ignoreColumns?: string[];
  values?: boolean;
  addSpaceAfterField?: boolean;
  openSuggestions?: boolean;
  addComma?: boolean;
  canBeMultiValue?: boolean;
}

export async function getFieldsSuggestions(
  types: (SupportedDataType | 'unknown' | 'any')[],
  getFieldsByType: GetColumnsByTypeFn,
  options: FieldSuggestionsOptions = {}
): Promise<ISuggestionItem[]> {
  const {
    ignoreColumns = [],
    values = false,
    addSpaceAfterField = false,
    openSuggestions = false,
    addComma = false,
    canBeMultiValue = false,
  } = options;

  const variableType = (() => {
    if (canBeMultiValue) return ESQLVariableType.MULTI_VALUES;
    if (values) return ESQLVariableType.VALUES;
    return ESQLVariableType.FIELDS;
  })();

  return (await getFieldsByType(types, ignoreColumns, {
    advanceCursor: addSpaceAfterField,
    openSuggestions,
    addComma,
    variableType,
  })) as ISuggestionItem[];
}

export function getLastNonWhitespaceChar(text: string) {
  return text[text.trimEnd().length - 1];
}

export const columnExists = (col: string, context?: ICommandContext) =>
  Boolean(context ? getColumnByName(col, context) : undefined);

export function getControlSuggestion(
  type: ESQLVariableType,
  triggerSource: ControlTriggerSource,
  variables?: string[],
  suggestCreation = true
): ISuggestionItem[] {
  return [
    ...(suggestCreation
      ? [
          {
            label: i18n.translate('kbn-esql-language.esql.autocomplete.createControlLabel', {
              defaultMessage: 'Create control',
            }),
            text: '',
            kind: 'Issue',
            detail: i18n.translate('kbn-esql-language.esql.autocomplete.createControlDetailLabel', {
              defaultMessage: 'Click to create',
            }),
            category: SuggestionCategory.CUSTOM_ACTION,
            command: {
              id: `esql.control.${type}.create`,
              title: i18n.translate(
                'kbn-esql-language.esql.autocomplete.createControlDetailLabel',
                {
                  defaultMessage: 'Click to create',
                }
              ),
              arguments: [{ triggerSource }],
            },
          } as ISuggestionItem,
        ]
      : []),
    ...(variables?.length
      ? buildConstantsDefinitions(
          variables,
          i18n.translate('kbn-esql-language.esql.autocomplete.namedParamDefinition', {
            defaultMessage: 'Named parameter',
          }),
          undefined,
          undefined,
          SuggestionCategory.USER_DEFINED_COLUMN
        )
      : []),
  ];
}

export const getVariablePrefix = (variableType: ESQLVariableType) =>
  variableType === ESQLVariableType.FIELDS || variableType === ESQLVariableType.FUNCTIONS
    ? '??'
    : '?';

export function getControlSuggestionIfSupported(
  supportsControls: boolean,
  type: ESQLVariableType,
  triggerSource: ControlTriggerSource,
  variables?: ESQLControlVariable[],
  shouldBePrefixed = true
) {
  const prefix = shouldBePrefixed ? getVariablePrefix(type) : '';
  const filteredVariables = variables?.filter((variable) => variable.type === type) ?? [];

  const controlSuggestion = getControlSuggestion(
    type,
    triggerSource,
    filteredVariables?.map((v) => `${prefix}${v.key}`),
    supportsControls
  );

  return controlSuggestion;
}

export function createInferenceEndpointToCompletionItem(
  inferenceEndpoint: InferenceEndpointAutocompleteItem
): ISuggestionItem {
  return {
    detail: i18n.translate('kbn-esql-language.esql.definitions.rerankInferenceIdDoc', {
      defaultMessage: 'Inference endpoint used for the completion',
    }),
    kind: 'Reference',
    label: inferenceEndpoint.inference_id,
    text: inferenceEndpoint.inference_id,
    category: SuggestionCategory.VALUE,
  };
}

/**
 * Given a suggestion item, decorates it with editor.action.triggerSuggest
 * that triggers the autocomplete dialog again after accepting the suggestion.
 *
 * If the suggestion item already has a custom command, it will preserve it, by attaching
 * the triggerSuggest command as part of a multiCommands execution.
 */
export function withAutoSuggest(suggestionItem: ISuggestionItem): ISuggestionItem {
  const triggerAutoSuggestCommand = {
    title: 'Trigger Suggestion Dialog',
    id: 'editor.action.triggerSuggest',
  };

  return appendCommandToSuggestionItem(suggestionItem, triggerAutoSuggestCommand);
}

/**
 * Appends a command to a suggestion item, preserving existing commands by using multiCommands if necessary.
 * @param suggestionItem
 * @param commandToAppend
 * @returns
 */
export function appendCommandToSuggestionItem(
  suggestionItem: ISuggestionItem,
  commandToAppend: ISuggestionItem['command']
): ISuggestionItem {
  if (!commandToAppend) {
    return suggestionItem;
  }

  // If the suggestion has multiCommands, append the new command
  if (suggestionItem.command?.id === 'esql.multiCommands') {
    const existingCommands: ISuggestionItem['command'][] = suggestionItem.command.arguments
      ? JSON.parse(suggestionItem.command.arguments[0].commands)
      : [];

    return {
      ...suggestionItem,
      command: createMultiCommand([...existingCommands, commandToAppend]),
    };
  }

  // If the suggestion already has a command, use multiCommands to execute the existing one
  // and then the new command
  const command =
    suggestionItem.command && suggestionItem.command.id !== commandToAppend.id
      ? createMultiCommand([suggestionItem.command, commandToAppend])
      : commandToAppend;

  return {
    ...suggestionItem,
    command,
  };
}

function createMultiCommand(
  commands: Array<ISuggestionItem['command']>
): ISuggestionItem['command'] {
  return {
    id: 'esql.multiCommands',
    title: 'Execute multiple commands',
    arguments: [
      {
        commands: JSON.stringify(uniqBy(commands, 'id')),
      },
    ],
  };
}

export function getLookupIndexCreateSuggestion(indexName?: string): ISuggestionItem {
  return {
    label: indexName
      ? i18n.translate(
          'kbn-esql-language.esql.autocomplete.createLookupIndexWithName',

          {
            defaultMessage: 'Create lookup index "{indexName}"',

            values: { indexName },
          }
        )
      : i18n.translate('kbn-esql-language.esql.autocomplete.createLookupIndex', {
          defaultMessage: 'Create lookup index',
        }),

    text: indexName,

    kind: 'Issue',

    filterText: indexName,

    detail: i18n.translate(
      'kbn-esql-language.esql.autocomplete.createLookupIndexDetailLabel',

      {
        defaultMessage: 'Click to create',
      }
    ),

    category: SuggestionCategory.CUSTOM_ACTION,

    command: {
      id: `esql.lookup_index.create`,

      title: i18n.translate(
        'kbn-esql-language.esql.autocomplete.createLookupIndexDetailLabel',

        {
          defaultMessage: 'Click to create',
        }
      ),

      arguments: [{ indexName }],
    },

    incomplete: true,
  } as ISuggestionItem;
}
