/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import { transformVisContextIn, transformVisContextOut } from './transform_vis_context';

describe('vis context transforms', () => {
  describe('transformVisContextOut', () => {
    it('maps stored visContext to API vis_context and omits requestData', () => {
      const result = transformVisContextOut({
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
      expect(transformVisContextOut({})).toBeUndefined();
      expect(transformVisContextOut(undefined)).toBeUndefined();
    });
  });

  describe('transformVisContextIn', () => {
    it('maps API vis_context to stored visContext with requestData', () => {
      const result = transformVisContextIn(
        {
          suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL,
          attributes: {
            visualizationType: 'lnsXY',
            state: { foo: 'bar' },
          },
        },
        {
          dataViewId: 'logs-dv',
          timeField: '@timestamp',
          timeInterval: 'auto',
          breakdownField: 'host.name',
        }
      );

      expect(result).toEqual({
        suggestionType: UnifiedHistogramSuggestionType.histogramForESQL,
        requestData: {
          dataViewId: 'logs-dv',
          timeField: '@timestamp',
          timeInterval: 'auto',
          breakdownField: 'host.name',
        },
        attributes: {
          visualizationType: 'lnsXY',
          state: { foo: 'bar' },
        },
      });
    });

    it('returns undefined when API vis_context is missing', () => {
      expect(transformVisContextIn(undefined)).toBeUndefined();
    });
  });
});
