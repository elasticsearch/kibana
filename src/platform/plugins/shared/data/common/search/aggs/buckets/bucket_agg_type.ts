/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type moment from 'moment';
import type { IAggConfig } from '../agg_config';
import type { FilterFieldFn, GenericBucket, IAggConfigs } from '../../..';
import type { AggTypeConfig } from '../agg_type';
import { AggType } from '../agg_type';
import type { AggParamType } from '../param_types/agg';
import type { FieldTypes } from '../param_types/field';

export interface IBucketAggConfig extends IAggConfig {
  type: InstanceType<typeof BucketAggType>;
}

export interface BucketAggParam<TBucketAggConfig extends IAggConfig>
  extends AggParamType<TBucketAggConfig> {
  scriptable?: boolean;
  filterFieldTypes?: FieldTypes;
  onlyAggregatable?: boolean;

  /**
   * Filter available fields by passing filter fn on a {@link DataViewField}
   * If used, takes precedence over filterFieldTypes and other filter params
   */
  filterField?: FilterFieldFn;
}

const bucketType = 'buckets';

interface BucketAggTypeConfig<TBucketAggConfig extends IAggConfig>
  extends AggTypeConfig<TBucketAggConfig, BucketAggParam<TBucketAggConfig>> {
  getKey?: (bucket: any, key: any, agg: IAggConfig) => any;
  getShiftedKey?: (
    agg: TBucketAggConfig,
    key: string | number,
    timeShift: moment.Duration
  ) => string | number;
  orderBuckets?(agg: TBucketAggConfig, a: GenericBucket, b: GenericBucket): number;
  splitForTimeShift?(agg: TBucketAggConfig, aggs: IAggConfigs): boolean;
  getTimeShiftInterval?(agg: TBucketAggConfig): undefined | moment.Duration;
}

export class BucketAggType<TBucketAggConfig extends IAggConfig = IBucketAggConfig> extends AggType<
  TBucketAggConfig,
  BucketAggParam<TBucketAggConfig>
> {
  getKey: (bucket: any, key: any, agg: TBucketAggConfig) => any;
  type = bucketType;

  getShiftedKey(
    agg: TBucketAggConfig,
    key: string | number,
    timeShift: moment.Duration
  ): string | number {
    return key;
  }

  getTimeShiftInterval(agg: TBucketAggConfig): undefined | moment.Duration {
    return undefined;
  }

  orderBuckets(agg: TBucketAggConfig, a: GenericBucket, b: GenericBucket): number {
    return Number(a.key) - Number(b.key);
  }

  constructor(config: BucketAggTypeConfig<TBucketAggConfig>) {
    super(config);

    this.getKey =
      config.getKey ||
      ((bucket, key) => {
        return key || bucket.key;
      });

    if (config.getShiftedKey) {
      this.getShiftedKey = config.getShiftedKey;
    }

    if (config.orderBuckets) {
      this.orderBuckets = config.orderBuckets;
    }

    if (config.getTimeShiftInterval) {
      this.getTimeShiftInterval = config.getTimeShiftInterval;
    }

    if (config.splitForTimeShift) {
      this.splitForTimeShift = config.splitForTimeShift;
    }
  }
}

export function isBucketAggType(aggConfig: unknown): aggConfig is BucketAggType {
  if (typeof aggConfig !== 'object' || aggConfig === null) {
    return false;
  }
  if (!('type' in aggConfig)) {
    return false;
  }
  return aggConfig.type === bucketType;
}
