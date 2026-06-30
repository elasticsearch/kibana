/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { ISuggestionItem } from './types';
import { esqlCommandRegistry } from '.';
import { buildDocumentation } from '../definitions/utils/documentation';
import { buildConstantsDefinitions, TIME_SYSTEM_PARAMS } from '../definitions/utils/literals';
import { withAutoSuggest } from '../definitions/utils/autocomplete/helpers';
import { techPreviewLabel } from '../definitions/utils/shared';
import { SuggestionCategory } from '../../language/autocomplete/utils/sorting/types';
import {
  ESQL_STRING_TYPES,
  ESQL_COMMON_NUMERIC_TYPES,
  ESQL_NAMED_PARAMS_TYPE,
} from '../definitions/types';
import { PROMQL_PARAMS } from './promql/utils';

function buildCharCompleteItem(
  label: string,
  detail: string,
  {
    quoted,
    advanceCursorAndOpenSuggestions,
    category,
  }: {
    quoted: boolean;
    advanceCursorAndOpenSuggestions?: boolean;
    category?: SuggestionCategory;
  } = {
    quoted: false,
  }
): ISuggestionItem {
  const suggestion: ISuggestionItem = {
    label,
    text: (quoted ? `"${label}"` : label) + (advanceCursorAndOpenSuggestions ? ' ' : ''),
    kind: 'Keyword',
    detail,
    ...(category && { category }),
  };
  return advanceCursorAndOpenSuggestions ? withAutoSuggest(suggestion) : suggestion;
}

export const pipeCompleteItem: ISuggestionItem = withAutoSuggest({
  label: '|',
  text: '| ',
  kind: 'Keyword',
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.pipeDoc', {
    defaultMessage: 'Pipe (|)',
  }),
  category: SuggestionCategory.PIPE,
});

export const newLineCompleteItem: ISuggestionItem = withAutoSuggest({
  label: `${i18n.translate('kbn-esql-language.esql.autocomplete.newLineLabel', {
    defaultMessage: 'New line',
  })} ⏎`,
  filterText: '',
  text: '\n',
  kind: 'Keyword',
  detail: '⇧↵',
  category: SuggestionCategory.NEW_LINE,
});

export const newLineAndPipeCompleteItems: ISuggestionItem[] = [
  newLineCompleteItem,
  pipeCompleteItem,
];

export const allStarConstant: ISuggestionItem = {
  label: i18n.translate('kbn-esql-language.esql.autocomplete.allStarConstantDoc', {
    defaultMessage: 'All (*)',
  }),
  text: '*',
  kind: 'Constant',
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.allStarConstantDoc', {
    defaultMessage: 'All (*)',
  }),
  category: SuggestionCategory.CONSTANT_VALUE,
};

export function buildMapKeySuggestion(
  paramName: string,
  valueType: MapValueType = 'string',
  description?: string,
  options?: MapKeySuggestionOptions
): ISuggestionItem {
  const text = `"${paramName}": ${MAP_VALUE_SNIPPETS[valueType]}`;
  const isSnippet = text.includes('$0');

  return withAutoSuggest({
    label: paramName,
    text,
    asSnippet: isSnippet,
    kind: 'Constant',
    detail: description || paramName,
    ...(options?.filterText && { filterText: options.filterText }),
    ...(options?.replacementRangeStrategy && {
      replacementRangeStrategy: options.replacementRangeStrategy,
    }),
  });
}

export type ConstantPlaceholderType = 'value' | 'number' | 'config' | 'default';

export const PLACEHOLDER_CONFIG: Record<
  ConstantPlaceholderType,
  { snippet: string; matchTypes: readonly string[] }
> = {
  config: {
    snippet: '{ $0 }',
    matchTypes: [ESQL_NAMED_PARAMS_TYPE],
  },
  value: {
    snippet: '"${0:value}"',
    matchTypes: [...ESQL_STRING_TYPES, 'ip', 'version'],
  },
  number: {
    snippet: '${0:0}',
    matchTypes: [...ESQL_COMMON_NUMERIC_TYPES, 'unsigned_long'],
  },
  default: {
    snippet: '"${0:default}"',
    matchTypes: [],
  },
};

export const valuePlaceholderConstant: ISuggestionItem = buildAddValuePlaceholder('value');
export const defaultValuePlaceholderConstant: ISuggestionItem = buildAddValuePlaceholder('default');

export function buildAddValuePlaceholder(
  placeholderType: ConstantPlaceholderType,
  options?: MapKeySuggestionOptions
): ISuggestionItem {
  const text = PLACEHOLDER_CONFIG[placeholderType].snippet;

  return withAutoSuggest({
    label: i18n.translate(
      `kbn-esql-ast.esql.autocomplete.constantOnlyPlaceholder.${placeholderType}.label`,
      {
        defaultMessage: 'Insert {placeholderType} placeholder',
        values: { placeholderType },
      }
    ),
    text,
    asSnippet: true,
    kind: 'Value',
    detail: i18n.translate('kbn-esql-ast.esql.autocomplete.valuePlaceholderDetail', {
      defaultMessage: 'Insert a {placeholderType} to describe the condition',
      values: { placeholderType },
    }),
    category: SuggestionCategory.VALUE,
    filterText: text,
    ...(options?.replacementRangeStrategy && {
      replacementRangeStrategy: options.replacementRangeStrategy,
    }),
  });
}

/** Finds the placeholder type that matches the given ES|QL types */
export function findConstantPlaceholderType(
  types: readonly string[]
): ConstantPlaceholderType | undefined {
  for (const placeholderType of Object.keys(PLACEHOLDER_CONFIG) as ConstantPlaceholderType[]) {
    const { matchTypes } = PLACEHOLDER_CONFIG[placeholderType];

    if (types.some((type) => matchTypes.includes(type))) {
      return placeholderType;
    }
  }

  return undefined;
}

export function buildMapValueCompleteItem(value: string, label: string = ''): ISuggestionItem {
  const detail = i18n.translate('kbn-esql-ast.esql.autocomplete.mapValuePlaceholderDetail', {
    defaultMessage: 'Insert {label} as value for the map key',
    values: { label: label || value },
  });
  const asSnippet = value.includes('$0');

  return {
    label: label || value,
    text: value,
    kind: 'Constant',
    detail,
    asSnippet,
    category: SuggestionCategory.CONSTANT_VALUE,
  };
}

export function getPromqlParamKeySuggestions(): ISuggestionItem[] {
  return PROMQL_PARAMS.map(({ name, description }) =>
    withAutoSuggest({
      label: name,
      text: `${name} = `,
      kind: 'Value',
      detail: i18n.translate(`kbn-esql-language.esql.autocomplete.promql.${name}ParamDoc`, {
        defaultMessage: description,
      }),
      category: SuggestionCategory.VALUE,
    })
  );
}

export const commaCompleteItem = buildCharCompleteItem(
  ',',
  i18n.translate('kbn-esql-language.esql.autocomplete.commaDoc', {
    defaultMessage: 'Comma (,)',
  }),
  { quoted: false, category: SuggestionCategory.COMMA }
);

export const promqlByCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'by',
  text: 'by ($0) ',
  asSnippet: true,
  kind: 'Reference',
  category: SuggestionCategory.LANGUAGE_KEYWORD,
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.promql.byDoc', {
    defaultMessage: 'Group by labels',
  }),
});

export const promqlLabelSelectorItem: ISuggestionItem = withAutoSuggest({
  label: i18n.translate('kbn-esql-language.esql.autocomplete.promql.addLabelSelector', {
    defaultMessage: 'Add selector',
  }),
  text: '{$0}',
  asSnippet: true,
  kind: 'Reference',
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.promql.labelSelectorDoc', {
    defaultMessage: 'Filter by labels',
  }),
  category: SuggestionCategory.PROMQL_METRIC_QUALIFIER,
});

export const promqlRangeSelectorItem: ISuggestionItem = withAutoSuggest({
  label: i18n.translate('kbn-esql-language.esql.autocomplete.promql.addRangeSelector', {
    defaultMessage: 'Add time range',
  }),
  text: '[${0:5m}]',
  asSnippet: true,
  kind: 'Reference',
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.promql.rangeSelectorDoc', {
    defaultMessage: 'Range selector (duration)',
  }),
  category: SuggestionCategory.PROMQL_METRIC_QUALIFIER,
});

export const promqlOpenParensCompleteItem: ISuggestionItem = withAutoSuggest({
  label: '()',
  text: '($0) ',
  asSnippet: true,
  kind: 'Snippet',
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.promql.addFunctionArguments', {
    defaultMessage: 'Add function arguments',
  }),
});

export const byCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'BY',
  text: 'BY ',
  kind: 'Reference',
  detail: 'By',
  category: SuggestionCategory.LANGUAGE_KEYWORD,
});

export const whereCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'WHERE',
  text: 'WHERE ',
  kind: 'Reference',
  detail: 'Where',
  category: SuggestionCategory.LANGUAGE_KEYWORD,
});

export const onCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'ON',
  text: 'ON ',
  kind: 'Reference',
  detail: 'On',
  category: SuggestionCategory.LANGUAGE_KEYWORD,
});

export const withCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'WITH',
  text: 'WITH { $0 }',
  asSnippet: true,
  kind: 'Reference',
  detail: 'With',
  category: SuggestionCategory.LANGUAGE_KEYWORD,
});

export const withMapCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'inference_id',
  text: '{ "inference_id": "$0" }',
  asSnippet: true,
  kind: 'Reference',
  detail: 'Inference endpoint',
});

export const mmrQueryVectorSuggestion: ISuggestionItem = {
  label: 'query vector',
  text: '[${0:0.1}, ${1:0.2}]::dense_vector ',
  asSnippet: true,
  kind: 'Value',
  detail: i18n.translate('kbn-esql-language.commands.mmr.autocomplete.queryVectorSuggestion', {
    defaultMessage: 'Inline query vector',
  }),
  category: SuggestionCategory.VALUE,
};

export const mmrLimitKeywordSuggestion: ISuggestionItem = {
  label: 'LIMIT',
  text: 'LIMIT ',
  kind: 'Reference',
  detail: i18n.translate('kbn-esql-language.commands.mmr.autocomplete.limitKeywordSuggestion', {
    defaultMessage: 'Limit',
  }),
};

export const defaultLimitValueSuggestions = ['10', '100', '1000'];

// wrapping in a function to avoid circular dependency issues with the tests
export const mmrLimitValueSuggestions: () => ISuggestionItem[] = () =>
  buildConstantsDefinitions(
    defaultLimitValueSuggestions,
    i18n.translate('kbn-esql-language.commands.mmr.autocomplete.limitValueSuggestion', {
      defaultMessage: 'Suggested limit',
    }),
    {
      advanceCursorAndOpenSuggestions: true,
    }
  );

export const mmrLambdaMapSuggestion: ISuggestionItem = {
  label: 'lambda',
  text: '{ "lambda": ${0:0.5} }',
  asSnippet: true,
  kind: 'Value',
  detail: i18n.translate('kbn-esql-language.commands.mmr.autocomplete.lambdaMapSuggestion', {
    defaultMessage: 'MMR options configuration',
  }),
};

export const mmrLambdaValueSuggestion: ISuggestionItem = {
  label: '0.5',
  text: '0.5',
  kind: 'Value',
  detail: i18n.translate('kbn-esql-language.commands.mmr.autocomplete.lambdaSuggestion', {
    defaultMessage: 'Suggested lambda',
  }),
};

// ================================
// Map Expression Builders
// ================================

export type MapValueType = 'string' | 'number' | 'boolean' | 'map' | 'array';

export const MAP_VALUE_SNIPPETS: Record<MapValueType, string> = {
  string: '"$0"',
  number: '',
  boolean: '',
  map: '{ $0 }',
  array: '[ $0 ]',
};

export interface MapKeySuggestionOptions {
  filterText?: string;
  replacementRangeStrategy?: ISuggestionItem['replacementRangeStrategy'];
}

function buildSubqueryCompleteItem(sourceCommand: string): ISuggestionItem {
  const commandName = sourceCommand.toUpperCase();

  return withAutoSuggest({
    label: `(${commandName} ...)`,
    text: `(${commandName} $0)`,
    asSnippet: true,
    kind: 'Method',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.subquerySourceDoc', {
      defaultMessage: 'Adds a nested ES|QL query to your current query',
    }),
    category: SuggestionCategory.SUBQUERY,
  });
}

export function buildSubqueryCompleteItems(): ISuggestionItem[] {
  return esqlCommandRegistry
    .getAllCommands()
    .filter(({ metadata }) => metadata.subquerySource === true && metadata.hidden !== true)
    .map(({ name }) => buildSubqueryCompleteItem(name));
}

export const minMaxValueCompleteItem: ISuggestionItem = {
  label: 'minmax',
  text: 'minmax',
  kind: 'Value',
  detail: 'minmax',
  category: SuggestionCategory.VALUE,
};

export const noneValueCompleteItem: ISuggestionItem = {
  label: 'none',
  text: 'none',
  kind: 'Value',
  detail: 'none',
  category: SuggestionCategory.VALUE,
};

export const getNewUserDefinedColumnSuggestion = (label: string): ISuggestionItem => {
  return withAutoSuggest({
    label,
    text: `${label} = `,
    kind: 'Variable',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.newVarDoc', {
      defaultMessage: 'Define a new column',
    }),
    category: SuggestionCategory.USER_DEFINED_COLUMN,
  });
};

export const assignCompletionItem: ISuggestionItem = withAutoSuggest({
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.newVarDoc', {
    defaultMessage: 'Define a new column',
  }),
  label: '=',
  kind: 'Variable',
  text: '= ',
  category: SuggestionCategory.USER_DEFINED_COLUMN,
});

export const asCompletionItem: ISuggestionItem = {
  detail: i18n.translate('kbn-esql-language.esql.definitions.asDoc', {
    defaultMessage: 'As',
  }),
  kind: 'Reference',
  label: 'AS',
  text: 'AS ',
  category: SuggestionCategory.LANGUAGE_KEYWORD,
};

export const colonCompleteItem = buildCharCompleteItem(
  ':',
  i18n.translate('kbn-esql-language.esql.autocomplete.colonDoc', {
    defaultMessage: 'Colon (:)',
  }),
  { quoted: true, advanceCursorAndOpenSuggestions: true }
);

export const semiColonCompleteItem = buildCharCompleteItem(
  ';',
  i18n.translate('kbn-esql-language.esql.autocomplete.semiColonDoc', {
    defaultMessage: 'Semi colon (;)',
  }),
  { quoted: true, advanceCursorAndOpenSuggestions: true }
);

export const listCompleteItem: ISuggestionItem = withAutoSuggest({
  label: '( ... )',
  text: '($0)',
  asSnippet: true,
  kind: 'Operator',
  detail: i18n.translate('kbn-esql-language.esql.autocomplete.listDoc', {
    defaultMessage: 'List of items ( ...)',
  }),
});

export const likePatternItems: ISuggestionItem[] = [
  {
    label: '*',
    text: '"${0:*}"',
    asSnippet: true,
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.likeAsteriskDoc', {
      defaultMessage: 'Matches any sequence of zero or more characters',
    }),
  },
  {
    label: '?',
    text: '"${0:?}"',
    asSnippet: true,
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.likeQuestionMarkDoc', {
      defaultMessage: 'Matches any single character',
    }),
  },
];

export const rlikePatternItems: ISuggestionItem[] = [
  {
    label: '.*',
    text: '"${0:.*}"',
    asSnippet: true,
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.rlikeAnyStringDoc', {
      defaultMessage: 'Matches any sequence of zero or more characters',
    }),
  },
  {
    label: '.',
    text: '"${0:.}"',
    asSnippet: true,
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.rlikeAnySingleCharDoc', {
      defaultMessage: 'Matches any single character',
    }),
  },
  {
    label: '^',
    text: '"${0:^}"',
    asSnippet: true,
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.rlikeStartAnchorDoc', {
      defaultMessage: 'Match to the start of the string',
    }),
  },
  {
    label: '$',
    text: '"${0:$}"',
    asSnippet: true,
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.rlikeEndAnchorDoc', {
      defaultMessage: 'Match to the end of the string',
    }),
  },
];

export const confidenceLevelValueItems: ISuggestionItem[] = [
  {
    label: i18n.translate(
      'kbn-esql-language.esql.autocomplete.set.approximate.highPrecisionLabel',
      {
        defaultMessage: 'High precision',
      }
    ),
    text: '0.99',
    kind: 'Value',
    detail: i18n.translate(
      'kbn-esql-language.esql.autocomplete.set.approximate.highPrecisionDetail',
      {
        defaultMessage: 'High precision (99%)',
      }
    ),
    category: SuggestionCategory.VALUE,
  },
  {
    label: i18n.translate(
      'kbn-esql-language.esql.autocomplete.set.approximate.standardPrecisionLabel',
      {
        defaultMessage: 'Standard',
      }
    ),
    text: '0.95',
    kind: 'Value',
    detail: i18n.translate(
      'kbn-esql-language.esql.autocomplete.set.approximate.standardPrecisionDetail',
      {
        defaultMessage: 'Standard (95%)',
      }
    ),
    category: SuggestionCategory.VALUE,
  },
  {
    label: i18n.translate(
      'kbn-esql-language.esql.autocomplete.set.approximate.exploratoryPrecisionLabel',
      {
        defaultMessage: 'Exploratory',
      }
    ),
    text: '0.9',
    kind: 'Value',
    detail: i18n.translate(
      'kbn-esql-language.esql.autocomplete.set.approximate.exploratoryPrecisionDetail',
      {
        defaultMessage: 'Exploratory (90%)',
      }
    ),
  },
];

export const numOfRowsValueItems: ISuggestionItem[] = [
  {
    label: i18n.translate('kbn-esql-language.esql.autocomplete.set.approximate.rows100KLabel', {
      defaultMessage: '100K rows',
    }),
    text: '100000',
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.set.approximate.rows100KDetail', {
      defaultMessage: 'Return up to 100,000 rows',
    }),
    category: SuggestionCategory.VALUE,
  },
  {
    label: i18n.translate('kbn-esql-language.esql.autocomplete.set.approximate.rows500KLabel', {
      defaultMessage: '500K rows',
    }),
    text: '500000',
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.set.approximate.rows500KDetail', {
      defaultMessage: 'Return up to 500,000 rows',
    }),
    category: SuggestionCategory.VALUE,
  },
  {
    label: i18n.translate('kbn-esql-language.esql.autocomplete.set.approximate.rows1MLabel', {
      defaultMessage: '1M rows',
    }),
    text: '1000000',
    kind: 'Value',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.set.approximate.rows1MDetail', {
      defaultMessage: 'Return up to 1,000,000 rows',
    }),
  },
];

export const getCommandAutocompleteDefinitions = (commands: string[]): ISuggestionItem[] => {
  const suggestions: ISuggestionItem[] = [];

  for (const command of commands) {
    const commandDefinition = esqlCommandRegistry.getCommandByName(command);
    if (commandDefinition?.metadata?.hidden || !commandDefinition) {
      continue;
    }

    const label = commandDefinition.name.toUpperCase();
    const text = `${commandDefinition.name.toUpperCase()} `;
    const types = commandDefinition.metadata?.types ?? [
      {
        name: '',
        description: '',
      },
    ];

    for (const type of types) {
      let detail = type.description || commandDefinition.metadata.description;
      if (commandDefinition.metadata.preview) {
        detail = `**[${techPreviewLabel}]** ${detail}`;
      }
      const suggestion: ISuggestionItem = withAutoSuggest({
        label: type.name ? `${type.name.toLocaleUpperCase()} ${label}` : label,
        text: type.name ? `${type.name.toLocaleUpperCase()} ${text}` : text,
        kind: 'Method',
        documentation: {
          value: buildDocumentation(
            detail,
            commandDefinition.metadata.declaration,
            commandDefinition.metadata.examples
          ),
        },
        category: SuggestionCategory.COMMAND,
      });

      suggestions.push(suggestion);
    }
  }

  return suggestions;
};

export const getDateHistogramCompletionItem: (histogramBarTarget?: number) => ISuggestionItem = (
  histogramBarTarget: number = 50
) =>
  withAutoSuggest({
    label: i18n.translate('kbn-esql-language.esql.autocomplete.addDateHistogram', {
      defaultMessage: 'Add date histogram',
    }),
    text: `BUCKET($0, ${histogramBarTarget}, ${TIME_SYSTEM_PARAMS.join(', ')})`,
    asSnippet: true,
    kind: 'Issue',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.addDateHistogramDetail', {
      defaultMessage: 'Add date histogram using bucket()',
    }),
    category: SuggestionCategory.CUSTOM_ACTION,
  });

export const getTimeseriesDateHistogramCompletionItem: (
  histogramBarTarget?: number
) => ISuggestionItem = (histogramBarTarget: number = 50) =>
  withAutoSuggest({
    label: i18n.translate('kbn-esql-language.esql.autocomplete.addTimeseriesDateHistogram', {
      defaultMessage: 'Add date histogram',
    }),
    text: `TBUCKET(${histogramBarTarget})`,
    kind: 'Issue',
    detail: i18n.translate('kbn-esql-language.esql.autocomplete.addTimeseriesDateHistogramDetail', {
      defaultMessage: 'Add date histogram using tbucket()',
    }),
    category: SuggestionCategory.CUSTOM_ACTION,
  });

export function createResourceBrowserSuggestion(options: {
  label: string;
  description: string;
  commandId: string;
  commandArgs?: Record<string, string>;
}): ISuggestionItem {
  return withAutoSuggest({
    label: options.label,
    // Empty string: insertion is handled by the command that opens the browser overlay.
    text: '',
    kind: 'Folder',
    detail: options.description,
    command: {
      title: options.label,
      id: options.commandId,
      ...(options.commandArgs && { arguments: [options.commandArgs] }),
    },
    asSnippet: false,
    category: SuggestionCategory.CUSTOM_ACTION,
  });
}

export function createIndicesBrowserSuggestion(
  commandArgs?: Record<string, string>
): ISuggestionItem {
  return createResourceBrowserSuggestion({
    label: i18n.translate('kbn-esql-language.esql.autocomplete.indicesBrowser.suggestionLabel', {
      defaultMessage: 'Browse data sources',
    }),
    description: i18n.translate(
      'kbn-esql-language.esql.autocomplete.indicesBrowser.suggestionDescription',
      {
        defaultMessage: 'Open data source browser',
      }
    ),
    commandId: 'esql.indicesBrowser.open',
    commandArgs,
  });
}

export function createFieldsBrowserSuggestion(
  commandArgs?: Record<string, string>
): ISuggestionItem {
  return createResourceBrowserSuggestion({
    label: i18n.translate('kbn-esql-language.esql.autocomplete.fieldsBrowser.suggestionLabel', {
      defaultMessage: 'Browse fields',
    }),
    description: i18n.translate(
      'kbn-esql-language.esql.autocomplete.fieldsBrowser.suggestionDescription',
      {
        defaultMessage: 'Open fields browser',
      }
    ),
    commandId: 'esql.fieldsBrowser.open',
    commandArgs,
  });
}
