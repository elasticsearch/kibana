/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  LENS_DATASOURCE_ID,
  LENS_DATATABLE_ID,
  LENS_GAUGE_ID,
  LENS_HEATMAP_CHART_SHAPES,
  LENS_METRIC_ID,
  LENS_TAGCLOUD_ID,
  PARTITION_CHART_TYPES,
  SeriesTypes,
  type FormBasedPrivateState,
  type LensDocument,
} from '@kbn/lens-common';
import {
  applyEmptyRowsDefaultsOnTypeSwitch,
  applyEmptyRowsDefaultsToSuggestionState,
  getDefaultIncludeEmptyRows,
} from './include_empty_rows_defaults';

describe('getDefaultIncludeEmptyRows', () => {
  describe.each([
    [SeriesTypes.BAR, false],
    [LENS_HEATMAP_CHART_SHAPES.HEATMAP, false],
    [PARTITION_CHART_TYPES.PIE, false],
    [PARTITION_CHART_TYPES.TREEMAP, false],
    [PARTITION_CHART_TYPES.MOSAIC, false],
    [PARTITION_CHART_TYPES.WAFFLE, false],
    [LENS_METRIC_ID, false],
    [LENS_TAGCLOUD_ID, false],
  ])('OFF-by-default visualization type %s', (visualizationTypeId, expected) => {
    it(`returns ${expected}`, () => {
      expect(getDefaultIncludeEmptyRows(visualizationTypeId)).toBe(expected);
    });
  });

  describe.each([
    [LENS_DATATABLE_ID, true],
    // Line and area XY subtypes remain ON until #256104 changes them.
    [SeriesTypes.LINE, true],
    [SeriesTypes.AREA, true],
    // Mixed XY layers (multi-layer different seriesType) stay ON by default.
    ['mixed', true],
    // Visualizations not covered by the issue keep the historical default.
    [LENS_GAUGE_ID, true],
    ['lnsLegacyMetric', true],
  ])('ON-by-default visualization type %s', (visualizationTypeId, expected) => {
    it(`returns ${expected}`, () => {
      expect(getDefaultIncludeEmptyRows(visualizationTypeId)).toBe(expected);
    });
  });

  it('returns true when no visualization type id is provided', () => {
    expect(getDefaultIncludeEmptyRows(undefined)).toBe(true);
    expect(getDefaultIncludeEmptyRows('')).toBe(true);
  });

  it('returns true for an unknown visualization type id', () => {
    expect(getDefaultIncludeEmptyRows('some-future-vis-id')).toBe(true);
  });
});

describe('applyEmptyRowsDefaultsToSuggestionState', () => {
  function makeState(
    layers: Record<
      string,
      Record<
        string,
        {
          operationType: string;
          params?: { includeEmptyRows?: boolean };
        }
      >
    >
  ): FormBasedPrivateState {
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

  it('does nothing when the target visualization defaults to includeEmptyRows on', () => {
    const suggestion = makeState({
      first: { col1: { operationType: 'date_histogram' } },
    });

    expect(applyEmptyRowsDefaultsToSuggestionState(suggestion, undefined, LENS_DATATABLE_ID)).toBe(
      suggestion
    );
  });

  it('flips a newly created date_histogram column to includeEmptyRows false for bar charts', () => {
    const suggestion = makeState({
      first: { col1: { operationType: 'date_histogram' } },
    });
    const previous = makeState({ first: {} });

    const next = applyEmptyRowsDefaultsToSuggestionState(suggestion, previous, SeriesTypes.BAR);

    expect(next).not.toBe(suggestion);
    expect(
      (next.layers.first.columns.col1 as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(false);
  });

  it('preserves columns that already existed in the previous datasource state', () => {
    const suggestion = makeState({
      first: {
        existing: { operationType: 'date_histogram', params: { includeEmptyRows: true } },
        added: { operationType: 'date_histogram' },
      },
    });
    const previous = makeState({
      first: {
        existing: { operationType: 'date_histogram', params: { includeEmptyRows: true } },
      },
    });

    const next = applyEmptyRowsDefaultsToSuggestionState(
      suggestion,
      previous,
      PARTITION_CHART_TYPES.PIE
    );

    expect(
      (next.layers.first.columns.existing as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(true);
    expect(
      (next.layers.first.columns.added as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(false);
  });

  it('leaves non-bucket columns untouched', () => {
    const suggestion = makeState({
      first: { col1: { operationType: 'terms' } },
    });

    expect(applyEmptyRowsDefaultsToSuggestionState(suggestion, undefined, SeriesTypes.BAR)).toBe(
      suggestion
    );
  });
});

describe('applyEmptyRowsDefaultsOnTypeSwitch', () => {
  function makeState(
    layers: Record<
      string,
      Record<
        string,
        {
          operationType: string;
          params?: { includeEmptyRows?: boolean };
        }
      >
    >
  ): FormBasedPrivateState {
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

  function makePersistedDoc(
    layers: Record<
      string,
      Record<string, { operationType: string; params?: { includeEmptyRows?: boolean } }>
    >
  ): LensDocument {
    return {
      state: {
        datasourceStates: {
          [LENS_DATASOURCE_ID.FORM_BASED]: {
            layers: Object.fromEntries(
              Object.entries(layers).map(([layerId, columns]) => [
                layerId,
                {
                  columnOrder: Object.keys(columns),
                  columns,
                },
              ])
            ),
          },
        },
      },
    } as unknown as LensDocument;
  }

  // Resolves a persisted visualization type id per layer (subtype aware).
  const persistedTypeMap = (map: Record<string, string | undefined>) => (layerId: string) =>
    map[layerId];

  it('applies the target default on a never-saved chart, overriding the live value', () => {
    // No saved object: the target type's default always wins, even over a value
    // the user toggled this session.
    const suggestion = makeState({
      first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: false } } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(suggestion, undefined, LENS_DATATABLE_ID);

    expect(
      (next.layers.first.columns.col1 as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(true);
  });

  it('applies the OFF target default when a never-saved chart switches to an OFF type', () => {
    const suggestion = makeState({
      first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(suggestion, undefined, SeriesTypes.BAR);

    expect(
      (next.layers.first.columns.col1 as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(false);
  });

  it('applies the target default when switching a saved layer to a different type', () => {
    // Saved as datatable (ON); switching to bar applies bar's OFF default even
    // though a saved value exists, because bar !== the saved type.
    const suggestion = makeState({
      first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
    });
    const persistedDoc = makePersistedDoc({
      first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(
      suggestion,
      persistedDoc,
      SeriesTypes.BAR,
      persistedTypeMap({ first: LENS_DATATABLE_ID })
    );

    expect(
      (next.layers.first.columns.col1 as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(false);
  });

  it('restores the saved value when switching a layer back to its saved type', () => {
    // Saved as datatable with empty rows explicitly OFF (against the datatable
    // default). After leaving and returning to datatable, the saved OFF must be
    // restored rather than reset to the datatable ON default.
    const suggestion = makeState({
      first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
    });
    const persistedDoc = makePersistedDoc({
      first: { col1: { operationType: 'date_histogram', params: { includeEmptyRows: false } } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(
      suggestion,
      persistedDoc,
      LENS_DATATABLE_ID,
      persistedTypeMap({ first: LENS_DATATABLE_ID })
    );

    expect(
      (next.layers.first.columns.col1 as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(false);
  });

  it('applies the target default to a new column even when switching back to the saved type', () => {
    // A column with no persisted baseline gets the target default; only persisted
    // columns are restored on a round trip.
    const suggestion = makeState({
      first: { added: { operationType: 'date_histogram', params: { includeEmptyRows: false } } },
    });
    const persistedDoc = makePersistedDoc({
      first: { saved: { operationType: 'date_histogram', params: { includeEmptyRows: false } } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(
      suggestion,
      persistedDoc,
      LENS_DATATABLE_ID,
      persistedTypeMap({ first: LENS_DATATABLE_ID })
    );

    expect(
      (next.layers.first.columns.added as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(true);
  });

  it('applies the same rules to range (histogram) columns', () => {
    const suggestion = makeState({
      first: { col1: { operationType: 'range', params: { includeEmptyRows: true } } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(
      suggestion,
      undefined,
      PARTITION_CHART_TYPES.PIE
    );

    expect(
      (next.layers.first.columns.col1 as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(false);
  });

  it('leaves non-bucket columns untouched', () => {
    const suggestion = makeState({
      first: { metric: { operationType: 'count' } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(suggestion, undefined, SeriesTypes.BAR);

    expect(next).toBe(suggestion);
  });

  it('reconciles layers independently by their saved type', () => {
    // `restored` is switching back to its saved datatable type -> saved OFF kept.
    // `switched` was saved as datatable too but its layer is now a bar -> OFF default.
    const suggestion = makeState({
      restored: { col: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
      switched: { col: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
    });
    const persistedDoc = makePersistedDoc({
      restored: { col: { operationType: 'date_histogram', params: { includeEmptyRows: false } } },
      switched: { col: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
    });

    const next = applyEmptyRowsDefaultsOnTypeSwitch(
      suggestion,
      persistedDoc,
      LENS_DATATABLE_ID,
      persistedTypeMap({ restored: LENS_DATATABLE_ID, switched: SeriesTypes.BAR })
    );

    expect(
      (next.layers.restored.columns.col as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(false);
    expect(
      (next.layers.switched.columns.col as { params?: { includeEmptyRows?: boolean } }).params
        ?.includeEmptyRows
    ).toBe(true);
  });

  describe('targetLayerId scoping (subtype switch)', () => {
    it('reconciles only the target layer and leaves sibling layers untouched', () => {
      // Multi-data-layer XY: only layerB switches series type to bar. layerA must
      // keep its line (ON) date histogram instead of being flipped to bar's OFF.
      const suggestion = makeState({
        layerA: { col: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
        layerB: { col: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
      });

      const next = applyEmptyRowsDefaultsOnTypeSwitch(
        suggestion,
        undefined,
        SeriesTypes.BAR,
        undefined,
        'layerB'
      );

      expect(
        (next.layers.layerA.columns.col as { params?: { includeEmptyRows?: boolean } }).params
          ?.includeEmptyRows
      ).toBe(true);
      expect(
        (next.layers.layerB.columns.col as { params?: { includeEmptyRows?: boolean } }).params
          ?.includeEmptyRows
      ).toBe(false);
    });

    it('returns the same state reference when the target layer needs no change', () => {
      const suggestion = makeState({
        layerA: { col: { operationType: 'date_histogram', params: { includeEmptyRows: true } } },
        layerB: { col: { operationType: 'date_histogram', params: { includeEmptyRows: false } } },
      });

      const next = applyEmptyRowsDefaultsOnTypeSwitch(
        suggestion,
        undefined,
        SeriesTypes.BAR,
        undefined,
        'layerB'
      );

      expect(next).toBe(suggestion);
    });
  });
});
