/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { i18n } from '@kbn/i18n';

import { TabbedTableListView } from '@kbn/content-management-tabbed-table-list-view';
import { I18nProvider } from '@kbn/i18n-react';
import { useExecutionContext } from '@kbn/kibana-react-plugin/public';
import { QueryClientProvider } from '@kbn/react-query';
import type { EmbeddableEditorBreadcrumb } from '@kbn/embeddable-plugin/public';

import { AppHeader } from '@kbn/app-header';
import type { AppHeaderTab } from '@kbn/app-header';
import type { AppMenuConfig, AppMenuPopoverItem } from '@kbn/core-chrome-app-menu-components';
import { coreServices } from '../services/kibana_services';
import { dashboardQueryClient } from '../services/dashboard_query_client';
import { DASHBOARD_APP_ID, LANDING_PAGE_PATH } from '../../common/page_bundle_constants';
import { getDashboardListingTabs } from './get_dashboard_listing_tabs';
import type { DashboardListingProps, DashboardListingTab } from './types';

export const DashboardListing = ({
  children,
  initialFilter,
  goToDashboard,
  getDashboardUrl,
  useSessionStorageIntegration,
  getTabs,
}: DashboardListingProps) => {
  useExecutionContext(coreServices.executionContext, {
    type: 'application',
    page: 'list',
  });

  const history = useHistory();
  const { activeTab: activeTabParam } = useParams<{ activeTab?: string }>();

  const tabs = useMemo(
    () =>
      getDashboardListingTabs({
        goToDashboard,
        getDashboardUrl,
        useSessionStorageIntegration,
        initialFilter,
        getTabs,
      }),
    [goToDashboard, getDashboardUrl, useSessionStorageIntegration, initialFilter, getTabs]
  );

  const activeTabId = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabParam)?.id ?? 'dashboards';
  }, [tabs, activeTabParam]);

  const changeActiveTab = useCallback(
    (tabId: string) => {
      history.push(`/list/${tabId}`);
    },
    [history]
  );

  const headerTabs = useMemo<AppHeaderTab[]>(
    () =>
      tabs.map((tab) => ({
        id: tab.id,
        label: tab.title,
        isSelected: tab.id === activeTabId,
        onClick: () => changeActiveTab(tab.id),
      })),
    [tabs, activeTabId, changeActiveTab]
  );

  const getBreadcrumbs = useCallback(
    (appId: string): EmbeddableEditorBreadcrumb[] => {
      const activeTabTitle = tabs.find((tab) => tab.id === activeTabId)?.title;
      const dashboardBreadcrumb = {
        text: i18n.translate('dashboard.listing.title', {
          defaultMessage: 'Dashboards',
        }),
        href: coreServices.application.getUrlForApp(appId, {
          path: `#${LANDING_PAGE_PATH}`,
        }),
      };

      if (!activeTabTitle || activeTabId === DASHBOARD_APP_ID) {
        return [dashboardBreadcrumb];
      }

      return [
        dashboardBreadcrumb,
        {
          text: activeTabTitle,
          href: coreServices.application.getUrlForApp(appId, { path: window.location.hash }),
        },
      ];
    },
    [tabs, activeTabId]
  );

  const appMenu = useMemo<AppMenuConfig | undefined>(() => {
    const tabsByIdMap = new Map((tabs as DashboardListingTab[]).map((tab) => [tab.id, tab]));
    const createDashboardAction = tabsByIdMap.get('dashboards')?.createAction;
    const createVisualizationAction = tabsByIdMap.get('visualizations')?.createAction;
    const createAnnotationAction = tabsByIdMap.get('annotations')?.createAction;
    const createMenuItems: AppMenuPopoverItem[] = [];

    if (createVisualizationAction) {
      createMenuItems.push({
        id: 'createVisualization',
        order: 1,
        label: i18n.translate('dashboard.listing.createVisualizationButtonLabel', {
          defaultMessage: 'Create visualization',
        }),
        iconType: 'chartBarVertical',
        testId: 'createVisualizationButton',
        run: createVisualizationAction,
      });
    }

    if (createAnnotationAction) {
      createMenuItems.push({
        id: 'createAnnotation',
        order: 2,
        label: i18n.translate('dashboard.listing.createAnnotationButtonLabel', {
          defaultMessage: 'Create annotation',
        }),
        iconType: 'flag',
        testId: 'createAnnotationButton',
        run: createAnnotationAction,
      });
    }

    if (!createDashboardAction) {
      return undefined;
    }

    return {
      primaryActionItem: {
        id: 'createDashboard',
        testId: 'dashboardListingCreateButton',
        iconType: 'plus',
        label: i18n.translate('dashboard.listing.createButtonLabel', {
          defaultMessage: 'Create dashboard',
        }),
        run: createDashboardAction,
        popoverWidth: 200,
        splitButtonProps:
          createMenuItems.length > 0
            ? {
                secondaryButtonAriaLabel: i18n.translate(
                  'dashboard.listing.createMoreActionsButtonAriaLabel',
                  {
                    defaultMessage: 'Create more dashboard content',
                  }
                ),
                items: createMenuItems,
              }
            : undefined,
      },
    };
  }, [tabs]);

  return (
    <I18nProvider>
      <QueryClientProvider client={dashboardQueryClient}>
        {children}
        <AppHeader
          title={i18n.translate('dashboard.listing.title', {
            defaultMessage: 'Dashboards',
          })}
          tabs={headerTabs}
          menu={appMenu}
        />
        <TabbedTableListView
          headingId="dashboardListingHeading"
          getBreadcrumbs={getBreadcrumbs}
          tabs={tabs}
          activeTabId={activeTabId}
          changeActiveTab={changeActiveTab}
          showCreateButton={false}
          hideTabs
        />
      </QueryClientProvider>
    </I18nProvider>
  );
};

// eslint-disable-next-line import/no-default-export
export default DashboardListing;
