/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { UnifiedHistogramSuggestionType } from '@kbn/discover-session-constants';
import type { DiscoverSessionApiTab } from '@kbn/as-code-discover-schema';
import { fromApiVisContext, toApiVisContext } from './vis_context';

describe('vis context', () => {
  describe('toApiVisContext', () => {
    it('maps stored visContext to API vis_context and omits requestData', () => {
      const result = toApiVisContext({
        suggestionType: UnifiedHistogramSuggestionType.histogramForDataView,
        requestData: {
          dataViewId: 'logs-dv',
          timeInterval: '1h',
        },
        attributes: {
          visualizationType: 'lnsXY',
          state: { foo: 'bar' },
        },
      });

      expect(result).toEqual({
        suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
        attributes: {
          visualizationType: 'lnsXY',
          state: { foo: 'bar' },
        },
      });
    });

    it('returns undefined for cleared stored vis context', () => {
      expect(toApiVisContext({})).toBeUndefined();
      expect(toApiVisContext(undefined)).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    const requestData = {
      dataViewId: 'logs-dv',
      timeField: '@timestamp',
      timeInterval: 'auto',
      breakdownField: 'host.name',
    };
    const apiVisContext: NonNullable<DiscoverSessionApiTab['vis_context']> = {
      suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL,
      attributes: {
        visualizationType: 'lnsXY',
        state: { foo: 'bar' },
      },
    };

    it('round-trips API vis_context when requestData is supplied', () => {
      const stored = fromApiVisContext(apiVisContext, requestData);

      expect(toApiVisContext(stored)).toEqual(apiVisContext);
      expect(stored).toEqual({
        suggestionType: UnifiedHistogramSuggestionType.histogramForESQL,
        requestData,
        attributes: apiVisContext.attributes,
      });
    });
  });

  describe('fromApiVisContext', () => {
    it('uses an empty fingerprint when requestData is not supplied', () => {
      const result = fromApiVisContext({
        suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL,
        attributes: {
          visualizationType: 'lnsXY',
          state: { foo: 'bar' },
        },
      });

      expect(result).toStrictEqual({
        suggestionType: UnifiedHistogramSuggestionType.histogramForESQL,
        requestData: {},
        attributes: {
          visualizationType: 'lnsXY',
          state: { foo: 'bar' },
        },
      });
    });

    it('returns undefined when API vis_context is missing', () => {
      expect(fromApiVisContext(undefined)).toBeUndefined();
    });
  });
});
