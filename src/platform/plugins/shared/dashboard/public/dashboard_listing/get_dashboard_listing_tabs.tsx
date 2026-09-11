/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { TableListTabParentProps } from '@kbn/content-management-tabbed-table-list-view';
import {
  TableListViewTable,
  TableListViewKibanaProvider,
} from '@kbn/content-management-table-list-view-table';
import { FormattedRelative } from '@kbn/i18n-react';
import { FavoritesClient } from '@kbn/content-management-favorites-public';
import { DASHBOARD_APP_ID } from '../../common/page_bundle_constants';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '../../common/constants';
import {
  coreServices,
  savedObjectsTaggingService,
  serverlessService,
  usageCollectionService,
} from '../services/kibana_services';
import { DashboardUnsavedListing } from './dashboard_unsaved_listing';
import { useDashboardListingTable } from './hooks/use_dashboard_listing_table';
import { confirmCreateWithUnsaved } from './confirm_overlays';
import { getDashboardBackupService } from '../services/dashboard_api_services';
import type {
  DashboardListingProps,
  DashboardListingTab,
  DashboardSavedObjectUserContent,
} from './types';

type GetDashboardListingTabsParams = Pick<
  DashboardListingProps,
  'goToDashboard' | 'getDashboardUrl' | 'useSessionStorageIntegration' | 'initialFilter' | 'getTabs'
> & {
  refreshListBouncer?: boolean;
};

type TabContentProps = Omit<GetDashboardListingTabsParams, 'getTabs'> & {
  parentProps: TableListTabParentProps<DashboardSavedObjectUserContent>;
};

const getBaseKibanaProviderProps = () => ({
  core: coreServices,
  savedObjectsTagging: savedObjectsTaggingService?.getTaggingApi(),
  FormattedRelative,
  isKibanaVersioningEnabled: !serverlessService,
});

const DashboardsTabContent = ({
  goToDashboard,
  getDashboardUrl,
  useSessionStorageIntegration,
  initialFilter,
  refreshListBouncer,
  parentProps,
}: TabContentProps) => {
  const {
    unsavedDashboardIds,
    refreshUnsavedDashboards,
    tableListViewTableProps,
    contentInsightsClient,
  } = useDashboardListingTable({
    goToDashboard,
    getDashboardUrl,
    useSessionStorageIntegration,
    initialFilter,
    showCreateDashboardButton: parentProps.showCreateButton,
  });

  const dashboardFavoritesClient = useMemo(() => {
    return new FavoritesClient(DASHBOARD_APP_ID, DASHBOARD_SAVED_OBJECT_TYPE, {
      http: coreServices.http,
      usageCollection: usageCollectionService,
      userProfile: coreServices.userProfile,
    });
  }, []);

  return (
    <TableListViewKibanaProvider
      {...getBaseKibanaProviderProps()}
      favorites={dashboardFavoritesClient}
      contentInsightsClient={contentInsightsClient}
    >
      <DashboardUnsavedListing
        goToDashboard={goToDashboard}
        unsavedDashboardIds={unsavedDashboardIds}
        refreshUnsavedDashboards={refreshUnsavedDashboards}
      />
      <TableListViewTable<DashboardSavedObjectUserContent>
        tableCaption={tableListViewTableProps.title}
        {...tableListViewTableProps}
        onFetchSuccess={parentProps.onFetchSuccess}
        setPageDataTestSubject={parentProps.setPageDataTestSubject}
        refreshListBouncer={refreshListBouncer}
      />
    </TableListViewKibanaProvider>
  );
};

export const getDashboardListingTabs = ({
  goToDashboard,
  getDashboardUrl,
  useSessionStorageIntegration,
  initialFilter,
  getTabs,
  refreshListBouncer,
}: GetDashboardListingTabsParams): DashboardListingTab[] => {
  const commonProps = {
    goToDashboard,
    getDashboardUrl,
    useSessionStorageIntegration,
    initialFilter,
    refreshListBouncer,
  };

  const dashboardsTab: DashboardListingTab = {
    title: i18n.translate('dashboard.listing.tabs.dashboards.title', {
      defaultMessage: 'Dashboards',
    }),
    id: 'dashboards',
    getTableList: (parentProps) => (
      <DashboardsTabContent {...commonProps} parentProps={parentProps} />
    ),
    createAction: () => {
      if (useSessionStorageIntegration && getDashboardBackupService().dashboardHasUnsavedEdits()) {
        confirmCreateWithUnsaved(() => {
          getDashboardBackupService().clearState();
          goToDashboard();
        }, goToDashboard);
        return;
      }
      goToDashboard();
    },
  };

  // Additional tabs (e.g., visualizations and annotation groups)
  const additionalTabs = getTabs ? getTabs() : [];

  return [dashboardsTab, ...additionalTabs];
};
