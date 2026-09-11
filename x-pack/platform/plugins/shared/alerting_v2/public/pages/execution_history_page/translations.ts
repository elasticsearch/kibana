/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

/** --- Policies table columns --- */
export const COLUMN_TIMESTAMP = i18n.translate(
  'xpack.alertingV2.executionHistory.columns.timestamp',
  {
    defaultMessage: 'Timestamp',
  }
);

export const COLUMN_POLICY = i18n.translate('xpack.alertingV2.executionHistory.columns.policy', {
  defaultMessage: 'Policy',
});

export const COLUMN_OUTCOME = i18n.translate('xpack.alertingV2.executionHistory.columns.outcome', {
  defaultMessage: 'Outcome',
});

export const COLUMN_RULES = i18n.translate('xpack.alertingV2.executionHistory.columns.rules', {
  defaultMessage: 'Rules',
});

export const COLUMN_EPISODES = i18n.translate(
  'xpack.alertingV2.executionHistory.columns.episodes',
  {
    defaultMessage: 'Episodes',
  }
);

export const COLUMN_ACTION_GROUPS = i18n.translate(
  'xpack.alertingV2.executionHistory.columns.actionGroups',
  {
    defaultMessage: 'Action groups',
  }
);

export const COLUMN_WORKFLOWS = i18n.translate(
  'xpack.alertingV2.executionHistory.columns.workflows',
  {
    defaultMessage: 'Workflows',
  }
);

/** --- Rules table columns --- */
export const RULES_COLUMN_RULE = i18n.translate(
  'xpack.alertingV2.executionHistory.rulesTab.columns.rule',
  {
    defaultMessage: 'Rule',
  }
);

export const RULES_COLUMN_DURATION = i18n.translate(
  'xpack.alertingV2.executionHistory.rulesTab.columns.duration',
  {
    defaultMessage: 'Duration',
  }
);

export const RULES_COLUMN_RESPONSE = i18n.translate(
  'xpack.alertingV2.executionHistory.rulesTab.columns.response',
  {
    defaultMessage: 'Response',
  }
);

export const RULES_COLUMN_MESSAGE = i18n.translate(
  'xpack.alertingV2.executionHistory.rulesTab.columns.message',
  {
    defaultMessage: 'Message',
  }
);

/** --- Outcome badge labels --- */
export const OUTCOME_DISPATCHED = i18n.translate(
  'xpack.alertingV2.executionHistory.table.outcome.dispatched',
  { defaultMessage: 'Dispatched' }
);

export const OUTCOME_THROTTLED = i18n.translate(
  'xpack.alertingV2.executionHistory.table.outcome.throttled',
  { defaultMessage: 'Throttled' }
);

export const OUTCOME_FAILED = i18n.translate(
  'xpack.alertingV2.executionHistory.table.outcome.failed',
  { defaultMessage: 'Failed' }
);
