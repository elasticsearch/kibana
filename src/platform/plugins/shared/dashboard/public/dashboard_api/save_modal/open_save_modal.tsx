/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { htmlIdGenerator } from '@elastic/eui';
import type { ViewMode } from '@kbn/presentation-publishing';
import { reportPerformanceMetricEvent } from '@kbn/ebt-tools';
import { openLazyModal } from '@kbn/presentation-util';
import { i18n } from '@kbn/i18n';
import type { SavedObjectAccessControl } from '@kbn/core-saved-objects-common';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { DashboardSaveOptions } from './types';
import {
  coreServices,
  cpsService,
  savedObjectsTaggingService,
} from '../../services/kibana_services';
import { SAVED_OBJECT_POST_TIME } from '../../utils/telemetry_constants';
import { DashboardSaveModal } from './save_modal';
import { generateDashboardNotSavedToast, saveDashboard } from './save_dashboard';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { getSaveAsTitle } from './get_save_as_title';

/**
 * @description exclusively for user directed dashboard save actions, also
 * accounts for scenarios of cloning elastic managed dashboard into user managed dashboards
 */
export function openSaveModal({
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
  onSave,
  onClose,
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
  onSave: (saveResult: {
    id: string;
    redirectRequired?: boolean;
    savedState: DashboardState;
  }) => void;
  onClose: () => void;
}) {
  if (viewMode === 'edit' && isManaged) {
    onClose();
    return;
  }

  const modalTitleId = htmlIdGenerator()();

  openLazyModal({
    core: coreServices,
    onClose,
    ariaLabelledBy: modalTitleId,
    loadContent: async ({ closeModal }) => {
      try {
        /**
         * Only add access control for new dashboards being created by a logged in user that is not an anonymous user or
         * user authenticated via authenticating proxy.
         */
        const getShouldAddAccessControl = async () => {
          try {
            const currentProfileUid = (await coreServices.security.authc.getCurrentUser())
              .profile_uid;
            const isCreatingNewDashboard = Boolean(!lastSavedId);
            return isCreatingNewDashboard && Boolean(currentProfileUid);
          } catch {
            return false;
          }
        };

        const shouldAddAccessControl = await getShouldAddAccessControl();
        const saveAsTitle = lastSavedId ? await getSaveAsTitle(title) : title;

        const onSaveAttempt = async ({
          newTags,
          newTitle,
          newDescription,
          newCopyOnSave,
          newTimeRestore,
          newAccessMode,
          newProjectRoutingRestore,
        }: DashboardSaveOptions): Promise<void> => {
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
            saveOptions: {
              confirmOverwrite: false,
              saveAsCopy: lastSavedId ? true : newCopyOnSave,
            },
            dashboardState: dashboardStateToSave,
            lastSavedId,
            accessMode: shouldAddAccessControl && newAccessMode ? newAccessMode : undefined,
          });

          if ('error' in saveResult) return;

          reportPerformanceMetricEvent(coreServices.analytics, {
            eventName: SAVED_OBJECT_POST_TIME,
            duration: window.performance.now() - beforeAddTime,
            meta: { saved_object_type: DASHBOARD_SAVED_OBJECT_TYPE },
          });

          onSave({ ...saveResult, savedState: dashboardStateToSave });
          closeModal();
        };

        return (
          <DashboardSaveModal
            tags={tags}
            lastSavedTitle={lastSavedId ? title : ''}
            title={saveAsTitle}
            onClose={closeModal}
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
            modalTitleId={modalTitleId}
          />
        );
      } catch (error) {
        coreServices.notifications.toasts.addDanger(
          generateDashboardNotSavedToast(title, error.message)
        );
        return null;
      }
    },
  });
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
