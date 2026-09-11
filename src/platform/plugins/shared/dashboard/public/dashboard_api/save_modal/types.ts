/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectSaveOpts } from '@kbn/saved-objects-plugin/public';
import type { SavedObjectAccessControl } from '@kbn/core-saved-objects-common';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';

export interface DashboardSaveOptions {
  newTitle: string;
  newTags?: string[];
  newDescription: string;
  newCopyOnSave: boolean;
  newTimeRestore: boolean;
  newAccessMode?: SavedObjectAccessControl['accessMode'];
  newProjectRoutingRestore: boolean;
}

export type SavedDashboardSaveOpts = SavedObjectSaveOpts & { saveAsCopy?: boolean };

export interface SaveDashboardProps {
  dashboardState: DashboardState;
  saveOptions: SavedDashboardSaveOpts;
  lastSavedId?: string;
  accessMode?: SavedObjectAccessControl['accessMode'];
}
