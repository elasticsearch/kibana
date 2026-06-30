/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useState } from 'react';

import type { OpenContentEditorParams } from '@kbn/content-management-content-editor';
import { ContentInsightsClient } from '@kbn/content-management-content-insights-public';
import type { TableListViewTableProps } from '@kbn/content-management-table-list-view-table';
import type { SavedObjectsFindOptionsReference } from '@kbn/core/public';
import { reportPerformanceMetricEvent } from '@kbn/ebt-tools';
import type { ViewMode } from '@kbn/presentation-publishing';

import { asyncMap } from '@kbn/std';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { contentEditorFlyoutStrings } from '../../dashboard_app/_dashboard_app_strings';
import { dashboardClient, findService, hasLibraryItemWithTitle } from '../../dashboard_client';
import { getAccessControlClient } from '../../services/access_control_service';
import { getDashboardRecentlyAccessedService } from '../../services/dashboard_recently_accessed_service';
import { coreServices, savedObjectsTaggingService } from '../../services/kibana_services';
import { logger } from '../../services/logger';
import { getDashboardCapabilities } from '../../utils/get_dashboard_capabilities';
import {
  SAVED_OBJECT_DELETE_TIME,
  SAVED_OBJECT_LOADED_TIME,
} from '../../utils/telemetry_constants';
import {
  dashboardListingErrorStrings,
  dashboardListingTableStrings,
} from '../_dashboard_listing_strings';
import { confirmCreateWithUnsaved } from '../confirm_overlays';
import { DashboardListingEmptyPrompt } from '../dashboard_listing_empty_prompt';
import type { DashboardSavedObjectUserContent } from '../types';
import { getDashboardBackupService } from '../../services/dashboard_api_services';

type GetDetailViewLink =
  TableListViewTableProps<DashboardSavedObjectUserContent>['getDetailViewLink'];

const SAVED_OBJECTS_LIMIT_SETTING = 'savedObjects:listingLimit';
const SAVED_OBJECTS_PER_PAGE_SETTING = 'savedObjects:perPage';

type DashboardListingViewTableProps = Omit<
  TableListViewTableProps<DashboardSavedObjectUserContent>,
  'tableCaption'
> & { title: string };

interface UseDashboardListingTableReturnType {
  hasInitialFetchReturned: boolean;
  pageDataTestSubject: string | undefined;
  refreshUnsavedDashboards: () => void;
  tableListViewTableProps: DashboardListingViewTableProps;
  unsavedDashboardIds: string[];
  contentInsightsClient: ContentInsightsClient;
}

export const useDashboardListingTable = ({
  dashboardListingId = 'dashboard',
  disableCreateDashboardButton,
  getDashboardUrl,
  goToDashboard,
  headingId = 'dashboardListingHeading',
  initialFilter,
  urlStateEnabled,
  useSessionStorageIntegration,
  showCreateDashboardButton = true,
}: {
  dashboardListingId?: string;
  disableCreateDashboardButton?: boolean;
  getDashboardUrl: (dashboardId: string, usesTimeRestore: boolean) => string;
  goToDashboard: (dashboardId?: string, viewMode?: ViewMode) => void;
  headingId?: string;
  initialFilter?: string;
  urlStateEnabled?: boolean;
  useSessionStorageIntegration?: boolean;
  showCreateDashboardButton?: boolean;
}): UseDashboardListingTableReturnType => {
  const { getEntityName, getTableListTitle, getEntityNamePlural } = dashboardListingTableStrings;
  const title = getTableListTitle();
  const entityName = getEntityName();
  const entityNamePlural = getEntityNamePlural();
  const [pageDataTestSubject, setPageDataTestSubject] = useState<string>();
  const [hasInitialFetchReturned, setHasInitialFetchReturned] = useState(false);

  const [unsavedDashboardIds, setUnsavedDashboardIds] = useState<string[]>(
    getDashboardBackupService().getDashboardIdsWithUnsavedChanges()
  );

  const accessControlClient = getAccessControlClient();

  const listingLimit = coreServices.uiSettings.get(SAVED_OBJECTS_LIMIT_SETTING);
  const initialPageSize = coreServices.uiSettings.get(SAVED_OBJECTS_PER_PAGE_SETTING);

  const createItem = useCallback(() => {
    if (useSessionStorageIntegration && getDashboardBackupService().dashboardHasUnsavedEdits()) {
      confirmCreateWithUnsaved(() => {
        getDashboardBackupService().clearState();
        goToDashboard();
      }, goToDashboard);
      return;
    }
    goToDashboard();
  }, [goToDashboard, useSessionStorageIntegration]);

  const updateItemMeta = useCallback(
    async ({ id, ...updatedState }: Parameters<Required<OpenContentEditorParams>['onSave']>[0]) => {
      const dashboard = await findService.findById(id);
      if (dashboard.status === 'error') {
        return;
      }
      // `access_control` can not be specified as part of the update payload
      const { access_control, ...restOfAttributes } = dashboard.attributes;
      await dashboardClient.update(id, {
        ...restOfAttributes,
        ...updatedState,
      });

      setUnsavedDashboardIds(getDashboardBackupService().getDashboardIdsWithUnsavedChanges());
    },
    []
  );

  const contentEditorValidators: OpenContentEditorParams['customValidators'] = useMemo(
    () => ({
      title: [
        {
          type: 'warning',
          fn: async (value: string, id: string) => {
            if (!id) return;
            try {
              const dashboard = await findService.findById(id);
              if (dashboard.status === 'error') {
                return;
              }

              if (value.toLowerCase() === dashboard.attributes.title.toLowerCase()) {
                return;
              }

              const hasDuplicateTitle = await hasLibraryItemWithTitle(value);

              if (hasDuplicateTitle) {
                return dashboardListingErrorStrings.getDuplicateTitleWarning(value);
              }
            } catch (e) {
              return e.message;
            }
          },
        },
      ],
    }),
    []
  );

  const emptyPrompt = useMemo(
    () => (
      <DashboardListingEmptyPrompt
        createItem={createItem}
        disableCreateDashboardButton={disableCreateDashboardButton}
        goToDashboard={goToDashboard}
        setUnsavedDashboardIds={setUnsavedDashboardIds}
        unsavedDashboardIds={unsavedDashboardIds}
        useSessionStorageIntegration={useSessionStorageIntegration}
      />
    ),
    [
      createItem,
      disableCreateDashboardButton,
      goToDashboard,
      unsavedDashboardIds,
      useSessionStorageIntegration,
    ]
  );

  const findItems = useCallback(
    async (
      searchTerm: string,
      {
        references,
        referencesToExclude,
      }: {
        references?: SavedObjectsFindOptionsReference[];
        referencesToExclude?: SavedObjectsFindOptionsReference[];
      } = {}
    ) => {
      const searchStartTime = window.performance.now();

      const [userResponse, globalPrivilegeResponse] = await Promise.allSettled([
        coreServices.userProfile.getCurrent(),
        accessControlClient.checkGlobalPrivilege(DASHBOARD_SAVED_OBJECT_TYPE),
      ]);

      const userId = userResponse.status === 'fulfilled' ? userResponse.value.uid : undefined;
      const isGloballyAuthorized =
        globalPrivilegeResponse.status === 'fulfilled'
          ? globalPrivilegeResponse.value.isGloballyAuthorized
          : false;

      return findService
        .search({
          query: searchTerm,
          per_page: listingLimit,
          tags: (references ?? []).map(({ id }) => id),
          excluded_tags: (referencesToExclude ?? []).map(({ id }) => id),
        })
        .then(({ meta: { total }, data: dashboards }) => {
          const searchEndTime = window.performance.now();
          const searchDuration = searchEndTime - searchStartTime;
          reportPerformanceMetricEvent(coreServices.analytics, {
            eventName: SAVED_OBJECT_LOADED_TIME,
            duration: searchDuration,
            meta: {
              saved_object_type: DASHBOARD_SAVED_OBJECT_TYPE,
            },
          });
          const tagApi = savedObjectsTaggingService?.getTaggingApi();

          return {
            total,
            hits: dashboards.map(({ id, data, meta }) => {
              const canManageAccessControl =
                isGloballyAuthorized ||
                accessControlClient.checkUserAccessControl({
                  accessControl: {
                    owner: meta.owner,
                    accessMode: data?.access_control?.access_mode,
                  },
                  createdBy: meta.created_at,
                  userId,
                });

              return {
                type: 'dashboard',
                id,
                updatedAt: meta.updated_at,
                createdAt: meta.created_at,
                createdBy: meta.created_by,
                updatedBy: meta.updated_by,
                references: tagApi && data.tags ? data.tags.map(tagApi.ui.tagIdToReference) : [],
                managed: meta.managed,
                attributes: {
                  title: data.title,
                  description: data.description,
                  timeRestore: Boolean(data.time_range),
                },
                canManageAccessControl,
                accessMode: data?.access_control?.access_mode,
              } as DashboardSavedObjectUserContent;
            }),
          };
        });
    },
    [listingLimit, accessControlClient]
  );

  const deleteItems = useCallback(async (dashboardsToDelete: Array<{ id: string }>) => {
    try {
      const deleteStartTime = window.performance.now();

      await asyncMap(dashboardsToDelete, async ({ id }) => {
        await dashboardClient.delete(id);
        getDashboardBackupService().clearState(id);
      });

      const deleteDuration = window.performance.now() - deleteStartTime;
      reportPerformanceMetricEvent(coreServices.analytics, {
        eventName: SAVED_OBJECT_DELETE_TIME,
        duration: deleteDuration,
        meta: {
          saved_object_type: DASHBOARD_SAVED_OBJECT_TYPE,
          total: dashboardsToDelete.length,
        },
      });
    } catch (error) {
      coreServices.notifications.toasts.addError(error, {
        title: dashboardListingErrorStrings.getErrorDeletingDashboardToast(),
      });
    }

    setUnsavedDashboardIds(getDashboardBackupService().getDashboardIdsWithUnsavedChanges());
  }, []);

  const editItem = useCallback(
    ({ id }: { id: string | undefined }) => goToDashboard(id, 'edit'),
    [goToDashboard]
  );

  const onFetchSuccess = useCallback(() => {
    if (!hasInitialFetchReturned) {
      setHasInitialFetchReturned(true);
    }
  }, [hasInitialFetchReturned]);

  const getDetailViewLink = useCallback<NonNullable<GetDetailViewLink>>(
    ({ id, attributes: { timeRestore } }) => getDashboardUrl(id, timeRestore),
    [getDashboardUrl]
  );

  const tableListViewTableProps: DashboardListingViewTableProps = useMemo(() => {
    const { showWriteControls } = getDashboardCapabilities();
    return {
      contentEditor: {
        onSave: updateItemMeta,
        customValidators: contentEditorValidators,
      },
      createItem: !showWriteControls || !showCreateDashboardButton ? undefined : createItem,
      deleteItems: !showWriteControls ? undefined : deleteItems,
      editItem: !showWriteControls ? undefined : editItem,
      emptyPrompt,
      entityName,
      entityNamePlural,
      findItems,
      getDetailViewLink,
      headingId,
      id: dashboardListingId,
      initialFilter,
      initialPageSize,
      listingLimit,
      onFetchSuccess,
      setPageDataTestSubject,
      title,
      urlStateEnabled,
      createdByEnabled: true,
      recentlyAccessed: getDashboardRecentlyAccessedService(),
      rowItemActions: (item) => {
        const isDisabled = () => {
          if (!showWriteControls) return true;
          if (item?.managed === true) return true;
          if (item?.canManageAccessControl === false && item?.accessMode === 'write_restricted')
            return true;
          return false;
        };

        const getReason = () => {
          if (!showWriteControls) {
            return contentEditorFlyoutStrings.readonlyReason.missingPrivileges;
          }
          if (item?.managed) {
            return contentEditorFlyoutStrings.readonlyReason.managedEntity;
          }
          if (item?.canManageAccessControl === false) {
            return contentEditorFlyoutStrings.readonlyReason.accessControl;
          }
        };

        return {
          edit: {
            enabled: !isDisabled(),
            reason: getReason(),
          },
          delete: {
            enabled: !isDisabled(),
            reason: getReason(),
          },
        };
      },
    };
  }, [
    contentEditorValidators,
    createItem,
    dashboardListingId,
    deleteItems,
    editItem,
    emptyPrompt,
    entityName,
    entityNamePlural,
    findItems,
    getDetailViewLink,
    headingId,
    initialFilter,
    initialPageSize,
    listingLimit,
    onFetchSuccess,
    showCreateDashboardButton,
    title,
    updateItemMeta,
    urlStateEnabled,
  ]);

  const refreshUnsavedDashboards = useCallback(
    () => setUnsavedDashboardIds(getDashboardBackupService().getDashboardIdsWithUnsavedChanges()),
    []
  );

  const contentInsightsClient = useMemo(
    () => new ContentInsightsClient({ http: coreServices.http, logger }, { domainId: 'dashboard' }),
    []
  );

  return {
    hasInitialFetchReturned,
    pageDataTestSubject,
    refreshUnsavedDashboards,
    tableListViewTableProps,
    unsavedDashboardIds,
    contentInsightsClient,
  };
};
