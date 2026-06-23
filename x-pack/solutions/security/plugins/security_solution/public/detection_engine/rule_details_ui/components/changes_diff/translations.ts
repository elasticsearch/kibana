/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const NOTHING_TO_COMPARE_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.nothingToCompareTitle',
  {
    defaultMessage: 'Nothing to compare',
  }
);

export const NO_VISIBLE_CHANGES_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.noVisibleChangesTitle',
  {
    defaultMessage: 'No visible field changes',
  }
);

export const NO_DIFF_AVAILABLE_CALLOUT = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleChangesHistory.noDiffAvailableCallout',
  {
    defaultMessage:
      'Change tracking was activated while this rule already existed. Because no prior state was captured, a before/after comparison is unavailable. The complete rule state at the time of this update is shown instead.',
  }
);
