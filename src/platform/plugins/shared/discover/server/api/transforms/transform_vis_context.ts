/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DiscoverSessionTabAttributes } from '@kbn/saved-search-plugin/server';
import { UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import type { DiscoverSessionApiTab } from '../schema';

type StoredVisContext = DiscoverSessionTabAttributes['visContext'];
type ApiVisContext = DiscoverSessionApiTab['vis_context'];
type ApiSuggestionType = NonNullable<ApiVisContext>['suggestion_type'];

export interface StoredVisContextRequestData {
  dataViewId?: string;
  timeField?: string;
  timeInterval?: string;
  breakdownField?: string;
}

const isApiSuggestionType = (value: unknown): value is ApiSuggestionType =>
  value === UnifiedHistogramSuggestionType.lensSuggestion ||
  value === UnifiedHistogramSuggestionType.histogramForESQL ||
  value === UnifiedHistogramSuggestionType.histogramForDataView;

export const transformVisContextOut = (visContext: StoredVisContext): ApiVisContext | undefined => {
  if (
    !visContext ||
    !('suggestionType' in visContext) ||
    !('attributes' in visContext) ||
    !visContext.suggestionType ||
    !visContext.attributes
  ) {
    return undefined;
  }

  if (!isApiSuggestionType(visContext.suggestionType)) {
    return undefined;
  }

  return {
    suggestion_type: visContext.suggestionType,
    attributes: visContext.attributes,
  };
};

export const transformVisContextIn = (
  visContext: ApiVisContext,
  requestData: StoredVisContextRequestData = {}
): StoredVisContext => {
  if (!visContext) {
    return undefined;
  }

  return {
    suggestionType: visContext.suggestion_type,
    requestData,
    attributes: visContext.attributes,
  };
};
