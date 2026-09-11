/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ATTACK_SUMMARY = i18n.translate(
  'xpack.securitySolution.detectionEngine.attacks.attackDetails.tabs.attackSummaryTab.title',
  {
    defaultMessage: 'Attack summary',
  }
);

export const ALERTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.attacks.attackDetails.tabs.alertsTab.title',
  {
    defaultMessage: 'Alerts',
  }
);

export const SHOW_MATCHING_ALERTS_ONLY = i18n.translate(
  'xpack.securitySolution.detectionEngine.attacks.attackDetails.alertsFilteringMode.showMatchingAlertsOnlyLabel',
  {
    defaultMessage: 'Show matching alerts only',
  }
);

export const FILTERED_OUT_ALERTS_HIGHLIGHT_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.attacks.attackDetails.alertsFilteringMode.filteredOutHighlightDescription',
  {
    defaultMessage:
      'This filter applies to attacks, not individual alerts. {highlightedGreyRows} may not include the filtered field.',
    values: {
      highlightedGreyRows: '<strong>Grey rows</strong>',
    },
  }
);

export const INVESTIGATE_IN_TIMELINE = i18n.translate(
  'xpack.securitySolution.detectionEngine.attacks.attackDetails.tabs.attackSummaryTab.investigateInTimelineButtonLabel',
  {
    defaultMessage: 'Investigate in Timeline',
  }
);
