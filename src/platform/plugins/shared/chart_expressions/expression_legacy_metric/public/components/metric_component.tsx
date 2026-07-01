/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { Component } from 'react';
import type { IFieldFormat } from '@kbn/field-formats-plugin/common';
import {
  getColumnByAccessor,
  getAccessor,
  getFormatByAccessor,
} from '@kbn/chart-expressions-common';
import type { Datatable } from '@kbn/expressions-plugin/public';
import type { CustomPaletteState } from '@kbn/charts-plugin/public';
import type { ExpressionValueVisDimension } from '@kbn/chart-expressions-common';
import { getFormatService, getPaletteService } from '../services';
import type { VisParams, MetricOptions } from '../../common/types';
import { MetricVisValue } from './metric_value';
import {
  formatValueAsText,
  formatValueAsReactNode,
  shouldApplyColor,
  getLegacyMetricDataBounds,
} from '../utils';
import { needsLightText } from '../utils/palette';
import { withAutoScale } from './with_auto_scale';

export interface MetricVisComponentProps {
  visParams: Pick<VisParams, 'metric' | 'dimensions'>;
  visData: Datatable;
  filterable: boolean[];
  fireEvent: (event: any) => void;
  renderComplete: () => void;
}

const AutoScaleMetricVisValue = withAutoScale(MetricVisValue);

class MetricVisComponent extends Component<MetricVisComponentProps> {
  private getColor(
    value: number,
    paletteParams: CustomPaletteState,
    bounds: { min: number; max: number }
  ) {
    return getPaletteService().get('custom')?.getColorForValue?.(value, paletteParams, bounds);
  }

  private processTableGroups(table: Datatable) {
    const { metric: metricConfig, dimensions } = this.props.visParams;
    const { percentageMode: isPercentageMode, style, palette } = metricConfig;
    const { stops = [] } = palette ?? {};
    const min = stops[0];
    const max = stops[stops.length - 1];

    let bucketColumnId: string;
    let bucketFormatter: IFieldFormat;

    if (dimensions.bucket) {
      const bucketColumn = getColumnByAccessor(dimensions.bucket!, table.columns);
      bucketColumnId = bucketColumn?.id!;
      bucketFormatter = getFormatService().deserialize(
        getFormatByAccessor(dimensions.bucket, table.columns)
      );
    }

    return dimensions.metrics.reduce(
      (acc: MetricOptions[], metric: string | ExpressionValueVisDimension) => {
        const column = getColumnByAccessor(metric, table?.columns);
        const colIndex = table?.columns.indexOf(column!);
        const formatter = getFormatService().deserialize(
          getFormatByAccessor(metric, table.columns)
        );
        // Color against the live data range (like the metric/datatable charts) rather than the
        // edit-time `rangeMin`/`rangeMax` snapshot frozen on the palette.
        const dataBounds = getLegacyMetricDataBounds(column?.id, table);
        const metrics = table.rows.map((row, rowIndex) => {
          let title = column!.name;
          let value: number = row[column!.id];
          const color = palette ? this.getColor(value, palette, dataBounds) : undefined;

          if (isPercentageMode && stops.length) {
            value = (value - min) / (max - min);
          }

          const formattedValue = formatValueAsReactNode(value, formatter);
          if (bucketColumnId) {
            const bucketValue = formatValueAsText(row[bucketColumnId], bucketFormatter);
            title = `${bucketValue} - ${title}`;
          }

          const shouldBrush = shouldApplyColor(color ?? '');
          return {
            label: title,
            value: formattedValue,
            color: shouldBrush && (style.labelColor ?? false) ? color : undefined,
            bgColor: shouldBrush && (style.bgColor ?? false) ? color : undefined,
            lightText: shouldBrush && (style.bgColor ?? false) && needsLightText(color),
            rowIndex,
            colIndex,
          };
        });

        return [...acc, ...metrics];
      },
      []
    );
  }

  private filterColumn = (row: number, metricColIndex: number) => {
    const { dimensions } = this.props.visParams;

    const table = this.props.visData;
    let column = dimensions.bucket ? getAccessor(dimensions.bucket) : metricColIndex;
    if (typeof column === 'object' && 'id' in column) {
      column = table.columns.indexOf(column);
    }
    this.props.fireEvent({
      name: 'filter',
      data: {
        data: [
          {
            table,
            column,
            row,
          },
        ],
      },
    });
  };

  private isAutoScaleWithColorizingContainer = () => {
    return this.props.visParams.metric.autoScale && this.props.visParams.metric.colorFullBackground;
  };

  private renderMetric = (metric: MetricOptions, index: number, arrayRef: MetricOptions[]) => {
    const hasBuckets = this.props.visParams.dimensions.bucket !== undefined;
    const MetricComponent = this.props.visParams.metric.autoScale
      ? AutoScaleMetricVisValue
      : MetricVisValue;

    return (
      <MetricComponent
        autoScaleParams={
          this.isAutoScaleWithColorizingContainer()
            ? {
                containerStyles: {
                  backgroundColor: metric.bgColor,
                  minHeight: '100%',
                  minWidth: '100%',
                },
                ...(this.props.visParams.metric?.autoScaleMetricAlignment
                  ? {
                      autoScaleMetricAlignment:
                        this.props.visParams.metric?.autoScaleMetricAlignment,
                    }
                  : {}),
              }
            : undefined
        }
        key={index}
        metric={metric}
        style={this.props.visParams.metric.style}
        onFilter={
          hasBuckets || this.props.filterable[index]
            ? () => this.filterColumn(metric.rowIndex, metric.colIndex)
            : undefined
        }
        autoScale={this.props.visParams.metric.autoScale}
        colorFullBackground={this.props.visParams.metric.colorFullBackground}
        labelConfig={this.props.visParams.metric.labels}
        renderComplete={arrayRef.length - 1 === index ? this.props.renderComplete : undefined}
      />
    );
  };

  render() {
    let metricsHtml;
    if (this.props.visData) {
      const metrics = this.processTableGroups(this.props.visData);
      metricsHtml = metrics.map(this.renderMetric);
    }
    return metricsHtml;
  }
}

// default export required for React.Lazy
// eslint-disable-next-line import/no-default-export
export { MetricVisComponent as default };
