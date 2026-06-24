/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ALERT_DISPLAY_NAME = i18n.translate('xpack.cases.attachments.stackAlert.displayName', {
  defaultMessage: 'Alerts',
});

export const ALERT_AVATAR_ARIA_LABEL = i18n.translate(
  'xpack.cases.attachments.stackAlert.avatarAriaLabel',
  { defaultMessage: 'alert' }
);

export const ALERT_COMMENT_LABEL_TITLE = i18n.translate(
  'xpack.cases.attachments.stackAlert.alertCommentLabelTitle',
  {
    defaultMessage: 'added an alert from',
  }
);

export const MULTIPLE_ALERTS_COMMENT_LABEL_TITLE = (totalAlerts: number) =>
  i18n.translate('xpack.cases.attachments.stackAlert.generatedAlertCommentLabelTitle', {
    values: { totalAlerts },
    defaultMessage: 'added {totalAlerts} alerts from',
  });

export const UNKNOWN_RULE = i18n.translate('xpack.cases.attachments.stackAlert.unknownRule.label', {
  defaultMessage: 'Unknown rule',
});

export const REMOVED_ALERT_LABEL_TITLE = i18n.translate(
  'xpack.cases.attachments.stackAlert.removedAlertLabelTitle',
  { defaultMessage: 'removed alert' }
);

export const REMOVED_ALERTS_LABEL_TITLE = (totalAlerts: number) =>
  i18n.translate('xpack.cases.attachments.stackAlert.removedAlertsLabelTitle', {
    defaultMessage:
      'removed {totalAlerts, plural, =1 {one} other {{totalAlerts}}} {totalAlerts, plural, =1 {alert} other {alerts}}',
    values: { totalAlerts },
  });

export const DELETE_ALERTS_SUCCESS_TITLE = (totalAlerts: number) =>
  i18n.translate('xpack.cases.attachments.stackAlert.deleteAlertsSuccessTitle', {
    defaultMessage:
      'Deleted {totalAlerts, plural, =1 {one} other {{totalAlerts}}} {totalAlerts, plural, =1 {alert} other {alerts}}',
    values: { totalAlerts },
  });

export const SHOW_ALERT_TOOLTIP = i18n.translate(
  'xpack.cases.attachments.stackAlert.showAlertTooltip',
  {
    defaultMessage: 'Show alert details',
  }
);

export const ALERTS_EMPTY_DESCRIPTION = i18n.translate(
  'xpack.cases.attachments.stackAlert.emptyDescription',
  { defaultMessage: 'No alerts have been added to this case.' }
);
