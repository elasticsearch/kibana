/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { KibanaFeatureConfig } from '@kbn/features-plugin/common';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { TRANSFORM_RULE_TYPE } from '@kbn/transform-plugin/common';
import {
  ML_ANOMALY_DETECTION_RULE_TYPE_ID,
  OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
  STACK_ALERTS_FEATURE_ID,
} from '@kbn/rule-data-utils';
import { ES_QUERY_ID as ElasticsearchQuery } from '@kbn/rule-data-utils';
import { ALERTING_FEATURE_ID } from '@kbn/alerting-plugin/common';
import { ID as IndexThreshold } from './rule_types/index_threshold/rule_type';
import { GEO_CONTAINMENT_ID as GeoContainment } from './rule_types/geo_containment';
import { ID as Webhook } from './rule_types/webhook/rule_type';

const TransformHealth = TRANSFORM_RULE_TYPE.TRANSFORM_HEALTH;
const DISCOVER_CONSUMER = 'discover';

const basicAlertingFeatures = [IndexThreshold, GeoContainment, TransformHealth, Webhook].map(
  (ruleTypeId) => ({
    ruleTypeId,
    consumers: [STACK_ALERTS_FEATURE_ID, ALERTING_FEATURE_ID],
  })
);

/**
 * We need to add the discover consumer
 * to support legacy ES rules that were
 * created with the discover consumer.
 *
 * Issue: https://github.com/elastic/kibana/issues/184595
 */
const esQueryAlertingFeature = {
  ruleTypeId: ElasticsearchQuery,
  consumers: [STACK_ALERTS_FEATURE_ID, ALERTING_FEATURE_ID, DISCOVER_CONSUMER],
};

/**
 * Only the stackAlerts consumer is valid
 * for the stackAlerts feature ID for the
 * xpack.ml.anomaly_detection_alert rule type.
 */
const mlAnomalyDetectionAlertingFeature = {
  ruleTypeId: ML_ANOMALY_DETECTION_RULE_TYPE_ID,
  consumers: [STACK_ALERTS_FEATURE_ID],
};

/**
 * Only the stackAlerts consumer is valid
 * for the stackAlerts feature ID for the
 * observability.rules.custom_threshold rule type.
 */
const observabilityThresholdAlertingFeature = {
  ruleTypeId: OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
  consumers: [STACK_ALERTS_FEATURE_ID],
};

const alertingFeatures = [
  ...basicAlertingFeatures,
  esQueryAlertingFeature,
  mlAnomalyDetectionAlertingFeature,
  observabilityThresholdAlertingFeature,
];

export const BUILT_IN_ALERTS_FEATURE: KibanaFeatureConfig = {
  id: STACK_ALERTS_FEATURE_ID,
  name: i18n.translate('xpack.stackAlerts.featureRegistry.actionsFeatureName', {
    defaultMessage: 'Stack Rules',
  }),
  app: [],
  category: DEFAULT_APP_CATEGORIES.management,
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
        rule: {
          all: alertingFeatures,
          enable: alertingFeatures,
          manual_run: alertingFeatures,
          manage_rule_settings: alertingFeatures,
        },
        alert: {
          all: alertingFeatures,
        },
      },
      savedObject: {
        all: [],
        read: [],
      },
      api: ['rac'],
      ui: [],
    },
    read: {
      app: [],
      catalogue: [],
      management: {
        insightsAndAlerting: ['triggersActions'],
      },
      alerting: {
        rule: {
          read: alertingFeatures,
        },
        alert: {
          read: alertingFeatures,
        },
      },
      savedObject: {
        all: [],
        read: [],
      },
      api: ['rac'],
      ui: [],
    },
  },
};
