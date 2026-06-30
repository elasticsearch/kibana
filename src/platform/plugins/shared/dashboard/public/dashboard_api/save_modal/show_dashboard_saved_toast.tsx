/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { take } from 'rxjs';
import { i18n } from '@kbn/i18n';
import { DASHBOARD_APP_ID } from '../../../common/page_bundle_constants';
import { coreServices } from '../../services/kibana_services';
import { createDashboardEditUrl } from '../../utils/urls';

interface ShowDashboardSavedToastParams {
  /** The id returned by the save call, i.e. the dashboard that was just saved. */
  savedDashboardId: string;
  /** The dashboard title to interpolate into the toast message. */
  dashboardTitle: string;
}

/**
 * Renders the dashboard save success toast. When the user is outside the
 * Dashboard app (for example the chat sidebar or a portable dashboard in a
 * flyout), the toast also includes a "Go to dashboard" button that navigates
 * to the saved dashboard. Inside the Dashboard app the save flow already
 * places the user on the saved dashboard, so the button is omitted.
 */
export const showDashboardSavedToast = ({
  savedDashboardId,
  dashboardTitle,
}: ShowDashboardSavedToastParams): void => {
  coreServices.application.currentAppId$.pipe(take(1)).subscribe((currentAppId) => {
    const showOpenLink = currentAppId !== DASHBOARD_APP_ID;

    const toast = coreServices.notifications.toasts.addSuccess({
      title: i18n.translate('dashboard.dashboardWasSavedSuccessMessage', {
        defaultMessage: `Dashboard ''{title}'' was saved`,
        values: { title: dashboardTitle },
      }),
      ...(showOpenLink
        ? {
            actionProps: {
              primary: {
                'data-test-subj': 'dashboardSavedToastLink',
                onClick: () => {
                  coreServices.notifications.toasts.remove(toast);
                  coreServices.application.navigateToApp(DASHBOARD_APP_ID, {
                    path: `#${createDashboardEditUrl(savedDashboardId)}`,
                  });
                },
                children: i18n.translate('dashboard.savedToast.goToDashboardLink', {
                  defaultMessage: 'Go to dashboard',
                }),
              },
            },
          }
        : {}),
      className: 'eui-textBreakWord',
      'data-test-subj': 'saveDashboardSuccess',
    });
  });
};
