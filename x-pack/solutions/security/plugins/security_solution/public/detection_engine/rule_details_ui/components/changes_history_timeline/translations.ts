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

export const RULE_REVISION_BADGE = (revision: number): string =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.ruleRevisionBadge',
    { defaultMessage: 'R{revision}', values: { revision } }
  );

export const RULE_VERSION_BADGE = (version: number): string =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.ruleVersionBadge',
    { defaultMessage: 'V{version}', values: { version } }
  );

export const ACTION_LABEL_ENABLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelEnabled',
  { defaultMessage: 'Enabled' }
);

export const ACTION_LABEL_DISABLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelDisabled',
  { defaultMessage: 'Disabled' }
);

export const ACTION_LABEL_SNOOZED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelSnoozed',
  { defaultMessage: 'Snoozed' }
);

export const ACTION_LABEL_UNSNOOZED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelUnsnoozed',
  { defaultMessage: 'Unsnoozed' }
);

export const ACTION_LABEL_API_KEY_UPDATED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelApiKeyUpdated',
  {
    defaultMessage: 'Updated API key',
  }
);

export const ACTION_LABEL_CREATED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelCreated',
  {
    defaultMessage: 'Created',
  }
);

export const ACTION_LABEL_DELETED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelDeleted',
  {
    defaultMessage: 'Deleted',
  }
);

export const ACTION_LABEL_INSTALLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelInstalled',
  {
    defaultMessage: 'Installed',
  }
);

export const ACTION_LABEL_UPGRADED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelUpdated',
  {
    defaultMessage: 'Updated',
  }
);

export const ACTION_LABEL_DUPLICATED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelDuplicated',
  {
    defaultMessage: 'Duplicated',
  }
);

export const ACTION_LABEL_IMPORTED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelImported',
  {
    defaultMessage: 'Imported',
  }
);

export const ACTION_LABEL_REVERTED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelReverted',
  {
    defaultMessage: 'Reverted',
  }
);

export const ACTION_LABEL_EDITED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelEdited',
  {
    defaultMessage: 'Edited',
  }
);

export const ACTION_LABEL_RESTORED_FROM_HISTORY = (restoredRevision?: number): string =>
  restoredRevision != null
    ? i18n.translate(
        'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelRestoredFromHistory',
        {
          defaultMessage: 'Restored R{restoredRevision}',
          values: {
            restoredRevision,
          },
        }
      )
    : i18n.translate(
        'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.actionLabelRestoredFromHistoryUnknown',
        {
          defaultMessage: 'Restored',
        }
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

export const RESTORE_ACTIONS_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.restoreActionsLabel',
  {
    defaultMessage: 'Restore actions',
  }
);

export const RESTORE_REVISION_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.restoreRevisionLabel',
  {
    defaultMessage: 'Restore this revision',
  }
);

export const RESTORING_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleChangeHistory.restoringLabel',
  {
    defaultMessage: 'Restoring...',
  }
);
