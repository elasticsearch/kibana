/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ICommandContext, ISuggestionItem } from '../../../../../registry/types';
import {
  newLineCompleteItem,
  pipeCompleteItem,
  promqlByCompleteItem,
} from '../../../../../registry/complete_items';
import type { PromQLFunctionParamType } from '../../../../types';
import { getPromqlFunctionParamTypes } from '../../../promql';
import { suggestOperators } from './operators';

export interface SuggestGroupingInput {
  columns: ICommandContext['columns'] | undefined;
  shouldWrap: boolean;
  preGroupedAgg?: string;
  isAfterAggregationName: boolean;
  canAddGrouping: boolean;
  includePipe: boolean;
  buildVectorSuggestions: (
    columns: ICommandContext['columns'] | undefined,
    signatureTypes: PromQLFunctionParamType[],
    wrap: boolean
  ) => ISuggestionItem[];
}

/** Suggests tokens to continue a query around grouping/pipe/operator boundaries. */
export function suggestGrouping(input: SuggestGroupingInput): ISuggestionItem[] {
  const {
    columns,
    shouldWrap,
    preGroupedAgg,
    isAfterAggregationName,
    canAddGrouping,
    includePipe,
    buildVectorSuggestions,
  } = input;

  if (isAfterAggregationName) {
    return [promqlByCompleteItem, ...buildVectorSuggestions(columns, [], true)];
  }

  if (preGroupedAgg) {
    return buildVectorSuggestions(
      columns,
      getPromqlFunctionParamTypes(preGroupedAgg, 0),
      shouldWrap
    );
  }

  const suggestions: ISuggestionItem[] = [
    ...suggestOperators(),
    ...(includePipe ? [newLineCompleteItem, pipeCompleteItem] : []),
  ];

  if (canAddGrouping) {
    suggestions.push(promqlByCompleteItem);
  }

  return suggestions;
}
