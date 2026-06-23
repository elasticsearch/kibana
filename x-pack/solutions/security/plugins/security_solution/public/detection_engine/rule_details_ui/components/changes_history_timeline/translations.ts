/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const TIMELINE_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.timelineAriaLabel',
  {
    defaultMessage: 'Rule change history timeline',
  }
);

export const N_CHANGES = (count: number): string =>
  i18n.translate('xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.nChanges', {
    defaultMessage: '{count, plural, one {# change} other {# changes}}',
    values: { count },
  });

export const ACTION_LABEL_ENABLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelEnabled',
  { defaultMessage: 'Enabled the rule' }
);

export const ACTION_LABEL_DISABLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelDisabled',
  { defaultMessage: 'Disabled the rule' }
);

export const ACTION_LABEL_SNOOZED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelSnoozed',
  { defaultMessage: 'Snoozed notifications' }
);

export const ACTION_LABEL_UNSNOOZED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelUnsnoozed',
  { defaultMessage: 'Unsnoozed notifications' }
);

export const ACTION_LABEL_API_KEY_UPDATED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelApiKeyUpdated',
  { defaultMessage: 'Updated API key' }
);

export const ACTION_LABEL_CREATED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelCreated',
  { defaultMessage: 'Created the rule' }
);

export const ACTION_LABEL_DELETED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelDeleted',
  { defaultMessage: 'Deleted the rule' }
);

export const ACTION_LABEL_INSTALLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelInstalled',
  { defaultMessage: 'Installed the rule' }
);

export const ACTION_LABEL_UPGRADED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelUpgraded',
  { defaultMessage: 'Upgraded the rule' }
);

export const ACTION_LABEL_DUPLICATED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelDuplicated',
  { defaultMessage: 'Duplicated the rule' }
);

export const ACTION_LABEL_IMPORTED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelImported',
  { defaultMessage: 'Imported the rule' }
);

export const ACTION_LABEL_REVERTED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelReverted',
  { defaultMessage: 'Reverted the rule' }
);

export const SYSTEM_USER_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.systemUserLabel',
  {
    defaultMessage: 'System',
  }
);

export const NO_CHANGE_HISTORY_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.emptyPromptTitle',
  {
    defaultMessage: 'No change history yet',
  }
);

export const NO_CHANGE_HISTORY_BODY = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.emptyPromptBody',
  {
    defaultMessage:
      'No changes have been recorded for this rule yet. Subsequent edits will appear here.',
  }
);

export const LOADING_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.loadingLabel',
  {
    defaultMessage: 'Loading change history',
  }
);
