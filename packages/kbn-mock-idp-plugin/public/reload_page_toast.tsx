/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToastInput } from '@kbn/core-notifications-browser';
import type { AuthenticatedUser } from '@kbn/security-plugin-types-common';

export const DATA_TEST_SUBJ_PAGE_RELOAD_BUTTON = 'pageReloadButton';

/**
 * Utility function for returning a {@link ToastInput} for displaying a prompt for reloading the page.
 * @returns A toast.
 */
export const createReloadPageToast = (options: {
  user: Pick<AuthenticatedUser, 'roles'>;
}): ToastInput => {
  return {
    title: `Your role has been set to '${options.user.roles.join(`', '`)}'.`,
    actionProps: {
      primary: {
        children: 'Reload page',
        onClick: () => window.location.reload(),
        'data-test-subj': DATA_TEST_SUBJ_PAGE_RELOAD_BUTTON,
      },
    },
    color: 'success',
    toastLifeTimeMs: 0x7fffffff, // Do not auto-hide toast since page is in an unknown state
  };
};
