/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  LENS_DATASOURCE_ID,
  LENS_DATATABLE_ID,
  SeriesTypes,
  type FormBasedPrivateState,
  type LensDocument,
} from '@kbn/lens-common';
import { applyVizTypeDatasourceDefaults } from './viz_type_defaults';

interface ColumnSpec {
  operationType: string;
  params?: { includeEmptyRows?: boolean };
}

function makeState(layers: Record<string, Record<string, ColumnSpec>>): FormBasedPrivateState {
  return {
    currentIndexPatternId: 'ip',
    layers: Object.fromEntries(
      Object.entries(layers).map(([layerId, columns]) => [
        layerId,
        {
          indexPatternId: 'ip',
          columnOrder: Object.keys(columns),
          columns: Object.fromEntries(
            Object.entries(columns).map(([columnId, column]) => [
              columnId,
              {
                dataType: 'date',
                isBucketed: true,
                label: columnId,
                sourceField: '@timestamp',
                operationType: column.operationType,
                params: column.params,
              } as unknown as Record<string, unknown>,
            ])
          ),
        },
      ])
    ),
  } as unknown as FormBasedPrivateState;
}

const getIncludeEmptyRows = (state: FormBasedPrivateState, layerId: string, columnId: string) =>
  (state.layers[layerId].columns[columnId] as { params?: { includeEmptyRows?: boolean } }).params
    ?.includeEmptyRows;

describe('applyVizTypeDatasourceDefaults', () => {
  it('returns the datasource state untouched for non form-based datasources', () => {
    const datasourceState = makeState({ first: { col1: { operationType: 'date_histogram' } } });

    const result = applyVizTypeDatasourceDefaults({
      kind: 'typeSwitch',
      datasourceId: 'textBased',
      datasourceState,
      targetVisualizationTypeId: SeriesTypes.BAR,
      persistedDoc: undefined,
    });

    expect(result).toBe(datasourceState);
  });

  it('returns the datasource state untouched when no datasource id is provided', () => {
    const datasourceState = makeState({ first: { col1: { operationType: 'date_histogram' } } });

    const result = applyVizTypeDatasourceDefaults({
      kind: 'suggestion',
      datasourceId: undefined,
      datasourceState,
      previousDatasourceState: undefined,
      targetVisualizationTypeId: SeriesTypes.BAR,
    });

    expect(result).toBe(datasourceState);
  });

  describe("kind: 'suggestion'", () => {
    it('applies the target default only to columns new in the suggestion', () => {
      const previousDatasourceState = makeState({
        first: {
          existing: { operationType: 'date_histogram', params: { includeEmptyRows: true } },
        },
      });
      const datasourceState = makeState({
        first: {
          existing: { operationType: 'date_histogram', params: { includeEmptyRows: true } },
          added: { operationType: 'date_histogram' },
        },
      });

      const result = applyVizTypeDatasourceDefaults({
        kind: 'suggestion',
        datasourceId: LENS_DATASOURCE_ID.FORM_BASED,
        datasourceState,
        previousDatasourceState,
        targetVisualizationTypeId: SeriesTypes.BAR,
      });

      expect(getIncludeEmptyRows(result, 'first', 'existing')).toBe(true);
      expect(getIncludeEmptyRows(result, 'first', 'added')).toBe(false);
    });

    it('leaves the suggestion untouched for an on-by-default target type', () => {
      const datasourceState = makeState({
        first: { col1: { operationType: 'date_histogram' } },
      });

      const result = applyVizTypeDatasourceDefaults({
        kind: 'suggestion',
        datasourceId: LENS_DATASOURCE_ID.FORM_BASED,
        datasourceState,
        previousDatasourceState: makeState({ first: {} }),
        targetVisualizationTypeId: LENS_DATATABLE_ID,
      });

      expect(result).toBe(datasourceState);
    });
  });

  describe("kind: 'typeSwitch'", () => {
    it('applies the target default to every existing bucket column', () => {
      const datasourceState = makeState({
        first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
      });

      const result = applyVizTypeDatasourceDefaults({
        kind: 'typeSwitch',
        datasourceId: LENS_DATASOURCE_ID.FORM_BASED,
        datasourceState,
        targetVisualizationTypeId: SeriesTypes.BAR,
        persistedDoc: undefined,
      });

      expect(getIncludeEmptyRows(result, 'first', 'col1')).toBe(false);
    });

    it('restores the saved value when a layer is switched back to its persisted type', () => {
      const datasourceState = makeState({
        first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: false } } },
      });
      const persistedDoc = {
        visualizationType: LENS_DATATABLE_ID,
        state: {
          visualization: {},
          datasourceStates: {
            [LENS_DATASOURCE_ID.FORM_BASED]: {
              layers: {
                first: {
                  columns: {
                    col1: { operationType: 'date_histogram', params: { includeEmptyRows: true } },
                  },
                },
              },
            },
          },
        },
      } as unknown as LensDocument;

      const result = applyVizTypeDatasourceDefaults({
        kind: 'typeSwitch',
        datasourceId: LENS_DATASOURCE_ID.FORM_BASED,
        datasourceState,
        targetVisualizationTypeId: LENS_DATATABLE_ID,
        persistedDoc,
        getPersistedVisualizationTypeId: () => LENS_DATATABLE_ID,
      });

      expect(getIncludeEmptyRows(result, 'first', 'col1')).toBe(true);
    });
  });
});
