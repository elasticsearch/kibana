/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { SOURCES_TYPES } from '@kbn/esql-types';
import type { ESQLAstAllCommands } from '@elastic/esql/types';
import { isSubQuery, isSource } from '@elastic/esql';
import {
  newLineCompleteItem,
  newLineAndPipeCompleteItems,
  commaCompleteItem,
  buildSubqueryCompleteItems,
} from '../complete_items';
import {
  getSourcesFromCommands,
  getSourceSuggestions,
  additionalSourcesSuggestions,
  buildViewsDefinitions,
  buildDatasetsDefinitions,
} from '../../definitions/utils/sources';
import { metadataSuggestion, getMetadataSuggestions } from '../options/metadata';
import { getRecommendedQueriesSuggestions } from '../options/recommended_queries';
import { withinQuotes } from '../../definitions/utils/autocomplete/helpers';
import type { ICommandCallbacks } from '../types';
import { type ISuggestionItem, type ICommandContext } from '../types';
import { getOverlapRange, isRestartingExpression } from '../../definitions/utils/shared';
import {
  getIndicesBrowserSuggestion,
  shouldSuggestIndicesBrowserAfterComma,
} from '../../definitions/utils/autocomplete/resource_browser_suggestions';
import { endsWithWhitespace } from '../../definitions/utils/regex';

const SOURCE_TYPE_INDEX = 'index';
const METADATA_KEYWORD = 'METADATA';
const EMPTY_EXTENSIONS = { recommendedFields: [], recommendedQueries: [] };

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const innerText = query.substring(0, cursorPosition);

  if (withinQuotes(innerText) || !callbacks?.getByType) {
    return [];
  }

  return handleFromAutocomplete(query, command, callbacks, context, cursorPosition);
}

/**
 * Routes to appropriate suggestion scenario based on cursor position and indexes.
 */
async function handleFromAutocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition?: number
): Promise<ISuggestionItem[]> {
  const cursorPos = cursorPosition ?? query.length;
  const innerText = query.substring(0, cursorPos);

  // Cursor before FROM keyword
  if (command.location.min > cursorPos) {
    return getSourceSuggestions(context?.sources ?? [], []);
  }

  // Extract text relative to command start (critical for subqueries)
  // Use commandText for pattern matching (e.g., /METADATA\s+$/ and trailing whitespace)
  // checks need to operate on the current command only, not the entire query
  const commandText = query.substring(command.location.min, cursorPos);
  const subquerySuggestions =
    commandText.length > command.name.length ? buildSubqueryCompleteItems() : undefined;
  const indicesBrowserSuggestion = await getIndicesBrowserSuggestion({
    callbacks,
    context,
  });

  // METADATA suggestions - uses commandText for regex pattern matching
  const metadataSuggestions = await getMetadataSuggestions(command, commandText);
  if (metadataSuggestions) {
    return metadataSuggestions;
  }

  const indexes = getSourcesFromCommands([command], SOURCE_TYPE_INDEX);

  // Check if there are any sources (including subqueries)
  const hasAnySources = command.args.some(
    (arg) => !Array.isArray(arg) && (isSource(arg) || isSubQuery(arg))
  );

  // Case 1: FROM | (no sources yet)
  if (!hasAnySources) {
    const suggestions = suggestInitialSources(
      context,
      innerText,
      command.location.min,
      subquerySuggestions
    );
    if (indicesBrowserSuggestion) {
      suggestions.unshift(indicesBrowserSuggestion);
    }
    return suggestions;
  }

  // Case 2: FROM index | (after space, suggest next actions)
  if (endsWithWhitespace(commandText) && !isRestartingExpression(commandText)) {
    return suggestNextActions(context, callbacks);
  }

  // Case 3: FROM in|, FROM index, | (typing or adding more indexes)
  // Use innerText for absolute positions in rangeToReplace
  const shouldSuggestIndicesBrowserInAdditionalSlot =
    Boolean(indicesBrowserSuggestion) && shouldSuggestIndicesBrowserAfterComma(commandText);

  const suggestions = await suggestAdditionalSources(
    innerText,
    context,
    callbacks,
    indexes,
    subquerySuggestions,
    {
      textBeforeCursor: innerText,
      commandStart: command.location.min, // Full-query offset of this FROM command.
    }
  );
  if (shouldSuggestIndicesBrowserInAdditionalSlot && indicesBrowserSuggestion) {
    suggestions.unshift(indicesBrowserSuggestion);
  }
  return suggestions;
}

/**
 * Case 1: No indexes yet - suggest available sources, views, and subquery.
 */
function suggestInitialSources(
  context: ICommandContext | undefined,
  innerText: string,
  commandStart: number,
  subquerySuggestions?: ISuggestionItem[]
): ISuggestionItem[] {
  let sources = context?.sources ?? [];

  if (context?.isCursorInSubquery) {
    sources = sources.filter((source) => source.type !== SOURCES_TYPES.TIMESERIES);
  }

  const sourceSuggestions = getSourceSuggestions(sources, [], {
    textBeforeCursor: innerText,
    commandStart,
  });
  const viewSuggestions = buildViewsDefinitions(context?.views ?? [], []);
  const datasetSuggestions = buildDatasetsDefinitions(context?.datasets ?? [], []);
  const suggestions = [...sourceSuggestions, ...viewSuggestions, ...datasetSuggestions];

  if (subquerySuggestions && shouldSuggestSubquery(context)) {
    suggestions.push(...subquerySuggestions);
  }

  return suggestions;
}

/**
 * Case 2: After space - suggest pipe, comma, metadata, and recommended queries.
 */
async function suggestNextActions(
  context: ICommandContext | undefined,
  callbacks: ICommandCallbacks | undefined
): Promise<ISuggestionItem[]> {
  const suggestions: ISuggestionItem[] = [
    ...newLineAndPipeCompleteItems,
    commaCompleteItem,
    metadataSuggestion,
  ];

  const recommendedQueries = await getRecommendedQueriesSuggestions(
    context?.editorExtensions ?? EMPTY_EXTENSIONS,
    callbacks?.getByType
  );

  return [...suggestions, ...recommendedQueries];
}

/**
 * Case 3: Typing or adding more indexes - suggest additional sources with metadata check.
 */
async function suggestAdditionalSources(
  innerText: string,
  context: ICommandContext | undefined,
  callbacks: ICommandCallbacks | undefined,
  indexes: ReturnType<typeof getSourcesFromCommands>,
  subquerySuggestions?: ISuggestionItem[],
  sourceReplacementContext?: {
    textBeforeCursor: string;
    commandStart: number;
  }
): Promise<ISuggestionItem[]> {
  const lastIndex = indexes[indexes.length - 1];
  const isTypingIndexName = !!(lastIndex?.name && innerText.endsWith(lastIndex.name));

  // Only use overlap here to decide when to show `METADATA`.
  // The replacement range is still handled centrally.
  if (!isTypingIndexName && getOverlapRange(innerText, METADATA_KEYWORD)) {
    return [metadataSuggestion];
  }

  const canRewriteFromToTs = indexes.length === 1 && isTypingIndexName;

  let sources = context?.sources ?? [];

  if (context?.isCursorInSubquery) {
    sources = sources.filter((source) => source.type !== SOURCES_TYPES.TIMESERIES);
  }

  const recommendedQueries = await getRecommendedQueriesSuggestions(
    context?.editorExtensions ?? EMPTY_EXTENSIONS,
    callbacks?.getByType
  );

  const suggestions = await additionalSourcesSuggestions(
    innerText,
    sources,
    indexes.map(({ name }) => name),
    recommendedQueries,
    context?.views ?? [],
    context?.datasets ?? [],
    canRewriteFromToTs ? sourceReplacementContext : undefined
  );

  if (subquerySuggestions && isRestartingExpression(innerText) && shouldSuggestSubquery(context)) {
    suggestions.push(...subquerySuggestions);
  }

  if (isTypingIndexName) {
    const indexNameStart = innerText.length - lastIndex.name.length;
    suggestions.unshift({
      ...newLineCompleteItem,
      text: lastIndex.name + '\n',
      filterText: lastIndex.name,
      rangeToReplace: { start: indexNameStart, end: innerText.length },
    });
  }

  return suggestions;
}

function shouldSuggestSubquery(context: ICommandContext | undefined): boolean {
  return !context?.isCursorInSubquery;
}
