/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { ViewMode } from '@kbn/presentation-publishing';
import { reportPerformanceMetricEvent } from '@kbn/ebt-tools';
import { showSaveModal } from '@kbn/saved-objects-plugin/public';
import { i18n } from '@kbn/i18n';
import type { SavedObjectAccessControl } from '@kbn/core-saved-objects-common';
import type { DashboardSaveOptions, SaveDashboardReturn } from './types';
import {
  coreServices,
  cpsService,
  savedObjectsTaggingService,
} from '../../services/kibana_services';
import type { DashboardState } from '../../../common';
import { SAVED_OBJECT_POST_TIME } from '../../utils/telemetry_constants';
import { DashboardSaveModal } from './save_modal';
import { saveDashboard } from './save_dashboard';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { getSaveAsTitle } from './get_save_as_title';

/**
 * @description exclusively for user directed dashboard save actions, also
 * accounts for scenarios of cloning elastic managed dashboard into user managed dashboards
 */
export async function openSaveModal({
  description,
  isManaged,
  lastSavedId,
  serializeState,
  setTimeRestore,
  setProjectRoutingRestore,
  tags,
  timeRestore,
  projectRoutingRestore,
  title,
  viewMode,
  accessControl,
}: {
  description?: string;
  isManaged: boolean;
  lastSavedId: string | undefined;
  serializeState: () => DashboardState;
  setTimeRestore: (timeRestore: boolean) => void;
  setProjectRoutingRestore: (projectRoutingRestore: boolean) => void;
  tags?: string[];
  timeRestore: boolean;
  projectRoutingRestore: boolean;
  title: string;
  viewMode: ViewMode;
  accessControl?: Partial<SavedObjectAccessControl>;
}) {
  try {
    if (viewMode === 'edit' && isManaged) {
      return undefined;
    }

    /**
     * Only add access control for new dashboards being created by a logged in user that is not an anonymous user or
     * user authenticated via authenticating proxy.
     */
    const getShouldAddAccessControl = async () => {
      try {
        const currentProfileUid = (await coreServices.security.authc.getCurrentUser()).profile_uid;
        const isCreatingNewDashboard = Boolean(!lastSavedId);
        return isCreatingNewDashboard && Boolean(currentProfileUid);
      } catch {
        return false;
      }
    };

    const shouldAddAccessControl = await getShouldAddAccessControl();

    const saveAsTitle = lastSavedId ? await getSaveAsTitle(title) : title;
    return new Promise<(SaveDashboardReturn & { savedState: DashboardState }) | undefined>(
      (resolve) => {
        const onSaveAttempt = async ({
          newTags,
          newTitle,
          newDescription,
          newCopyOnSave,
          newTimeRestore,
          newAccessMode,
          newProjectRoutingRestore,
        }: DashboardSaveOptions): Promise<SaveDashboardReturn> => {
          const saveOptions = {
            confirmOverwrite: false,
            saveAsCopy: lastSavedId ? true : newCopyOnSave,
          };

          try {
            setTimeRestore(newTimeRestore);
            setProjectRoutingRestore(newProjectRoutingRestore);
            const dashboardState = serializeState();

            const dashboardStateToSave: DashboardState = {
              ...dashboardState,
              title: newTitle,
              tags: savedObjectsTaggingService && newTags ? newTags : ([] as string[]),
              description: newDescription,
            };

            // TODO If this is a managed dashboard - unlink all by reference embeddables on clone
            // https://github.com/elastic/kibana/issues/190138

            const beforeAddTime = window.performance.now();

            const saveResult = await saveDashboard({
              saveOptions,
              dashboardState: dashboardStateToSave,
              lastSavedId,
              accessMode: shouldAddAccessControl && newAccessMode ? newAccessMode : undefined,
            });

            const addDuration = window.performance.now() - beforeAddTime;

            reportPerformanceMetricEvent(coreServices.analytics, {
              eventName: SAVED_OBJECT_POST_TIME,
              duration: addDuration,
              meta: {
                saved_object_type: DASHBOARD_SAVED_OBJECT_TYPE,
              },
            });

            resolve({ ...saveResult, savedState: dashboardStateToSave });
            return saveResult;
          } catch (error) {
            coreServices.notifications.toasts.addDanger(
              generateDashboardNotSavedToast(title, error.message)
            );
            return error;
          }
        };

        showSaveModal(
          <DashboardSaveModal
            tags={tags}
            lastSavedTitle={lastSavedId ? title : ''}
            title={saveAsTitle}
            onClose={() => resolve(undefined)}
            timeRestore={timeRestore}
            projectRoutingRestore={projectRoutingRestore}
            showStoreTimeOnSave={!lastSavedId}
            showStoreProjectRoutingOnSave={!lastSavedId && Boolean(cpsService?.cpsManager)}
            description={description ?? ''}
            showCopyOnSave={false}
            onSave={onSaveAttempt}
            accessControl={accessControl}
            customModalTitle={getCustomModalTitle(viewMode, lastSavedId)}
            showAccessContainer={shouldAddAccessControl}
          />
        );
      }
    );
  } catch (error) {
    coreServices.notifications.toasts.addDanger(
      generateDashboardNotSavedToast(title, error.message)
    );
    return undefined;
  }
}

function getCustomModalTitle(viewMode: ViewMode, lastSavedId: string | undefined) {
  if (!lastSavedId || viewMode === 'edit')
    return i18n.translate('dashboard.topNav.editModeInteractiveSave.modalTitle', {
      defaultMessage: 'Save as new dashboard',
    });

  if (viewMode === 'view')
    return i18n.translate('dashboard.topNav.viewModeInteractiveSave.modalTitle', {
      defaultMessage: 'Duplicate dashboard',
    });
  return undefined;
}

function generateDashboardNotSavedToast(title: string, errorMessage: any) {
  return {
    title: i18n.translate('dashboard.dashboardWasNotSavedDangerMessage', {
      defaultMessage: `Dashboard ''{title}'' was not saved. Error: {errorMessage}`,
      values: {
        title,
        errorMessage,
      },
    }),
    'data-test-subj': 'saveDashboardFailure',
  };
}
