/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of, type Observable } from 'rxjs';
import { DASHBOARD_APP_ID } from '../../../common/page_bundle_constants';
import { coreServices } from '../../services/kibana_services';
import { showDashboardSavedToast } from './show_dashboard_saved_toast';

const setCurrentAppId = (appId: string | undefined) => {
  (coreServices.application as { currentAppId$: Observable<string | undefined> }).currentAppId$ =
    of<string | undefined>(appId);
};

const getLastToastInput = () => {
  const calls = (coreServices.notifications.toasts.addSuccess as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as {
    title: string;
    actionProps?: {
      primary?: { onClick: () => void; children: string; 'data-test-subj'?: string };
    };
  };
};

describe('showDashboardSavedToast', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setCurrentAppId(DASHBOARD_APP_ID);
  });

  it('omits the link when in the Dashboard app', () => {
    showDashboardSavedToast({
      savedDashboardId: 'abc-123',
      dashboardTitle: 'Dash Title',
    });

    expect(getLastToastInput()).toEqual(
      expect.objectContaining({
        title: `Dashboard 'Dash Title' was saved`,
        'data-test-subj': 'saveDashboardSuccess',
      })
    );
    expect(getLastToastInput().actionProps).toBeUndefined();
  });

  it('renders a link when the user is outside the Dashboard app', () => {
    setCurrentAppId('agentBuilder');

    showDashboardSavedToast({
      savedDashboardId: 'abc-123',
      dashboardTitle: 'Dash Title',
    });

    expect(getLastToastInput().actionProps?.primary).toBeDefined();
  });

  it('navigates to the saved dashboard and closes the toast when the link is clicked', async () => {
    setCurrentAppId('agentBuilder');

    const mockToast = { id: 'mock-toast-id' };
    (coreServices.notifications.toasts.addSuccess as jest.Mock).mockReturnValue(mockToast);

    showDashboardSavedToast({
      savedDashboardId: 'saved-id',
      dashboardTitle: 'Dash Title',
    });

    getLastToastInput().actionProps!.primary!.onClick();

    expect(coreServices.notifications.toasts.remove).toHaveBeenCalledWith(mockToast);
    expect(coreServices.application.navigateToApp).toHaveBeenCalledWith(DASHBOARD_APP_ID, {
      path: '#/view/saved-id',
    });
  });
});
