/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { OBS_ALERTING_FEATURES } from '@kbn/rule-data-utils';
import type { KibanaFeatureConfig } from '@kbn/features-plugin/common';
import { observabilityAlertsFeatureId } from '../../common';

export const getObservabilityAlertsFeature = (): KibanaFeatureConfig => {
  return {
    id: observabilityAlertsFeatureId,
    name: i18n.translate('xpack.observability.featureRegistry.observabilityAlertsTitle', {
      defaultMessage: 'Observability Alerts',
    }),
    order: 1300,
    category: DEFAULT_APP_CATEGORIES.observability,
    app: [],
    catalogue: [],
    alerting: OBS_ALERTING_FEATURES,
    privileges: {
      all: {
        app: [],
        catalogue: [],
        savedObject: { all: [], read: [] },
        alerting: {
          alert: { all: OBS_ALERTING_FEATURES },
          rule: { mute_alerts: OBS_ALERTING_FEATURES },
        },
        api: ['rac'],
        ui: ['show', 'write'],
      },
      read: {
        app: [],
        catalogue: [],
        savedObject: { all: [], read: [] },
        alerting: {
          alert: { read: OBS_ALERTING_FEATURES },
        },
        api: ['rac'],
        ui: ['show'],
      },
    },
  };
};
