/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EmbeddablePackageState } from '@kbn/embeddable-plugin/public';
import type { ViewMode } from '@kbn/presentation-publishing';
import { BehaviorSubject } from 'rxjs';
import type { SavedObjectAccessControl } from '@kbn/core-saved-objects-common';
import type { DashboardCreationOptions, DashboardUser } from './types';
import { getAccessControlClient } from '../services/access_control_service';
import { getDashboardBackupService } from '../services/dashboard_api_services';
import { getDashboardCapabilities } from '../utils/get_dashboard_capabilities';
import { getDashboardAccessControlState } from '../utils/get_dashboard_access_control_state';

export function initializeViewModeManager({
  creationOptions,
  incomingEmbeddables,
  isManaged,
  savedObjectId,
  accessControl,
  createdBy,
  user,
}: {
  creationOptions?: DashboardCreationOptions;
  incomingEmbeddables?: EmbeddablePackageState[];
  isManaged: boolean;
  savedObjectId?: string;
  accessControl?: Partial<SavedObjectAccessControl>;
  createdBy?: string;
  user?: DashboardUser;
}) {
  const dashboardBackupService = getDashboardBackupService();
  const accessControlClient = getAccessControlClient();
  const { viewMode: creationOptionsViewMode } = creationOptions?.getInitialInput?.() ?? {};
  console.log({ creationOptionsViewMode });
  const { canEditDashboard: canUserEditDashboard } = getDashboardAccessControlState({
    accessControlClient,
    accessControl,
    createdBy,
    user,
  });

  function getInitialViewMode() {
    if (creationOptionsViewMode === 'preview') return creationOptionsViewMode;

    if (isManaged || !getDashboardCapabilities().showWriteControls || !canUserEditDashboard) {
      return 'view';
    }

    if (
      incomingEmbeddables?.length ||
      !Boolean(savedObjectId)
      // dashboardBackupService.dashboardHasUnsavedEdits(savedObjectId)
    )
      return 'edit';

    return dashboardBackupService.getViewMode();
  }

  const viewMode$ = new BehaviorSubject<ViewMode>(getInitialViewMode());
  const disableTriggers$ = new BehaviorSubject<boolean>(viewMode$.getValue() === 'preview');

  const disableTriggersSubscription = viewMode$.subscribe((viewMode) => {
    console.log('!!!!!!!!!!', { viewMode });
    disableTriggers$.next(viewMode === 'preview');
  });

  function setViewMode(viewMode: ViewMode) {
    if (creationOptionsViewMode === 'preview') return;
    // block the Dashboard from entering edit mode if this Dashboard is managed.
    if (isManaged && viewMode?.toLowerCase() === 'edit') {
      return;
    }
    viewMode$.next(viewMode);
  }

  return {
    api: {
      viewMode$,
      setViewMode,
      disableTriggers$,
      isEditableByUser: canUserEditDashboard,
    },
    cleanup: () => {
      disableTriggersSubscription.unsubscribe();
    },
  };
}
