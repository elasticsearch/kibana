/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ALERT_DISPLAY_NAME = i18n.translate('xpack.securitySolution.cases.alert.displayName', {
  defaultMessage: 'Alerts',
});

export const ALERT_AVATAR_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.cases.alertAttachment.avatarAriaLabel',
  { defaultMessage: 'alert' }
);

export const ALERT_COMMENT_LABEL_TITLE = i18n.translate(
  'xpack.securitySolution.cases.alertAttachment.alertCommentLabelTitle',
  { defaultMessage: 'added an alert from' }
);

export const MULTIPLE_ALERTS_COMMENT_LABEL_TITLE = (totalAlerts: number) =>
  i18n.translate('xpack.securitySolution.cases.alertAttachment.multipleAlertsCommentLabelTitle', {
    defaultMessage: 'added {totalAlerts} alerts from',
    values: { totalAlerts },
  });

export const UNKNOWN_RULE = i18n.translate(
  'xpack.securitySolution.cases.alertAttachment.unknownRule',
  { defaultMessage: 'Unknown rule' }
);

export const REMOVED_ALERT_LABEL_TITLE = i18n.translate(
  'xpack.securitySolution.cases.alertAttachment.removedAlertLabelTitle',
  { defaultMessage: 'removed alert' }
);

export const REMOVED_ALERTS_LABEL_TITLE = (totalAlerts: number) =>
  i18n.translate('xpack.securitySolution.cases.alertAttachment.removedAlertsLabelTitle', {
    defaultMessage: 'removed {totalAlerts, plural, =1 {alert} other {{totalAlerts} alerts}}',
    values: { totalAlerts },
  });

export const DELETE_ALERTS_SUCCESS_TITLE = (totalAlerts: number) =>
  i18n.translate('xpack.securitySolution.cases.alertAttachment.deleteAlertsSuccessTitle', {
    defaultMessage:
      'Deleted {totalAlerts, plural, =1 {one} other {{totalAlerts}}} {totalAlerts, plural, =1 {alert} other {alerts}}',
    values: { totalAlerts },
  });

export const SHOW_ALERT_TOOLTIP = i18n.translate(
  'xpack.securitySolution.cases.alertAttachment.showAlertTooltip',
  { defaultMessage: 'Show alert details' }
);

export const ALERTS_EMPTY_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.cases.alertAttachment.alertsEmptyDescription',
  { defaultMessage: 'No alerts have been added to this case.' }
);
