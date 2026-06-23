/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import { schema } from '@kbn/config-schema';
import {
  ANOMALY_DETECTION_DEFAULT_TIME_RANGE,
  ANOMALY_DETECTION_ENABLE_TIME_RANGE,
  DEFAULT_AD_RESULTS_TIME_FILTER,
  DEFAULT_ENABLE_AD_RESULTS_TIME_FILTER,
} from '../../common/constants/settings';

export function registerKibanaSettings(coreSetup: CoreSetup) {
  coreSetup.uiSettings.register({
    [ANOMALY_DETECTION_ENABLE_TIME_RANGE]: {
      name: i18n.translate('xpack.ml.advancedSettings.enableAnomalyDetectionDefaultTimeRangeName', {
        defaultMessage: 'Enable time filter defaults for anomaly detection results',
      }),
      value: DEFAULT_ENABLE_AD_RESULTS_TIME_FILTER,
      schema: schema.boolean(),
      description: i18n.translate(
        'xpack.ml.advancedSettings.enableAnomalyDetectionDefaultTimeRangeDesc',
        {
          defaultMessage:
            'Use the default time filter in the Single Metric Viewer and Anomaly Explorer. If not enabled, the results for the full time range of the job are displayed.',
        }
      ),
      category: ['machineLearning'],
    },
    [ANOMALY_DETECTION_DEFAULT_TIME_RANGE]: {
      name: i18n.translate('xpack.ml.advancedSettings.anomalyDetectionDefaultTimeRangeName', {
        defaultMessage: 'Time filter defaults for anomaly detection results',
      }),
      type: 'json',
      value: JSON.stringify(DEFAULT_AD_RESULTS_TIME_FILTER, null, 2),
      description: i18n.translate(
        'xpack.ml.advancedSettings.anomalyDetectionDefaultTimeRangeDesc',
        {
          defaultMessage:
            'The time filter selection to use when viewing anomaly detection job results.',
        }
      ),
      schema: schema.object({
        from: schema.string({ maxLength: 10000 }),
        to: schema.string({ maxLength: 10000 }),
      }),
      requiresPageReload: true,
      category: ['machineLearning'],
    },
  });
}
