/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const VERSION_HISTORY_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.versionHistoryTitle',
  {
    defaultMessage: 'Version history',
  }
);

export const CLOSE_VERSION_HISTORY = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.closeVersionHistory',
  {
    defaultMessage: 'Close version history',
  }
);

export const NO_CHANGE_HISTORY_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.noChangeHistoryTitle',
  {
    defaultMessage: 'No changes have been recorded for this rule yet.',
  }
);

export const NO_CHANGE_HISTORY_BODY = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.noChangeHistoryBody',
  {
    defaultMessage: 'Subsequent edits will appear here.',
  }
);

export const CUSTOM_RULE_RESTORE_SUCCESS_TOAST = (revision: number): string =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleChangesHistory.customRuleRestoreSuccessToast',
    {
      defaultMessage: 'Rule restored from revision {revision}',
      values: { revision },
    }
  );

export const PREBUILT_RULE_RESTORE_SUCCESS_TOAST = (version: number, revision: number): string =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleChangesHistory.prebuiltRuleRestoreSuccessToast',
    {
      defaultMessage: 'Rule restored from revision {revision} with version {version}',
      values: { version, revision },
    }
  );

export const RESTORE_NO_CHANGE_TOAST = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreNoChangeToast',
  {
    defaultMessage: "Rule hasn't changed. The rule is already at this historical state.",
  }
);

export const RESTORE_ERROR_TOAST = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreErrorToast',
  {
    defaultMessage: 'Failed to restore the rule',
  }
);

export const RESTORE_CONFLICT_TOAST = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictToast',
  {
    defaultMessage: 'The rule was updated while you were on this screen.',
  }
);

export const RESTORE_CONFLICT_MODAL_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictModalTitle',
  {
    defaultMessage: 'Rule has been updated',
  }
);

export const RESTORE_CONFLICT_DELETED_RULE_MODAL_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictDeletedRuleModalTitle',
  {
    defaultMessage: 'Rule has been restored already',
  }
);

export const RESTORE_CONFLICT_MODAL_PARAGRAPH_1 = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictModalParagraph1',
  {
    defaultMessage: 'A new revision of this rule was saved after you opened this page.',
  }
);

export const RESTORE_CONFLICT_DELETED_RULE_MODAL_PARAGRAPH_1 = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictDeletedRuleModalParagraph1',
  {
    defaultMessage: 'This rule was restored by another user after you opened this page.',
  }
);

export const RESTORE_CONFLICT_MODAL_PARAGRAPH_2 = (revision: number): string =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictModalParagraph2',
    {
      defaultMessage: 'You are about to restore revision {revision}.',
      values: { revision },
    }
  );

export const RESTORE_CONFLICT_MODAL_PARAGRAPH_3 = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictModalParagraph3',
  {
    defaultMessage: 'Restoring will replace the current rule configuration.',
  }
);

export const RESTORE_CONFLICT_REVIEW_CHANGES = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictReviewChanges',
  {
    defaultMessage: 'Review changes',
  }
);

export const RESTORE_CONFLICT_RESTORE_ANYWAY = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictRestoreAnyway',
  {
    defaultMessage: 'Restore anyway',
  }
);

export const RESTORE_CONFLICT_CANCEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.restoreConflictCancel',
  {
    defaultMessage: 'Cancel',
  }
);
