/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isUndefined, uniq, find } from 'lodash';
import React from 'react';
import moment from 'moment';
import type { Unit } from '@kbn/datemath';
import dateMath from '@kbn/datemath';
import { Endzones, getAdjustedInterval } from '@kbn/charts-plugin/public';
import type { DatatableUtilitiesService } from '@kbn/data-plugin/common';
import { splitStringInterval } from '@kbn/data-plugin/common';
import { getAccessorByDimension, getColumnByAccessor } from '@kbn/chart-expressions-common';
import type { AxisExtentConfigResult, CommonXYDataLayerConfig } from '../../common';

export interface XDomain {
  min?: number;
  max?: number;
  minInterval?: number;
}

const getDateHistogramMeta = (
  datatableUtilitites: DatatableUtilitiesService,
  layers: CommonXYDataLayerConfig[]
) => {
  return layers
    .map(({ xAccessor, table }) => {
      const xColumn = xAccessor ? getColumnByAccessor(xAccessor, table.columns) : null;
      const meta = xColumn && datatableUtilitites.getDateHistogramMeta(xColumn);
      return meta ? { meta, field: xColumn?.meta.field } : undefined;
    })
    .find(Boolean);
};

const getBucketBounds = (
  from: number,
  to: number,
  anchor: number,
  step: number,
  unit: Unit,
  timeZone: string,
  dropPartials: boolean
) => {
  if (!step || step <= 0) {
    return undefined;
  }

  const anchorTime = moment.tz(anchor, timeZone);

  const stepsBefore = Math.ceil(anchorTime.diff(moment.tz(from, timeZone), unit, true) / step);
  const start = anchorTime.clone().subtract(stepsBefore * step, unit);

  const stepsAfter = Math.ceil(moment.tz(to, timeZone).diff(anchorTime, unit, true) / step);
  const end = anchorTime.clone().add(stepsAfter * step, unit);

  const count = Math.round(end.diff(start, unit, true) / step) + 1;
  const buckets = Array.from({ length: count }, (_, i) => start.clone().add(i * step, unit));

  const valid = buckets.filter((bucket) => {
    const bucketStart = bucket.valueOf();
    const bucketEnd = bucket.clone().add(step, unit).valueOf();
    if (dropPartials) {
      return bucketStart > from && bucketEnd <= to;
    }
    return bucketEnd > from && bucketStart < to;
  });

  if (valid.length === 0) return undefined;

  const adjustedInterval = getAdjustedInterval(
    valid.map((bucket) => bucket.valueOf()),
    step,
    unit,
    timeZone
  );

  return {
    min: valid[0].valueOf(),
    max: valid[valid.length - 1].valueOf(),
    minInterval: adjustedInterval,
  };
};

const getXValues = (layers: CommonXYDataLayerConfig[]) => {
  return uniq(
    layers
      .flatMap<number>(({ table, xAccessor }) => {
        const accessor = xAccessor ? getAccessorByDimension(xAccessor, table.columns) : undefined;
        return table.rows.map((row) => accessor && row[accessor] && row[accessor].valueOf());
      })
      .filter((v) => !isUndefined(v))
      .sort((a, b) => a - b)
  );
};

export const getXDomain = (
  datatableUtilitites: DatatableUtilitiesService,
  layers: CommonXYDataLayerConfig[],
  minInterval: number | undefined,
  isTimeViz: boolean,
  isHistogram: boolean,
  hasBars: boolean,
  timeZone: string,
  xExtent?: AxisExtentConfigResult
) => {
  if (!isTimeViz) {
    const baseDomain = isHistogram ? { minInterval, min: NaN, max: NaN } : undefined;

    if (isFullyQualified(baseDomain)) {
      if (xExtent) {
        return {
          baseDomain,
          extendedDomain: {
            min: xExtent.lowerBound ?? NaN,
            max: xExtent.upperBound ?? NaN,
            minInterval: baseDomain.minInterval,
          },
        };
      }

      const xValues = getXValues(layers);
      const domainMin = Math.min(xValues[0], baseDomain.min);
      const domainMax = Math.max(xValues[xValues.length - 1], baseDomain.max);
      return {
        baseDomain,
        extendedDomain: {
          min: domainMin,
          max: domainMax,
          minInterval: baseDomain.minInterval,
        },
      };
    } else {
      return {
        baseDomain,
        extendedDomain: baseDomain,
      };
    }
  }

  const dateHistogram = getDateHistogramMeta(datatableUtilitites, layers);

  const from = dateHistogram?.meta?.timeRange?.from;
  const to = dateHistogram?.meta?.timeRange?.to;
  const dropPartials = dateHistogram?.meta?.dropPartials;

  const baseDomain = {
    min: from ? moment(from).valueOf() : NaN,
    max: to ? moment(to).valueOf() : NaN,
    minInterval,
  };

  if (!isFullyQualified(baseDomain)) {
    return {
      extendedDomain: baseDomain,
      baseDomain,
    };
  }

  const xValues = getXValues(layers);

  const duration = moment.duration(baseDomain.minInterval);
  const parsedInterval = dateHistogram?.meta?.interval
    ? splitStringInterval(dateHistogram.meta.interval)
    : null;
  const unit =
    parsedInterval?.unit ?? (find(dateMath.units, (u) => Number.isInteger(duration.as(u))) as Unit);
  const step = parsedInterval?.value ?? duration.as(unit);

  // we construct the bucket list based on applied time range, min interval and one anchor point.
  // this is needed as we might not have all the data points in the time range (ES|QL).
  const buckets = getBucketBounds(
    baseDomain.min,
    baseDomain.max,
    xValues[0] ?? baseDomain.min,
    step,
    unit,
    timeZone,
    !!dropPartials
  );

  const domainMin = dropPartials
    ? buckets?.min ?? baseDomain.min
    : Math.min(isUndefined(xValues[0]) ? Infinity : xValues[0], buckets?.min ?? baseDomain.min);
  const domainMaxValue = dropPartials
    ? buckets?.max ?? baseDomain.max - baseDomain.minInterval
    : Math.max(
        isUndefined(xValues[xValues.length - 1]) ? -Infinity : xValues[xValues.length - 1],
        buckets?.max ?? baseDomain.max - baseDomain.minInterval
      );
  const domainMax = hasBars ? domainMaxValue : domainMaxValue + baseDomain.minInterval;

  return {
    extendedDomain: {
      min: domainMin,
      max: domainMax,
      minInterval: buckets?.minInterval ?? baseDomain.minInterval,
    },
    baseDomain,
  };
};

function isFullyQualified(
  xDomain: XDomain | undefined
): xDomain is { min: number; max: number; minInterval: number } {
  return Boolean(
    xDomain &&
      typeof xDomain.min === 'number' &&
      typeof xDomain.max === 'number' &&
      xDomain.minInterval
  );
}

export const XyEndzones = function ({
  baseDomain,
  extendedDomain,
  histogramMode,
  darkMode,
}: {
  baseDomain?: XDomain;
  extendedDomain?: XDomain;
  histogramMode: boolean;
  darkMode: boolean;
}) {
  return isFullyQualified(baseDomain) && isFullyQualified(extendedDomain) ? (
    <Endzones
      isFullBin={!histogramMode}
      isDarkMode={darkMode}
      domainStart={baseDomain.min}
      domainEnd={baseDomain.max}
      interval={extendedDomain.minInterval}
      domainMin={extendedDomain.min}
      domainMax={extendedDomain.max}
      hideTooltips={false}
    />
  ) : null;
};
