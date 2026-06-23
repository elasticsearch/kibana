/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLAstAllCommands, ESQLSingleAstItem } from '@elastic/esql/types';
import { isColumn } from '@elastic/esql';
import { withAutoSuggest } from '../../definitions/utils/autocomplete/helpers';
import { newLineCompleteItem, pipeCompleteItem, commaCompleteItem } from '../complete_items';
import type { ISuggestionItem } from '../types';
import { ReplacementRangeStrategyKind } from '../../../language/autocomplete/utils/prefix_range';
import { endsWithComma, endsWithWhitespace } from '../../definitions/utils/regex';

export type SortPosition =
  | 'expression'
  | 'order_complete'
  | 'after_order'
  | 'nulls_complete'
  | 'after_nulls';

export const getSortPos = (
  query: string,
  command: ESQLAstAllCommands
): { position: SortPosition | undefined; expressionRoot: ESQLSingleAstItem | undefined } => {
  const lastArg = command.args[command.args.length - 1];
  const afterComma = endsWithComma(query) && endsWithWhitespace(query);
  const hasExpressionArg = lastArg && !Array.isArray(lastArg) && lastArg.type !== 'order';

  // Expression context: no arg, after comma, or within an expression (not order node)
  if (!lastArg || afterComma || hasExpressionArg) {
    const expressionRoot = hasExpressionArg && !afterComma ? lastArg : undefined;

    return { position: 'expression', expressionRoot };
  }

  if (/(?:asc|desc)$/i.test(query)) {
    return { position: 'order_complete', expressionRoot: undefined };
  }

  if (/(?:asc|desc)\s+(?:N?U?L?L?S? ?(F?I?R?S?|LA?S?)?)$/i.test(query)) {
    return { position: 'after_order', expressionRoot: undefined };
  }

  if (/(?:nulls\s+first|nulls\s+last)$/i.test(query)) {
    return { position: 'nulls_complete', expressionRoot: undefined };
  }

  if (/(?:nulls\s+first|nulls\s+last)\s+$/i.test(query)) {
    return { position: 'after_nulls', expressionRoot: undefined };
  }

  return { position: undefined, expressionRoot: undefined };
};

export const sortModifierSuggestions = {
  ASC: withAutoSuggest({
    label: 'ASC',
    text: 'ASC',
    detail: '',
    kind: 'Keyword',
  }),
  DESC: withAutoSuggest({
    label: 'DESC',
    text: 'DESC',
    detail: '',
    kind: 'Keyword',
  }),
  NULLS_FIRST: withAutoSuggest({
    label: 'NULLS FIRST',
    text: 'NULLS FIRST',
    detail: '',
    kind: 'Keyword',
  }),
  NULLS_LAST: withAutoSuggest({
    label: 'NULLS LAST',
    text: 'NULLS LAST',
    detail: '',
    kind: 'Keyword',
  }),
};

export const rightAfterColumn = (
  innerText: string,
  expressionRoot: ESQLSingleAstItem | undefined,
  columnExists: (name: string) => boolean
): boolean => {
  return (
    isColumn(expressionRoot) &&
    columnExists(expressionRoot.parts.join('.')) &&
    // this prevents the branch from being entered for something like "SORT column NULLS LA/"
    // where the "NULLS LA" won't be in the AST so expressionRoot will just be the column
    /(?:sort|,)\s+\S+$/i.test(innerText)
  );
};

export const getSuggestionsAfterCompleteExpression = (
  innerText: string,
  expressionRoot: ESQLSingleAstItem | undefined,
  columnExists: (name: string) => boolean
): ISuggestionItem[] => {
  let sortCommandKeywordSuggestions = [
    { ...sortModifierSuggestions.ASC },
    { ...sortModifierSuggestions.DESC },
    { ...sortModifierSuggestions.NULLS_FIRST },
    { ...sortModifierSuggestions.NULLS_LAST },
  ];

  const pipeSuggestion = { ...pipeCompleteItem };
  const commaSuggestion = withAutoSuggest({
    ...commaCompleteItem,
    text: ', ',
  });

  // does the query end with whitespace?
  if (endsWithWhitespace(innerText)) {
    commaSuggestion.replacementRangeStrategy = {
      kind: ReplacementRangeStrategyKind.TRAILING_WHITESPACE,
    };
  }
  // special case: cursor right after a column name
  else if (isColumn(expressionRoot) && rightAfterColumn(innerText, expressionRoot, columnExists)) {
    sortCommandKeywordSuggestions = sortCommandKeywordSuggestions.map((s) => ({
      ...s,
      text: ` ${s.text}`,
      preserveTypedPrefix: true,
    }));

    pipeSuggestion.text = ` ${pipeSuggestion.text}`;
    pipeSuggestion.preserveTypedPrefix = true;

    commaSuggestion.preserveTypedPrefix = true;
  }

  return [...sortCommandKeywordSuggestions, newLineCompleteItem, pipeSuggestion, commaSuggestion];
};
