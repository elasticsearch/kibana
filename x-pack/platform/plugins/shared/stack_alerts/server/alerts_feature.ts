/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { KibanaFeatureConfig } from '@kbn/features-plugin/common';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { STACK_ALERTS_ONLY_FEATURE_ID } from '@kbn/rule-data-utils';
import { alertingFeatures } from './feature';

export const STACK_ALERTS_ONLY_FEATURE: KibanaFeatureConfig = {
  id: STACK_ALERTS_ONLY_FEATURE_ID,
  name: i18n.translate('xpack.stackAlerts.featureRegistry.stackAlertsOnlyFeatureName', {
    defaultMessage: 'Stack Alerts',
  }),
  order: 2001,
  category: DEFAULT_APP_CATEGORIES.management,
  app: [],
  catalogue: [],
  management: {
    insightsAndAlerting: ['triggersActions'],
  },
  alerting: alertingFeatures,
  privileges: {
    all: {
      app: [],
      catalogue: [],
      management: {
        insightsAndAlerting: ['triggersActions'],
      },
      alerting: {
        alert: { all: alertingFeatures },
        rule: { mute_alerts: alertingFeatures },
      },
      savedObject: { all: [], read: [] },
      api: ['rac'],
      ui: ['show'],
    },
    read: {
      app: [],
      catalogue: [],
      management: {
        insightsAndAlerting: ['triggersActions'],
      },
      alerting: {
        alert: { read: alertingFeatures },
      },
      savedObject: { all: [], read: [] },
      api: ['rac'],
      ui: ['show'],
    },
  },
};
