/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { ToastInput } from '@kbn/core-notifications-browser';

export const DATA_TEST_SUBJ_PAGE_RELOAD_BUTTON = 'pageReloadButton';

/**
 * Utility function for returning a {@link ToastInput} for displaying a prompt for reloading the page.
 * @returns A toast.
 */
export const reloadPageToast = (): ToastInput => {
  return {
    title: i18n.translate('management.settings.form.requiresPageReloadToastDescription', {
      defaultMessage: 'One or more settings require you to reload the page to take effect.',
    }),
    actionProps: {
      primary: {
        children: i18n.translate('management.settings.form.requiresPageReloadToastButtonLabel', {
          defaultMessage: 'Reload page',
        }),
        onClick: () => window.location.reload(),
        'data-test-subj': DATA_TEST_SUBJ_PAGE_RELOAD_BUTTON,
        autoFocus: true,
      },
    },
    color: 'success',
    toastLifeTimeMs: 15000,
  };
};
