/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/common';

import { buildMockDashboardApi } from '../mocks';
import { coreServices, dataService } from '../services/kibana_services';
import { getDashboardRecentlyAccessedService } from '../services/dashboard_recently_accessed_service';
import { DashboardRenderer } from './dashboard_renderer';
import { loadDashboardApi } from '../dashboard_api/load_dashboard_api';
import type { DashboardPinnedPanelsState } from '@kbn/as-code-dashboard-schema';

jest.mock('../dashboard_api/load_dashboard_api');

describe('Dashboard Renderer', () => {
  dataService.query.filterManager.getFilters = jest.fn().mockImplementation(() => []);

  (loadDashboardApi as jest.Mock).mockImplementation(async ({ getCreationOptions }) => {
    const { useControlsIntegration } = await (getCreationOptions?.() ?? Promise.resolve({}));
    return {
      useControlsIntegration,
      ...buildMockDashboardApi({
        overrides: {
          pinned_panels: [
            {
              type: 'options_list_control',
            },
          ] as DashboardPinnedPanelsState,
        },
      }),
    };
  });

  it('renders the dashboard control group and dashboard viewport', async () => {
    render(
      <DashboardRenderer
        getCreationOptions={() => Promise.resolve({ useControlsIntegration: true })}
      />
    );

    await waitFor(async () => {
      expect(await screen.queryByTestId('dshDashboardViewport')).toBeInTheDocument();
      expect(await screen.queryByTestId('controls-group-wrapper')).toBeInTheDocument();
    });
  });

  it('renders only the dashboard viewport when useControlsIntegration is false', async () => {
    render(
      <DashboardRenderer
        getCreationOptions={() => Promise.resolve({ useControlsIntegration: false })}
      />
    );

    await waitFor(async () => {
      expect(await screen.queryByTestId('dshDashboardViewport')).toBeInTheDocument();
      expect(await screen.queryByTestId('controls-group-wrapper')).not.toBeInTheDocument();
    });
  });

  it('removes a missing dashboard from recently accessed', async () => {
    (loadDashboardApi as jest.Mock).mockRejectedValueOnce(
      new SavedObjectNotFound({ type: 'dashboard', id: 'missing-id' })
    );

    render(<DashboardRenderer savedObjectId="missing-id" />);

    await waitFor(() => {
      expect(getDashboardRecentlyAccessedService().remove).toHaveBeenCalledWith('missing-id');
      expect(coreServices.chrome.recentlyAccessed.remove).toHaveBeenCalledWith('missing-id');
    });
  });
});
