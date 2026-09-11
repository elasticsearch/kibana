/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';

import type { EventAnnotationConfig } from '@kbn/event-annotation-common';
import {
  generateEsqlQuery,
  esqlConversionFailureReasonMessages,
  type FramePublicAPI,
  type TypedLensSerializedState,
  type Visualization,
} from '@kbn/lens-common';
import type { CoreStart } from '@kbn/core/public';

import { hasQueryBasedAnnotations, useEsqlConversionCheck } from './use_esql_conversion_check';
import { convertFormBasedToTextBasedLayer } from './convert_to_text_based_layer';
import type { LensPluginStartDependencies } from '../../../plugin';

jest.mock('@kbn/lens-common', () => ({
  ...jest.requireActual('@kbn/lens-common'),
  generateEsqlQuery: jest.fn(),
}));

jest.mock('./convert_to_text_based_layer', () => ({
  convertFormBasedToTextBasedLayer: jest.fn(() => ({ converted: true })),
}));

let mockStoreState: { lens: Record<string, unknown> };

jest.mock('../../../state_management', () => ({
  useLensSelector: jest.fn((selector: (state: unknown) => unknown) => selector(mockStoreState)),
  selectPersistedDoc: (state: { lens: { persistedDoc?: unknown } }) => state.lens.persistedDoc,
}));

const manualAnnotation: EventAnnotationConfig = {
  id: 'manual',
  type: 'manual',
  key: { type: 'point_in_time', timestamp: '2024-01-01T00:00:00.000Z' },
  label: 'Manual',
};

const queryAnnotation: EventAnnotationConfig = {
  id: 'query',
  type: 'query',
  filter: { type: 'kibana_query', query: 'foo: bar', language: 'kuery' },
  key: { type: 'point_in_time' },
  timeField: '@timestamp',
  label: 'Query',
};

describe('hasQueryBasedAnnotations', () => {
  it('returns false for a state without layers', () => {
    expect(hasQueryBasedAnnotations(undefined)).toBe(false);
    expect(hasQueryBasedAnnotations({})).toBe(false);
    expect(hasQueryBasedAnnotations({ layers: 'not-an-array' })).toBe(false);
  });

  it('returns false for data and reference line layers', () => {
    expect(
      hasQueryBasedAnnotations({
        layers: [
          { layerId: 'a', layerType: 'data' },
          { layerId: 'b', layerType: 'referenceLine' },
        ],
      })
    ).toBe(false);
  });

  it('returns false for annotation layers with only manual annotations', () => {
    expect(
      hasQueryBasedAnnotations({
        layers: [{ layerId: 'a', layerType: 'annotations', annotations: [manualAnnotation] }],
      })
    ).toBe(false);
  });

  it('returns true when any annotation layer contains a query-based annotation', () => {
    expect(
      hasQueryBasedAnnotations({
        layers: [
          { layerId: 'a', layerType: 'data' },
          {
            layerId: 'b',
            layerType: 'annotations',
            annotations: [manualAnnotation, queryAnnotation],
          },
        ],
      })
    ).toBe(true);
  });
});

describe('useEsqlConversionCheck', () => {
  const generateEsqlQueryMock = generateEsqlQuery as jest.Mock;

  const esqlSuccess = {
    success: true,
    esql: 'FROM index | STATS count = COUNT(*)',
    esAggsIdMap: {},
    partialRows: false,
  };
  const esqlFormulaFailure = { success: false, reason: 'formula_not_supported' };

  const makeFormBasedLayer = () => ({
    indexPatternId: 'dv1',
    columnOrder: ['col1'],
    columns: { col1: { operationType: 'count', label: 'Count', dataType: 'number' } },
  });

  const framePublicAPI = {
    dataViews: {
      indexPatterns: { dv1: { id: 'dv1', title: 'index', name: 'index' } },
    },
    dateRange: { fromDate: '2024-01-01', toDate: '2024-01-02' },
  } as unknown as FramePublicAPI;

  const hookParams = {
    attributes: { state: {} } as TypedLensSerializedState['attributes'],
    datasourceId: 'formBased' as const,
    layerIds: ['layer1', 'layer2'],
    visualization: { state: { layers: [] }, activeId: 'lnsXY', selectedLayerId: null },
    activeVisualization: { getLayerType: () => 'data' } as unknown as Visualization,
  };

  const hookServices = {
    framePublicAPI,
    coreStart: { uiSettings: {} } as CoreStart,
    startDependencies: {
      data: { nowProvider: { get: () => new Date('2024-01-02') } },
    } as unknown as LensPluginStartDependencies,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState = {
      lens: {
        datasourceStates: {
          formBased: {
            state: { layers: { layer1: makeFormBasedLayer(), layer2: makeFormBasedLayer() } },
          },
        },
        persistedDoc: undefined,
      },
    };
  });

  it('disables conversion when any data layer is non-convertible to avoid mixed data-layer state', () => {
    // layer1 converts, layer2 fails (e.g. formula)
    generateEsqlQueryMock.mockReturnValueOnce(esqlSuccess).mockReturnValueOnce(esqlFormulaFailure);

    const { result } = renderHook(() => useEsqlConversionCheck(true, hookParams, hookServices));

    expect(result.current.isConvertToEsqlButtonDisabled).toBe(true);
    expect(result.current.convertToEsqlButtonTooltip).toBe(
      esqlConversionFailureReasonMessages.formula_not_supported
    );
    expect(convertFormBasedToTextBasedLayer).not.toHaveBeenCalled();
  });

  it('enables conversion when all data layers are convertible', () => {
    generateEsqlQueryMock.mockReturnValue(esqlSuccess);

    const { result } = renderHook(() => useEsqlConversionCheck(true, hookParams, hookServices));

    expect(result.current.isConvertToEsqlButtonDisabled).toBe(false);
    expect(convertFormBasedToTextBasedLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        layersToConvert: [
          expect.objectContaining({ id: 'layer1', isConvertibleToEsql: true }),
          expect.objectContaining({ id: 'layer2', isConvertibleToEsql: true }),
        ],
      })
    );
  });
});
