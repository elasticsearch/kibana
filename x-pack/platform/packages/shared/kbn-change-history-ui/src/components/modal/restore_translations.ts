/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const RESTORE_BUTTON_LABEL = i18n.translate('xpack.changeHistoryUi.restore.buttonLabel', {
  defaultMessage: 'Restore',
});

export const RESTORE_CONFIRM_TITLE = (version?: number): string =>
  version != null
    ? i18n.translate('xpack.changeHistoryUi.restore.confirmTitleWithVersion', {
        defaultMessage: 'Restore version {version}?',
        values: { version },
      })
    : i18n.translate('xpack.changeHistoryUi.restore.confirmTitle', {
        defaultMessage: 'Restore this version?',
      });

export const RESTORE_CONFIRM_BODY = (version?: number): string =>
  version != null
    ? i18n.translate('xpack.changeHistoryUi.restore.confirmBodyWithVersion', {
        defaultMessage:
          'This creates a new version from v{version}. Your change history is preserved.',
        values: { version },
      })
    : i18n.translate('xpack.changeHistoryUi.restore.confirmBody', {
        defaultMessage:
          'This creates a new version from the selected snapshot. Your change history is preserved.',
      });

export const RESTORE_CONFIRM_BUTTON = i18n.translate(
  'xpack.changeHistoryUi.restore.confirmButton',
  {
    defaultMessage: 'Restore',
  }
);

export const RESTORE_CANCEL_BUTTON = i18n.translate('xpack.changeHistoryUi.restore.cancelButton', {
  defaultMessage: 'Cancel',
});
