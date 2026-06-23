/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const HISTORY_FETCH_ERROR = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.actions.historyFetchError',
  {
    defaultMessage: 'Failed to fetch rule change history',
  }
);

export const CONNECTORS_FETCH_ERROR = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.actions.connectorsFetchError',
  {
    defaultMessage: 'Failed to fetch connectors',
  }
);

export const CONNECTOR_TYPES_FETCH_ERROR = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.actions.connectorTypesFetchError',
  {
    defaultMessage: 'Failed to fetch connector types',
  }
);

export const ACTIONS_FETCH_ERROR_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.actions.actionsFetchErrorDescription',
  {
    defaultMessage: 'Viewing actions is not available',
  }
);

export const FETCH_PREBUILT_RULE_BASE_VERSION_ERROR = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.fetchPrebuiltRuleBaseVersion',
  {
    defaultMessage: 'Failed to fetch Elastic rule version',
  }
);
