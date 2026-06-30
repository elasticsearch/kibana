/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiLink, EuiSpacer } from '@elastic/eui';
import type { Ast } from '@kbn/interpreter';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ThemeServiceStart } from '@kbn/core/public';
import type { PaletteRegistry } from '@kbn/coloring';
import {
  CUSTOM_PALETTE,
  DEFAULT_COLOR_MAPPING_CONFIG,
  getFallbackDataBounds,
  getOverridePaletteStops,
  hasPaletteStops,
} from '@kbn/coloring';
import { VIS_EVENT_TO_TRIGGER } from '@kbn/visualizations-plugin/public';
import type { AccessorConfig } from '@kbn/visualization-ui-components';
import { IconChartDatatable } from '@kbn/chart-icons';
import { getOriginalId } from '@kbn/transpose-utils';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import {
  type Datatable,
  buildExpression,
  buildExpressionFunction,
} from '@kbn/expressions-plugin/common';
import { getSortingCriteria } from '@kbn/sort-predicates';
import { getKbnPalettes, useKbnPalettes } from '@kbn/palettes';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import type {
  DatasourceLayers,
  FormBasedPersistedState,
  Suggestion,
  SuggestionRequest,
  VisualizationSuggestion,
  DatatableVisualizationState,
  Visualization,
  UserMessage,
} from '@kbn/lens-common';
import {
  DEFAULT_HEADER_ROW_HEIGHT,
  DEFAULT_ROW_HEIGHT_LINES,
  DEFAULT_HEADER_ROW_HEIGHT_LINES,
  LENS_ROW_HEIGHT_MODE,
  LENS_DATAGRID_DENSITY,
} from '@kbn/lens-common';
import { getDatatableColumn } from '../../../common/expressions/impl/datatable/utils';
import type { FormatFactory } from '../../../common/types';
import { getDefaultSummaryLabel } from '../../../common/expressions/impl/datatable/summary';
import {
  type ColumnState,
  type CollapseExpressionFunction,
  type DatatableColumnFn,
  type DatatableExpressionFunction,
} from '../../../common/expressions';
import { getPaletteDisplayColors, getAccessorType } from '../../shared_components';
import { getColorMappingTelemetryEvents } from '../../lens_ui_telemetry/color_telemetry_helpers';
import { DatatableInspectorTables } from '../../../common/expressions/defs/datatable/datatable';
import { convertToRuntimeState } from './runtime_state';
import { FlyoutToolbar } from '../../shared_components/flyout_toolbar';
import {
  DatatableAppearanceSettings,
  getSimpleColumnType,
  TableDimensionDataExtraEditor,
  TableDimensionEditor,
  TableDimensionEditorAdditionalSection,
} from './components';
import { DATATABLE_COLOR_MISMATCH } from '../../user_messages_ids';
import {
  hasIncompatibleColorConfig,
  getDataBoundsForAccessor,
  getColorDefaults,
  getColorByValuePalette,
  isPaletteFillMode,
  DEFAULT_PROGRESS_BAR_COLOR,
} from './utils';

const visualizationLabel = i18n.translate('xpack.lens.datatable.label', {
  defaultMessage: 'Table',
});

/**
 * When a categorical column carries a value-based palette (with stops) but no colorMapping,
 * strip the palette and fall back to the default categorical color mapping.
 * When it already has a colorMapping, keep it and just drop the value-based palette.
 */
function reconcileCategoricalColumn(column: ColumnState): ColumnState {
  const { palette, colorMapping, colorMode, fillStyle } = column;

  // Progress bars are numeric-only; if the column became categorical, drop the
  // progress decoration and fall back to a categorical color mapping.
  if (colorMode === 'progress' || fillStyle != null) {
    return {
      ...column,
      colorMode: 'cell',
      fillStyle: undefined,
      palette: undefined,
      colorMapping: colorMapping ?? DEFAULT_COLOR_MAPPING_CONFIG,
    };
  }

  const hasValueBasedPalette = hasPaletteStops(palette);
  const needsTransition = hasValueBasedPalette || (palette != null && colorMapping != null);
  if (!needsTransition) return column;

  return {
    ...column,
    palette: undefined,
    colorMapping: colorMapping ?? DEFAULT_COLOR_MAPPING_CONFIG,
  };
}

/**
 * When a numeric column carries a colorMapping, strip it and ensure a valid value-based palette.
 * Also fixes palettes incompatible with numeric coloring:
 *  - categorical-only palettes (canDynamicColoring=false) are replaced with the default
 *  - legacy palettes without stops get stops computed from the data bounds
 */
function reconcileNumericColumn(
  column: ColumnState,
  currentData: Datatable | undefined,
  stateColumns: ColumnState[],
  paletteMap: Map<string, { canDynamicColoring?: boolean }>,
  paletteSvc: PaletteRegistry
): ColumnState {
  const { palette, colorMapping } = column;

  if (colorMapping) {
    const dataBounds =
      getDataBoundsForAccessor(column.columnId, currentData, stateColumns) ??
      getFallbackDataBounds();
    return {
      ...column,
      colorMapping: undefined,
      palette: palette ?? getColorByValuePalette(paletteSvc, dataBounds),
    };
  }

  if (!palette) return column;

  const paletteEntry = paletteMap.get(palette.name);
  if (!paletteEntry) return column;

  const hasStops = hasPaletteStops(palette);
  const needsStopsComputed = !paletteEntry.canDynamicColoring || !hasStops;
  if (!needsStopsComputed) return column;

  const dataBounds =
    getDataBoundsForAccessor(column.columnId, currentData, stateColumns) ?? getFallbackDataBounds();
  const basePalette = paletteEntry.canDynamicColoring ? palette : undefined;
  return {
    ...column,
    palette: getColorByValuePalette(paletteSvc, dataBounds, basePalette),
  };
}

export const getDatatableVisualization = ({
  paletteService,
  kibanaTheme,
  formatFactory,
}: {
  paletteService: PaletteRegistry;
  kibanaTheme: ThemeServiceStart;
  formatFactory: FormatFactory;
}): Visualization<DatatableVisualizationState> => ({
  id: 'lnsDatatable',

  visualizationTypes: [
    {
      id: 'lnsDatatable',
      icon: IconChartDatatable,
      label: visualizationLabel,
      sortPriority: 5,
      description: i18n.translate('xpack.lens.datatable.visualizationDescription', {
        defaultMessage: 'Organize data in structured rows and columns.',
      }),
    },
  ],

  getVisualizationTypeId() {
    return this.id;
  },

  getLayerIds(state) {
    return [state.layerId];
  },

  clearLayer(state) {
    return {
      ...state,
      columns: [],
    };
  },

  getDescription() {
    return {
      icon: IconChartDatatable,
      label: visualizationLabel,
    };
  },

  switchVisualizationType: (_, state) => state,

  triggers: [VIS_EVENT_TO_TRIGGER.filter, VIS_EVENT_TO_TRIGGER.tableRowContextMenuClick],

  initialize(addNewLayer, state, mainPalette, datasourceStates) {
    if (state) return convertToRuntimeState(state, datasourceStates);

    return {
      columns: [],
      layerId: addNewLayer(),
      layerType: LayerTypes.DATA,
      showRowNumbers: true,
    };
  },

  convertToRuntimeState(state, datasourceStates) {
    return convertToRuntimeState(state, datasourceStates);
  },

  onDatasourceUpdate(state, frame) {
    const datasource = frame?.datasourceLayers?.[state.layerId];
    const currentData =
      frame?.activeData?.[state.layerId] ?? frame?.activeData?.[DatatableInspectorTables.Default];
    const paletteMap = new Map(
      paletteService
        .getAll()
        .filter((p) => !p.internal)
        .map((p) => [p.id, p])
    );

    // Normalize column color configuration when the underlying column type changes
    const columns = state.columns.map((column) => {
      const { columnId, palette, colorMapping, fillStyle } = column;
      const hasColorConfig = palette != null || colorMapping != null || fillStyle != null;
      if (!hasColorConfig) return column;

      const { isNumeric, isCategory: isCategorical } = getAccessorType(datasource, columnId);
      const isColorable = isNumeric || isCategorical;
      if (!isColorable) return column;

      if (isCategorical) {
        return reconcileCategoricalColumn(column);
      }
      return reconcileNumericColumn(column, currentData, state.columns, paletteMap, paletteService);
    });

    return { ...state, columns };
  },

  getSuggestions({
    table,
    state,
    keptLayerIds,
  }: SuggestionRequest<DatatableVisualizationState>): Array<
    VisualizationSuggestion<DatatableVisualizationState>
  > {
    if (
      keptLayerIds.length > 1 ||
      (keptLayerIds.length && table.layerId !== keptLayerIds[0]) ||
      (state && table.changeType === 'unchanged') ||
      table.columns.some((col) => col.operation.isStaticValue)
    ) {
      return [];
    }
    const oldColumnSettings: Record<string, ColumnState> = {};
    if (state) {
      state.columns.forEach((column) => {
        oldColumnSettings[column.columnId] = column;
      });
    }
    const lastTransposedColumnIndex = table.columns.findIndex((c) =>
      !oldColumnSettings[c.columnId] ? false : !oldColumnSettings[c.columnId]?.isTransposed
    );
    const usesTransposing = state?.columns.some((c) => c.isTransposed);

    const title =
      table.changeType === 'unchanged'
        ? i18n.translate('xpack.lens.datatable.suggestionLabel', {
            defaultMessage: 'As table',
          })
        : i18n.translate('xpack.lens.datatable.visualizationOf', {
            defaultMessage: 'Table {operations}',
            values: {
              operations:
                table.label ||
                table.columns
                  .map((col) => col.operation.label)
                  .join(
                    i18n.translate('xpack.lens.datatable.conjunctionSign', {
                      defaultMessage: ' & ',
                      description:
                        'A character that can be used for conjunction of multiple enumarated items. Make sure to include spaces around it if needed.',
                    })
                  ),
            },
          });

    const changeType = table.changeType;
    const changeFactor =
      changeType === 'reduced' || changeType === 'layers'
        ? 0.3
        : changeType === 'unchanged'
        ? 0.5
        : 1;

    // forcing datatable as a suggestion when there are no metrics (number fields)
    const forceSuggestion = Boolean(table?.notAssignedMetrics);

    return [
      {
        title,
        // table with >= 10 columns will have a score of 0.4, fewer columns reduce score
        score: forceSuggestion ? 1 : (Math.min(table.columns.length, 10) / 10) * 0.4 * changeFactor,
        state: {
          ...(state || {
            showRowNumbers: true,
          }),
          layerId: table.layerId,
          layerType: LayerTypes.DATA,
          columns: table.columns.map((col, columnIndex) => ({
            ...(oldColumnSettings[col.columnId] || {}),
            isTransposed: usesTransposing && columnIndex < lastTransposedColumnIndex,
            columnId: col.columnId,
          })),
        },
        previewIcon: IconChartDatatable,
        // tables are hidden from suggestion bar, but used for drag & drop and chart switching
        hide: true,
      },
    ];
  },

  /*
  Datatable works differently on text-based datasource and form-based
  - Form-based: It relies on the isBucketed flag to identify groups. It allows only numeric fields
  on the Metrics dimension
  - Text-based: It relies on the isMetric flag to identify groups. It allows all type of fields
  on the Metric dimension in cases where there are no numeric columns
  **/
  getConfiguration({ state, frame }) {
    const theme = kibanaTheme.getTheme();
    const palettes = getKbnPalettes(theme);

    const { sortedColumns, datasource } = getDatasourceAndSortedColumns(
      state,
      frame.datasourceLayers
    );

    const columnMap: Record<string, ColumnState> = {};
    state.columns.forEach((column) => {
      columnMap[column.columnId] = column;
    });

    if (!sortedColumns) {
      return { groups: [] };
    }
    const isTextBasedLanguage = datasource?.isTextBasedLanguage();
    const currentData =
      frame.activeData?.[state.layerId] ?? frame.activeData?.[DatatableInspectorTables.Default];

    const getResolvedDisplayColors = (accessor: string) => {
      const { palette, colorMapping } = columnMap[accessor] ?? {};
      const columnMeta = getDatatableColumn(currentData, accessor)?.meta;
      const { isCategory: isBucketable } = getAccessorType(datasource, accessor, columnMeta?.type);
      const dataBounds =
        getDataBoundsForAccessor(accessor, currentData, state.columns) ?? getFallbackDataBounds();
      const hasColorConfigMismatch = hasIncompatibleColorConfig({
        colorByTerms: isBucketable,
        palette,
        colorMapping,
      });
      const needsDefaults = !palette && !colorMapping;

      const { palette: resolvedPalette, colorMapping: resolvedColorMapping } =
        hasColorConfigMismatch || needsDefaults
          ? getColorDefaults({ colorByTerms: isBucketable, paletteService, dataBounds })
          : { palette, colorMapping };

      return getPaletteDisplayColors(
        paletteService,
        palettes,
        theme.darkMode,
        resolvedPalette,
        resolvedColorMapping
      );
    };

    /**
     * Builds the dimension-trigger color indicator for a column.
     *
     * Mirrors the metric chart's static/dynamic split: a single-fill progress
     * decoration shows a solid swatch (`color`) with no palette gradient, while
     * palette-driven coloring (cell/text/badge, or solid/gradient progress) shows
     * the palette preview (`colorBy` + stops).
     */
    const getColorIndicator = (
      accessor: string
    ): Pick<AccessorConfig, 'triggerIconType' | 'palette' | 'color'> => {
      const { colorMode = 'none', hidden, fillStyle } = columnMap[accessor] ?? {};

      if (hidden) return { triggerIconType: 'invisible' };

      if (colorMode === 'progress' && fillStyle && !isPaletteFillMode(fillStyle.fillMode)) {
        return {
          triggerIconType: 'color',
          color: fillStyle.color ?? DEFAULT_PROGRESS_BAR_COLOR,
        };
      }

      const stops = getResolvedDisplayColors(accessor);
      const hasColoring = colorMode !== 'none' && stops.length > 0;
      return hasColoring
        ? { triggerIconType: 'colorBy', palette: stops }
        : { triggerIconType: undefined };
    };

    return {
      groups: [
        // In this group we get columns that are not transposed and are not on the metric dimension
        {
          groupId: 'rows',
          groupLabel: i18n.translate('xpack.lens.datatable.breakdownRows', {
            defaultMessage: 'Rows',
          }),
          dimensionEditorGroupLabel: i18n.translate('xpack.lens.datatable.breakdownRow', {
            defaultMessage: 'Row',
          }),
          groupTooltip: i18n.translate('xpack.lens.datatable.breakdownRows.description', {
            defaultMessage:
              'Split table rows by field. This is recommended for high cardinality breakdowns.',
          }),
          layerId: state.layerId,
          accessors: sortedColumns
            .filter((c) => {
              const column = state.columns.find((col) => col.columnId === c);
              if (isTextBasedLanguage) {
                return (
                  !datasource!.getOperationForColumnId(c)?.inMetricDimension &&
                  !column?.isMetric &&
                  !column?.isTransposed
                );
              }
              return datasource!.getOperationForColumnId(c)?.isBucketed && !column?.isTransposed;
            })
            .map((accessor) => {
              const { collapseFn } = columnMap[accessor] ?? {};
              const indicator = getColorIndicator(accessor);
              // A collapsed row with no coloring shows the aggregate icon.
              if (indicator.triggerIconType === undefined && collapseFn) {
                return { columnId: accessor, triggerIconType: 'aggregate' as const };
              }
              return { columnId: accessor, ...indicator };
            }),
          supportsMoreColumns: true,
          filterOperations: (op) => op.isBucketed,
          dataTestSubj: 'lnsDatatable_rows',
          enableDimensionEditor: true,
          hideGrouping: true,
          nestingOrder: 1,
        },
        // In this group we get columns that are transposed and are not on the metric dimension
        {
          groupId: 'columns',
          groupLabel: i18n.translate('xpack.lens.datatable.breakdownColumns', {
            defaultMessage: 'Split metrics by',
          }),
          dimensionEditorGroupLabel: i18n.translate('xpack.lens.datatable.breakdownColumn', {
            defaultMessage: 'Split metrics by',
          }),
          groupTooltip: i18n.translate('xpack.lens.datatable.breakdownColumns.description', {
            defaultMessage:
              "Split metric columns by field. It's recommended to keep the number of columns low to avoid horizontal scrolling.",
          }),
          layerId: state.layerId,
          accessors: sortedColumns
            .filter((c) => {
              if (isTextBasedLanguage) {
                return state.columns.find((col) => col.columnId === c)?.isTransposed;
              }
              return (
                datasource!.getOperationForColumnId(c)?.isBucketed &&
                state.columns.find((col) => col.columnId === c)?.isTransposed
              );
            })
            .map((accessor) => ({ columnId: accessor })),
          supportsMoreColumns: true,
          filterOperations: (op) => op.isBucketed,
          dataTestSubj: 'lnsDatatable_columns',
          enableDimensionEditor: true,
          hideGrouping: true,
          nestingOrder: 0,
        },
        // In this group we get columns are on the metric dimension
        {
          groupId: 'metrics',
          groupLabel: i18n.translate('xpack.lens.datatable.metrics', {
            defaultMessage: 'Metrics',
          }),
          dimensionEditorGroupLabel: i18n.translate('xpack.lens.datatable.metric', {
            defaultMessage: 'Metric',
          }),
          paramEditorCustomProps: {
            headingLabel: i18n.translate('xpack.lens.datatable.headingLabel', {
              defaultMessage: 'Value',
            }),
          },
          layerId: state.layerId,
          accessors: sortedColumns
            .filter((c) => {
              const operation = datasource!.getOperationForColumnId(c);
              if (isTextBasedLanguage) {
                return (
                  operation?.inMetricDimension ||
                  state.columns.find((col) => col.columnId === c)?.isMetric
                );
              }
              return !operation?.isBucketed;
            })
            .map((accessor) => ({ columnId: accessor, ...getColorIndicator(accessor) })),
          supportsMoreColumns: true,
          filterOperations: (op) => !op.isBucketed,
          isMetricDimension: true,
          requiredMinDimensionCount: isTextBasedLanguage ? 0 : 1,
          dataTestSubj: 'lnsDatatable_metrics',
          enableDimensionEditor: true,
        },
      ],
    };
  },

  setDimension({ prevState, columnId, groupId, previousColumn }) {
    if (
      prevState.columns.some(
        (column) =>
          column.columnId === columnId || (previousColumn && column.columnId === previousColumn)
      )
    ) {
      return {
        ...prevState,
        columns: prevState.columns.map((column) => {
          if (column.columnId === columnId || column.columnId === previousColumn) {
            return {
              ...column,
              columnId,
              isTransposed: groupId === 'columns',
              isMetric: groupId === 'metrics',
            };
          }
          return column;
        }),
      };
    }
    return {
      ...prevState,
      columns: [
        ...prevState.columns,
        { columnId, isTransposed: groupId === 'columns', isMetric: groupId === 'metrics' },
      ],
    };
  },
  removeDimension({ prevState, columnId }) {
    return {
      ...prevState,
      columns: prevState.columns.filter((column) => column.columnId !== columnId),
      sorting: prevState.sorting?.columnId === columnId ? undefined : prevState.sorting,
    };
  },
  DimensionEditorComponent(props) {
    const isDarkMode = useKibanaIsDarkMode();
    const palettes = useKbnPalettes();

    return (
      <TableDimensionEditor
        {...props}
        isDarkMode={isDarkMode}
        palettes={palettes}
        paletteService={paletteService}
        formatFactory={formatFactory}
      />
    );
  },

  DimensionEditorAdditionalSectionComponent(props) {
    return <TableDimensionEditorAdditionalSection {...props} paletteService={paletteService} />;
  },

  DimensionEditorDataExtraComponent(props) {
    return <TableDimensionDataExtraEditor {...props} paletteService={paletteService} />;
  },

  getSupportedLayers() {
    return [
      {
        type: LayerTypes.DATA,
        label: i18n.translate('xpack.lens.datatable.addLayer', {
          defaultMessage: 'Visualization',
        }),
      },
    ];
  },

  getLayerType(layerId, state) {
    if (state?.layerId === layerId) {
      return state.layerType;
    }
  },

  toExpression(
    state,
    datasourceLayers,
    { title, description } = {},
    datasourceExpressionsByLayers = {}
  ): Ast | null {
    const { sortedColumns, datasource } = getDatasourceAndSortedColumns(state, datasourceLayers);
    const isTextBasedLanguage = datasource?.isTextBasedLanguage();

    if (
      sortedColumns?.length &&
      !isTextBasedLanguage &&
      sortedColumns.filter((c) => !datasource!.getOperationForColumnId(c)?.isBucketed).length === 0
    ) {
      return null;
    }

    if (!datasourceExpressionsByLayers || Object.keys(datasourceExpressionsByLayers).length === 0) {
      return null;
    }

    const columnMap: Record<string, ColumnState> = {};
    state.columns.forEach((column) => {
      columnMap[column.columnId] = column;
    });

    const columns = sortedColumns!
      .filter((columnId) => datasource!.getOperationForColumnId(columnId))
      .map((columnId) => columnMap[columnId]);

    const datasourceExpression = datasourceExpressionsByLayers[state.layerId];

    const lensCollapseFnAsts = columns
      .filter((c) => c.collapseFn)
      .map((c) =>
        buildExpressionFunction<CollapseExpressionFunction>('lens_collapse', {
          by: columns
            .filter(
              (col) =>
                col.columnId !== c.columnId &&
                datasource!.getOperationForColumnId(col.columnId)?.isBucketed
            )
            .map((col) => col.columnId),
          metric: columns
            .filter((col) => !datasource!.getOperationForColumnId(col.columnId)?.isBucketed)
            .map((col) => col.columnId),
          fn: [c.collapseFn!],
        }).toAst()
      );

    const datatableFnAst = buildExpressionFunction<DatatableExpressionFunction>('lens_datatable', {
      title: title || '',
      description: description || '',
      columns: columns
        .filter((c) => !c.collapseFn)
        .map((column) => {
          const { isNumeric, isCategory: isBucketable } = getAccessorType(
            datasource,
            column.columnId
          );
          const stops = getOverridePaletteStops(paletteService, column.palette);
          const paletteParams = {
            ...column.palette?.params,
            // rewrite colors and stops as two distinct arguments
            colors: stops?.map(({ color }) => color),
            stops:
              column.palette?.params?.name === LENS_ROW_HEIGHT_MODE.custom
                ? stops?.map(({ stop }) => stop)
                : [],
            reverse: false, // managed at UI level
          };
          const { sortingHint, inMetricDimension } =
            datasource?.getOperationForColumnId(column.columnId) ?? {};
          const hasNoSummaryRow = column.summaryRow == null || column.summaryRow === 'none';
          const canColor = isNumeric || isBucketable;
          const colorByTerms = isBucketable;
          let isTransposable =
            !isTextBasedLanguage &&
            !datasource!.getOperationForColumnId(column.columnId)?.isBucketed;

          if (isTextBasedLanguage) {
            isTransposable = Boolean(column?.isMetric || inMetricDimension);
          }

          // Pass through palette/colorMapping as-is without defaults.
          // Defaults are applied at render time (table_basic.tsx) where we have
          // access to actual data type and bounds for correct default calculation.
          const datatableColumnFn = buildExpressionFunction<DatatableColumnFn>(
            'lens_datatable_column',
            {
              columnId: column.columnId,
              hidden: column.hidden,
              oneClickFilter: column.oneClickFilter,
              width: column.width,
              isTransposed: column.isTransposed,
              transposable: isTransposable,
              alignment: column.alignment,
              colorMode: canColor ? column.colorMode ?? 'none' : 'none',
              palette:
                !canColor || !column.palette
                  ? undefined
                  : paletteService
                      // The by value palette is a pseudo custom palette that is only custom from params level
                      .get(colorByTerms ? column.palette.name : CUSTOM_PALETTE)
                      .toExpression(paletteParams),
              colorMapping:
                canColor && column.colorMapping ? JSON.stringify(column.colorMapping) : undefined,
              fillStyle:
                canColor && column.colorMode === 'progress' && column.fillStyle
                  ? JSON.stringify(column.fillStyle)
                  : undefined,
              summaryRow: hasNoSummaryRow ? undefined : column.summaryRow!,
              summaryLabel: hasNoSummaryRow
                ? undefined
                : column.summaryLabel ?? getDefaultSummaryLabel(column.summaryRow!),
              sortingHint,
            }
          );
          return buildExpression([datatableColumnFn]).toAst();
        }),
      sortingColumnId: state.sorting?.columnId || '',
      sortingDirection: state.sorting?.direction || 'none',
      fitRowToContent: state.rowHeight === LENS_ROW_HEIGHT_MODE.auto,
      headerRowHeight: state.headerRowHeight ?? DEFAULT_HEADER_ROW_HEIGHT,
      rowHeightLines: state.rowHeightLines ?? DEFAULT_ROW_HEIGHT_LINES,
      headerRowHeightLines: state.headerRowHeightLines ?? DEFAULT_HEADER_ROW_HEIGHT_LINES,
      pageSize: state.paging?.enabled ? state.paging.size : undefined,
      density: state.density ?? LENS_DATAGRID_DENSITY.NORMAL,
      showRowNumbers: state.showRowNumbers,
    }).toAst();

    return {
      type: 'expression',
      chain: [...(datasourceExpression?.chain ?? []), ...lensCollapseFnAsts, datatableFnAst],
    };
  },

  getTelemetryEventsOnSave(state, prevState) {
    const colorMappingEvents = state.columns.flatMap((col) => {
      const prevColumn = prevState?.columns?.find((prevCol) => prevCol.columnId === col.columnId);
      return getColorMappingTelemetryEvents(col.colorMapping, prevColumn?.colorMapping);
    });

    return colorMappingEvents;
  },

  getRenderEventCounters(state) {
    const events = {
      color_by_value: false,
      summary_row: false,
    };

    state.columns.forEach((column) => {
      if (column.summaryRow && column.summaryRow !== 'none') {
        events.summary_row = true;
      }
      if (column.colorMode && column.colorMode !== 'none') {
        events.color_by_value = true;
      }
    });

    return Object.entries(events).reduce<string[]>((acc, [key, isActive]) => {
      if (isActive) {
        acc.push(`dimension_${key}`);
      }
      return acc;
    }, []);
  },

  FlyoutToolbarComponent(props) {
    return <FlyoutToolbar {...props} contentMap={{ style: DatatableAppearanceSettings }} />;
  },

  onEditAction(state, event) {
    switch (event.data.action) {
      case 'sort':
        return {
          ...state,
          sorting: {
            columnId: event.data.columnId,
            direction: event.data.direction,
          },
        };
      case 'toggle':
        const toggleColumnId = event.data.columnId;
        return {
          ...state,
          columns: state.columns.map((column) => {
            if (column.columnId === toggleColumnId) {
              return {
                ...column,
                hidden: !column.hidden,
              };
            } else {
              return column;
            }
          }),
        };
      case 'resize':
        const targetWidth = event.data.width;
        const resizeColumnId = event.data.columnId;
        return {
          ...state,
          columns: state.columns.map((column) => {
            if (column.columnId === resizeColumnId) {
              return {
                ...column,
                width: targetWidth,
              };
            } else {
              return column;
            }
          }),
        };
      case 'pagesize':
        return {
          ...state,
          paging: {
            enabled: state.paging?.enabled || false,
            size: event.data.size,
          },
        };
      default:
        return state;
    }
  },
  getSuggestionFromConvertToLensContext({ suggestions, context }) {
    const allSuggestions = suggestions as Array<
      Suggestion<DatatableVisualizationState, FormBasedPersistedState>
    >;
    const suggestion: Suggestion<DatatableVisualizationState, FormBasedPersistedState> = {
      ...allSuggestions[0],
      datasourceState: {
        ...allSuggestions[0].datasourceState,
        layers: allSuggestions.reduce(
          (acc, s) => ({
            ...acc,
            ...s.datasourceState?.layers,
          }),
          {}
        ),
      },
      visualizationState: {
        ...allSuggestions[0].visualizationState,
        ...context.configuration,
      },
    };
    return suggestion;
  },

  getExportDatatables(state, datasourceLayers = {}, activeData) {
    const columnMap = new Map(state.columns.map((c) => [c.columnId, c]));
    const datatable =
      activeData?.[DatatableInspectorTables.Transpose] ??
      activeData?.[DatatableInspectorTables.Default];
    if (!datatable) return [];

    const columns = datatable.columns.filter(({ id }) => !columnMap.get(getOriginalId(id))?.hidden);
    let rows = datatable.rows;

    const sortColumn =
      state.sorting?.columnId && columns.find(({ id }) => id === state.sorting?.columnId);
    const sortDirection = state.sorting?.direction;

    if (sortColumn && sortDirection && sortDirection !== 'none') {
      const datasource = datasourceLayers[state.layerId];
      const schemaType =
        datasource?.getOperationForColumnId?.(sortColumn.id)?.sortingHint ??
        getSimpleColumnType(sortColumn.meta);
      const sortingCriteria = getSortingCriteria(
        schemaType,
        sortColumn.id,
        formatFactory(sortColumn.meta?.params)
      );
      rows = [...rows].sort((rA, rB) => sortingCriteria(rA, rB, sortDirection));
    }

    return [
      {
        ...datatable,
        columns,
        rows,
      },
    ];
  },

  getUserMessages(state, { frame, setState }): UserMessage[] {
    const warnings: UserMessage[] = [];
    const { datasourceLayers, activeData } = frame;
    const datasource = datasourceLayers?.[state.layerId];
    const currentData =
      activeData?.[state.layerId] ?? activeData?.[DatatableInspectorTables.Default];

    if (!datasource || !currentData || state.columns.length === 0) {
      return warnings;
    }

    const mismatchedColumnLabels: string[] = [];

    const normalizedColumns = state.columns.map((column) => {
      const { colorMode, palette, colorMapping } = column;

      // 'progress' owns its own palette/range lifecycle (the solid/gradient range
      // mirrors palette params), so it is excluded from the color-mismatch auto-fix
      // to avoid rewriting the palette out from under the bar domain.
      if (!colorMode || colorMode === 'none' || colorMode === 'progress') {
        return column;
      }

      const columnMeta = getDatatableColumn(currentData, column.columnId)?.meta;
      const { isCategory: isBucketable } = getAccessorType(
        datasource,
        column.columnId,
        columnMeta?.type
      );

      if (
        hasIncompatibleColorConfig({
          colorByTerms: isBucketable,
          palette,
          colorMapping,
        })
      ) {
        const operation = datasource.getOperationForColumnId(column.columnId);
        mismatchedColumnLabels.push(operation?.label ?? column.columnId);

        const dataBounds =
          getDataBoundsForAccessor(column.columnId, currentData, state.columns) ??
          getFallbackDataBounds();

        const { palette: resolvedPalette, colorMapping: resolvedColorMapping } = getColorDefaults({
          colorByTerms: isBucketable,
          paletteService,
          dataBounds,
        });

        const fixedColumn = {
          ...column,
          palette: resolvedPalette,
          colorMapping: resolvedColorMapping,
        };
        if (fixedColumn.palette == null) delete fixedColumn.palette;
        if (fixedColumn.colorMapping == null) delete fixedColumn.colorMapping;
        return fixedColumn;
      }

      return column;
    });

    const hasChanges = normalizedColumns.some(
      (col, i) =>
        col.colorMapping !== state.columns[i].colorMapping ||
        col.palette !== state.columns[i].palette
    );

    const fixedState = hasChanges ? { ...state, columns: normalizedColumns } : undefined;

    if (mismatchedColumnLabels.length > 0) {
      const columnList = mismatchedColumnLabels.map((label) => `"${label}"`).join(', ');

      warnings.push({
        uniqueId: DATATABLE_COLOR_MISMATCH,
        severity: 'warning',
        shortMessage: i18n.translate(
          'xpack.lens.datatableVisualization.colorMismatchShortMessage',
          {
            defaultMessage:
              '{count, plural, one {Incompatible colors in one column} other {Incompatible colors in {count} columns}}',
            values: { count: mismatchedColumnLabels.length },
          }
        ),
        longMessage: (
          <>
            <FormattedMessage
              id="xpack.lens.datatableVisualization.colorMismatchLongMessage"
              defaultMessage="Color settings in {count, plural, one {column} other {columns}} {columnList} are incompatible and have been temporarily disabled. Fix the issue to update the colors automatically, or edit the color configuration manually."
              values={{
                count: mismatchedColumnLabels.length,
                columnList: <strong>{columnList}</strong>,
              }}
            />
            {setState && fixedState && (
              <>
                <EuiSpacer size="s" />
                <EuiLink
                  data-test-subj="lensFixColorMismatchAction"
                  onClick={() => setState(fixedState)}
                >
                  {i18n.translate('xpack.lens.datatableVisualization.colorMismatchFixActionLabel', {
                    defaultMessage: 'Fix color configuration',
                  })}
                </EuiLink>
              </>
            )}
          </>
        ),
        fixableInEditor: true,
        displayLocations: [{ id: 'toolbar' }, { id: 'embeddableBadge' }],
      });
    }

    return warnings;
  },

  getVisualizationInfo(state) {
    const visibleMetricColumns = state.columns.filter(
      (c) => !c.hidden && c.colorMode && c.colorMode !== 'none'
    );

    return {
      layers: [
        {
          layerId: state.layerId,
          layerType: state.layerType,
          chartType: 'table',
          ...this.getDescription(state),
          palette:
            // if multiple columns have color by value, do not show the palette for now: see #154349
            visibleMetricColumns.length > 1
              ? undefined
              : visibleMetricColumns[0]?.palette?.params?.stops?.map(({ color }) => color),
          dimensions: state.columns.map((column) => {
            let name = i18n.translate('xpack.lens.datatable.metric', {
              defaultMessage: 'Metric',
            });
            let dimensionType = 'Metric';
            if (!column.transposable) {
              if (column.isTransposed) {
                name = i18n.translate('xpack.lens.datatable.breakdownColumns', {
                  defaultMessage: 'Split metrics by',
                });
                dimensionType = 'split_metrics';
              } else {
                name = i18n.translate('xpack.lens.datatable.breakdownRow', {
                  defaultMessage: 'Row',
                });
                dimensionType = 'split_rows';
              }
            }
            return {
              dimensionType,
              id: column.columnId,
              name,
            };
          }),
        },
      ],
    };
  },
});

function getDatasourceAndSortedColumns(
  state: DatatableVisualizationState,
  datasourceLayers: DatasourceLayers
) {
  const datasource = datasourceLayers[state.layerId];
  const originalOrder = datasource?.getTableSpec().map(({ columnId }) => columnId);
  // When we add a column it could be empty, and therefore have no order
  const sortedColumns = Array.from(
    new Set(originalOrder?.concat(state.columns.map(({ columnId }) => columnId)))
  );

  return { datasource, sortedColumns };
}
