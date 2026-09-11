/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';
import { waitFor } from '@testing-library/react';

import type { DataView } from '@kbn/data-views-plugin/public';
import type { ViewMode } from '@kbn/presentation-publishing';
import { setMockedPresentationUtilServices } from '@kbn/presentation-util-plugin/public/mocks';
import { renderWithI18n } from '@kbn/test-jest-helpers';

import type { DashboardApi } from '../dashboard_api/types';
import { DashboardContext } from '../dashboard_api/use_dashboard_api';
import { buildMockDashboardApi } from '../mocks';
import {
  coreServices,
  dataService,
  shareService,
  unifiedSearchService,
} from '../services/kibana_services';
import { InternalDashboardTopNav } from './internal_dashboard_top_nav';
import { DashboardInternalContext } from '../dashboard_api/use_dashboard_internal_api';

// The top nav reads chrome via context hooks (`useChromeStyle`), so render inside
// the chrome provider just like production. The mock defaults to classic chrome (legacy header mode).
const renderWithChrome = (ui: React.ReactElement) =>
  renderWithI18n(coreServices.chrome.withProvider(ui));

describe('Internal dashboard top nav', () => {
  beforeEach(() => {
    setMockedPresentationUtilServices();
    dataService.query.filterManager.getFilters = jest.fn().mockReturnValue([]);
    shareService!.availableIntegrations = jest.fn().mockReturnValue([]);
    jest.clearAllMocks();
  });

  it('should not render the managed badge by default', async () => {
    const { api, internalApi } = buildMockDashboardApi();
    renderWithChrome(
      <DashboardContext.Provider value={api}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav redirectTo={jest.fn()} />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    // When not managed, setBreadcrumbsBadges should be called with an empty array
    expect(coreServices.chrome.setBreadcrumbsBadges).toHaveBeenCalledWith([]);
  });

  it('should render the managed badge when the dashboard is managed', async () => {
    const { api, internalApi } = buildMockDashboardApi({
      savedObjectId: 'test-id',
    });
    const dashboardApi = {
      ...api,
      isManaged: true,
    };
    renderWithChrome(
      <DashboardContext.Provider value={dashboardApi}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav redirectTo={jest.fn()} />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    // When managed, setBreadcrumbsBadges should be called with a badge containing 'Managed' text
    expect(coreServices.chrome.setBreadcrumbsBadges).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          badgeText: 'Managed',
        }),
      ])
    );
  });

  describe('embed mode', () => {
    it('should hide all top nav and unified search elements except filter bar by default', async () => {
      const { api, internalApi } = buildMockDashboardApi();
      const dashboardApi: DashboardApi = {
        ...api,
        viewMode$: new BehaviorSubject<ViewMode>('view'),
      };

      renderWithChrome(
        <DashboardContext.Provider value={dashboardApi}>
          <DashboardInternalContext.Provider value={internalApi}>
            <InternalDashboardTopNav
              redirectTo={jest.fn()}
              embedSettings={{
                forceShowDatePicker: false,
                forceHideFilterBar: false,
                forceShowQueryInput: false,
                forceShowTopNavMenu: false,
              }}
            />
          </DashboardInternalContext.Provider>
        </DashboardContext.Provider>
      );

      expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          showDatePicker: false,
          showFilterBar: true,
          showQueryInput: false,
          showSearchBar: true,
        }),
        {}
      );
    });
  });

  it('should disable filter bar when forceHideFilterBar is true', async () => {
    const { api, internalApi } = buildMockDashboardApi();
    const dashboardApi: DashboardApi = {
      ...api,
      viewMode$: new BehaviorSubject<ViewMode>('view'),
    };

    renderWithChrome(
      <DashboardContext.Provider value={dashboardApi}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav
            redirectTo={jest.fn()}
            embedSettings={{
              forceHideFilterBar: true,
              forceShowDatePicker: false,
              forceShowQueryInput: false,
              forceShowTopNavMenu: false,
            }}
          />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    // When forceHideFilterBar is true and all other settings are false, the search bar should not be shown
    expect(unifiedSearchService.ui.SearchBar).not.toHaveBeenCalled();
  });

  it('should enable global time range date picker when forceShowDatePicker is true', async () => {
    const { api, internalApi } = buildMockDashboardApi();
    const dashboardApi: DashboardApi = {
      ...api,
      viewMode$: new BehaviorSubject<ViewMode>('view'),
    };

    renderWithChrome(
      <DashboardContext.Provider value={dashboardApi}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav
            redirectTo={jest.fn()}
            embedSettings={{
              forceShowDatePicker: true,
              forceHideFilterBar: false,
              forceShowQueryInput: false,
              forceShowTopNavMenu: false,
            }}
          />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
      expect.objectContaining({
        showDatePicker: { disabled: false },
        showFilterBar: true,
        showQueryInput: false,
        showSearchBar: true,
      }),
      {}
    );
  });

  it('should disable the date picker when no data view is time-based', async () => {
    const { api, internalApi } = buildMockDashboardApi();
    const dashboardApi: DashboardApi = {
      ...api,
      viewMode$: new BehaviorSubject<ViewMode>('view'),
      dataViews$: new BehaviorSubject<DataView[] | undefined>([
        { isTimeBased: () => false } as DataView,
      ]),
    };

    renderWithChrome(
      <DashboardContext.Provider value={dashboardApi}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav
            redirectTo={jest.fn()}
            embedSettings={{
              forceShowDatePicker: true,
              forceHideFilterBar: false,
              forceShowQueryInput: false,
              forceShowTopNavMenu: false,
            }}
          />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
      expect.objectContaining({
        showDatePicker: { disabled: true },
      }),
      {}
    );
  });

  it('should keep the date picker enabled when at least one data view is time-based', async () => {
    const { api, internalApi } = buildMockDashboardApi();
    const dashboardApi: DashboardApi = {
      ...api,
      viewMode$: new BehaviorSubject<ViewMode>('view'),
      dataViews$: new BehaviorSubject<DataView[] | undefined>([
        { isTimeBased: () => false } as DataView,
        { isTimeBased: () => true } as DataView,
      ]),
    };

    renderWithChrome(
      <DashboardContext.Provider value={dashboardApi}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav
            redirectTo={jest.fn()}
            embedSettings={{
              forceShowDatePicker: true,
              forceHideFilterBar: false,
              forceShowQueryInput: false,
              forceShowTopNavMenu: false,
            }}
          />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
      expect.objectContaining({
        showDatePicker: { disabled: false },
      }),
      {}
    );
  });

  it('should enable query search bar when forceShowQueryInput is true', async () => {
    const { api, internalApi } = buildMockDashboardApi();
    const dashboardApi: DashboardApi = {
      ...api,
      viewMode$: new BehaviorSubject<ViewMode>('view'),
    };

    renderWithChrome(
      <DashboardContext.Provider value={dashboardApi}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav
            redirectTo={jest.fn()}
            embedSettings={{
              forceShowDatePicker: false,
              forceHideFilterBar: false,
              forceShowQueryInput: true,
              forceShowTopNavMenu: false,
            }}
          />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
      expect.objectContaining({
        showDatePicker: false,
        showFilterBar: true,
        showQueryInput: true,
        showSearchBar: true,
      }),
      {}
    );
  });

  it('should enable top nav when forceShowTopNavMenu is true', async () => {
    const { api, internalApi } = buildMockDashboardApi();
    const dashboardApi: DashboardApi = {
      ...api,
      viewMode$: new BehaviorSubject<ViewMode>('view'),
    };

    renderWithChrome(
      <DashboardContext.Provider value={dashboardApi}>
        <DashboardInternalContext.Provider value={internalApi}>
          <InternalDashboardTopNav
            redirectTo={jest.fn()}
            embedSettings={{
              forceShowDatePicker: false,
              forceShowTopNavMenu: true,
              forceShowQueryInput: false,
              forceHideFilterBar: false,
            }}
          />
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    );

    // forceShowTopNavMenu controls the AppMenu visibility, not SearchBar
    // The SearchBar should still be rendered with appropriate props
    expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
      expect.objectContaining({
        showDatePicker: false,
        showFilterBar: true,
        showQueryInput: false,
        showSearchBar: true,
      }),
      {}
    );
  });

  describe('esqlApproximation toggle', () => {
    it('should be disabled when there is no ES|QL panel', async () => {
      const { api, internalApi } = buildMockDashboardApi();

      renderWithChrome(
        <DashboardContext.Provider value={api}>
          <DashboardInternalContext.Provider value={internalApi}>
            <InternalDashboardTopNav redirectTo={jest.fn()} />
          </DashboardInternalContext.Provider>
        </DashboardContext.Provider>
      );

      await waitFor(() => {
        expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
          expect.objectContaining({
            esqlApproximation: expect.objectContaining({ disabled: true }),
          }),
          {}
        );
      });
    });

    it('should be enabled when a panel publishes esql$ with queries (e.g. a Vega panel using ES|QL)', async () => {
      const { api, internalApi } = buildMockDashboardApi();
      api.registerChildApi({
        uuid: 'vega-panel',
        esql$: new BehaviorSubject([{ esql: 'FROM logs | LIMIT 10' }]),
        approximationApplied$: new BehaviorSubject<boolean | undefined>(undefined),
      } as unknown as Parameters<typeof api.registerChildApi>[0]);

      renderWithChrome(
        <DashboardContext.Provider value={api}>
          <DashboardInternalContext.Provider value={internalApi}>
            <InternalDashboardTopNav redirectTo={jest.fn()} />
          </DashboardInternalContext.Provider>
        </DashboardContext.Provider>
      );

      await waitFor(() => {
        expect(unifiedSearchService.ui.SearchBar).toHaveBeenCalledWith(
          expect.objectContaining({
            esqlApproximation: expect.objectContaining({ disabled: false }),
          }),
          {}
        );
      });
    });
  });
});
