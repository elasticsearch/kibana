/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { AggTypeConfig } from '../agg_type';
import { AggType } from '../agg_type';
import type { AggParamType } from '../param_types/agg';
import type { AggConfig } from '../agg_config';
import { METRIC_TYPES } from './metric_agg_types';
import type { FieldTypes } from '../param_types';
import { BaseParamType } from '../param_types';
import { AggGroupNames } from '../agg_groups';
import { createMetricFilter } from './lib/create_filter';

export interface IMetricAggConfig extends AggConfig {
  type: InstanceType<typeof MetricAggType>;
}

export interface MetricAggParam<TMetricAggConfig extends AggConfig>
  extends AggParamType<TMetricAggConfig> {
  filterFieldTypes?: FieldTypes;
  onlyAggregatable?: boolean;
  scriptable?: boolean;
}

const metricType = 'metrics';

interface MetricAggTypeConfig<TMetricAggConfig extends AggConfig>
  extends AggTypeConfig<TMetricAggConfig, MetricAggParam<TMetricAggConfig>> {
  isScalable?: () => boolean;
  subtype?: string;
  enableEmptyAsNull?: boolean;
}

// TODO need to make a more explicit interface for this
export type IMetricAggType = MetricAggType;

export class MetricAggType<TMetricAggConfig extends AggConfig = IMetricAggConfig> extends AggType<
  TMetricAggConfig,
  MetricAggParam<TMetricAggConfig>
> {
  subtype: string;
  isScalable: () => boolean;
  type = metricType;

  getKey = () => {};

  constructor(config: MetricAggTypeConfig<TMetricAggConfig>) {
    if (!config.createFilter) {
      config.createFilter = createMetricFilter;
    }
    super(config);

    this.params.push(
      new BaseParamType({
        name: 'timeShift',
        type: 'string',
        write: () => {},
      }) as MetricAggParam<TMetricAggConfig>
    );

    if (config.enableEmptyAsNull) {
      this.params.push(
        new BaseParamType({
          name: 'emptyAsNull',
          type: 'boolean',
          default: false,
          write: () => {},
        }) as MetricAggParam<TMetricAggConfig>
      );
    }

    this.getValue =
      config.getValue ||
      ((agg, bucket) => {
        // Metric types where an empty set equals `zero`
        const isSettableToZero = [
          METRIC_TYPES.CARDINALITY,
          METRIC_TYPES.VALUE_COUNT,
          METRIC_TYPES.SUM,
        ].includes(agg.type.name as METRIC_TYPES);

        // Return proper values when no buckets are present
        // `Count` handles empty sets properly
        if (!bucket[agg.id] && isSettableToZero && !agg.params.emptyAsNull) return 0;

        const val = bucket[agg.id] && bucket[agg.id].value;
        if (val === 0 && agg.params.emptyAsNull) {
          return null;
        }
        return val;
      });

    this.subtype =
      config.subtype ||
      i18n.translate('data.search.aggs.metrics.metricAggregationsSubtypeTitle', {
        defaultMessage: 'Metric Aggregations',
      });

    this.isScalable = config.isScalable || (() => false);

    // split at this point if there are time shifts and this is the first metric
    this.splitForTimeShift = (agg, aggs) =>
      aggs.hasTimeShifts() &&
      aggs.byType(AggGroupNames.Metrics)[0] === agg &&
      !aggs
        .byType(AggGroupNames.Buckets)
        .some((bucketAgg) => bucketAgg.type.splitForTimeShift(bucketAgg, aggs));
  }
}

export function isMetricAggType(aggConfig: unknown): aggConfig is MetricAggType {
  if (typeof aggConfig !== 'object' || aggConfig === null) {
    return false;
  }
  if (!('type' in aggConfig)) {
    return false;
  }
  return aggConfig.type === metricType;
}
