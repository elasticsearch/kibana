/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { LegendAction, XYChartSeriesIdentifier } from '@elastic/charts';
import {
  getAccessorByDimension,
  getComputedColumnWarningForColumns,
} from '@kbn/chart-expressions-common';
import type { CellValueContext } from '@kbn/embeddable-plugin/public';
import { ESQL_TABLE_TYPE } from '@kbn/data-plugin/common';
import type { LayerCellValueActions, FilterEvent } from '../types';
import type { CommonXYDataLayerConfig } from '../../common';
import type { LegendCellValueActions } from './legend_action_popover';
import { LegendActionPopover } from './legend_action_popover';
import type {
  DatatablesWithFormatInfo,
  LayersAccessorsTitles,
  LayersFieldFormats,
} from '../helpers';
import { getSeriesName, hasMultipleLayersWithSplits } from '../helpers';

export const getLegendAction = (
  dataLayers: CommonXYDataLayerConfig[],
  onFilter: (data: FilterEvent['data']) => void,
  layerCellValueActions: LayerCellValueActions,
  fieldFormats: LayersFieldFormats,
  formattedDatatables: DatatablesWithFormatInfo,
  titles: LayersAccessorsTitles,
  singleTable?: boolean
): LegendAction =>
  React.memo(({ series: [xySeries] }) => {
    const series = xySeries as XYChartSeriesIdentifier;
    const layerIndex = dataLayers.findIndex((l) =>
      series.seriesKeys.some((key: string | number) =>
        l.accessors.some(
          (accessor) => getAccessorByDimension(accessor, l.table.columns) === key.toString()
        )
      )
    );
    const allYAccessors = dataLayers.flatMap((dataLayer) => dataLayer.accessors);

    if (layerIndex === -1) {
      return null;
    }

    const layer = dataLayers[layerIndex];
    if (!layer || !layer.splitAccessors || !layer.splitAccessors.length) {
      return null;
    }

    const { table } = layer;
    const isEsqlMode = table?.meta?.type === ESQL_TABLE_TYPE;

    const filterActionData: FilterEvent['data']['data'] = [];
    const cellValueActionData: CellValueContext['data'] = [];

    series.splitAccessors.forEach((value, accessor) => {
      const rowIndex = formattedDatatables[layer.layerId].table.rows.findIndex((row) => {
        return row[accessor] === value;
      });
      const columnIndex = table.columns.findIndex((column) => column.id === accessor);

      if (rowIndex >= 0 && columnIndex >= 0) {
        filterActionData.push({
          row: rowIndex,
          column: columnIndex,
          value: table.rows[rowIndex][accessor],
          table,
        });

        cellValueActionData.push({
          value: table.rows[rowIndex][accessor],
          columnMeta: table.columns[columnIndex].meta,
        });
      }
    });

    if (filterActionData.length === 0) {
      return null;
    }

    const warningMessage = isEsqlMode
      ? getComputedColumnWarningForColumns(
          filterActionData.map((data) => data.table.columns[data.column])
        )
      : undefined;

    const filterHandler = ({ negate }: { negate?: boolean } = {}) => {
      if (!warningMessage) {
        onFilter({ data: filterActionData, negate });
      }
    };

    const legendCellValueActions: LegendCellValueActions =
      layerCellValueActions[layerIndex]?.map((action) => ({
        ...action,
        execute: () => action.execute(cellValueActionData),
      })) ?? [];

    const label =
      getSeriesName(
        series,
        {
          splitAccessors: layer.splitAccessors,
          accessorsCount: singleTable ? allYAccessors.length : layer.accessors.length,
          columns: table.columns,
          splitAccessorsFormats: fieldFormats[layer.layerId].splitSeriesAccessors,
          alreadyFormattedColumns: formattedDatatables[layer.layerId].formattedColumns,
          columnToLabelMap: layer.columnToLabel ? JSON.parse(layer.columnToLabel) : {},
          multipleLayersWithSplits: hasMultipleLayersWithSplits(dataLayers),
        },
        titles
      )?.toString() ?? '';

    return (
      <LegendActionPopover
        label={label}
        onFilter={filterHandler}
        legendCellValueActions={legendCellValueActions}
        showDisabledFilterActions={!!warningMessage}
        footerMessage={warningMessage}
      />
    );
  });
