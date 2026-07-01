/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { get } from 'lodash';
import { i18n } from '@kbn/i18n';
import { MetricAggType } from './metric_agg_type';
import { aggStdDeviationFnName } from './std_deviation_fn';
import { METRIC_TYPES } from './metric_agg_types';
import { getResponseAggConfigClass } from './lib/get_response_agg_config_class';
import type { IResponseAggConfig } from './lib/get_response_agg_config_class';
import { KBN_FIELD_TYPES } from '../../..';
import type { BaseAggParams } from '../types';

export interface AggParamsStdDeviation extends BaseAggParams {
  field: string;
  showBounds?: boolean;
}

interface ValProp {
  valProp: string[];
  title: string;
}

export interface IStdDevAggConfig extends IResponseAggConfig {
  keyedDetails: (customLabel: string, fieldDisplayName?: string) => Record<string, ValProp>;
  valProp: () => string[];
}

const responseAggConfigProps = {
  valProp(this: IStdDevAggConfig) {
    const customLabel = this.getParam('customLabel');
    const details = this.keyedDetails(customLabel)[this.key];

    return details.valProp;
  },
  makeLabel(this: IStdDevAggConfig) {
    const fieldDisplayName = this.getFieldDisplayName();
    const customLabel = this.getParam('customLabel');
    const details = this.keyedDetails(customLabel, fieldDisplayName);

    return get(details, [this.key, 'title']);
  },
  keyedDetails(this: IStdDevAggConfig, customLabel: string, fieldDisplayName: string) {
    const label =
      customLabel ||
      i18n.translate('data.search.aggs.metrics.standardDeviation.keyDetailsLabel', {
        defaultMessage: 'Standard Deviation of {fieldDisplayName}',
        values: { fieldDisplayName },
      });

    return {
      std_lower: {
        valProp: ['std_deviation_bounds', 'lower'],
        title: i18n.translate('data.search.aggs.metrics.standardDeviation.lowerKeyDetailsTitle', {
          defaultMessage: 'Lower {label}',
          values: { label },
        }),
      },
      std_upper: {
        valProp: ['std_deviation_bounds', 'upper'],
        title: i18n.translate('data.search.aggs.metrics.standardDeviation.upperKeyDetailsTitle', {
          defaultMessage: 'Upper {label}',
          values: { label },
        }),
      },
    };
  },
};

export const getStdDeviationMetricAgg = () => {
  return new MetricAggType<IStdDevAggConfig>({
    name: METRIC_TYPES.STD_DEV,
    expressionName: aggStdDeviationFnName,
    dslName: 'extended_stats',
    title: i18n.translate('data.search.aggs.metrics.standardDeviationTitle', {
      defaultMessage: 'Standard Deviation',
    }),
    makeLabel(agg) {
      return i18n.translate('data.search.aggs.metrics.standardDeviationLabel', {
        defaultMessage: 'Standard Deviation of {field}',
        values: { field: agg.getFieldDisplayName() },
      });
    },
    params: [
      {
        name: 'field',
        type: 'field',
        filterFieldTypes: KBN_FIELD_TYPES.NUMBER,
      },
      {
        name: 'showBounds',
        type: 'boolean',
        write: () => {},
        shouldShow: () => false,
      },
    ],

    getResponseAggs(agg) {
      const showBounds = agg.getParam('showBounds');
      if (showBounds === false) {
        return [agg];
      }
      const ValueAggConfig = getResponseAggConfigClass(agg, responseAggConfigProps);

      return [
        new ValueAggConfig('std_lower') as IStdDevAggConfig,
        new ValueAggConfig('std_upper') as IStdDevAggConfig,
      ];
    },

    getValueBucketPath(aggConfig) {
      return `${aggConfig.id}.std_deviation`;
    },

    getValue(agg, bucket) {
      const showBounds = agg.getParam('showBounds');
      if (showBounds === false) {
        return bucket[agg.id]?.std_deviation;
      }
      return get(bucket[agg.parentId], agg.valProp());
    },
  });
};
