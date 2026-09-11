/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Filter, Query } from '@kbn/es-query';
import type { ViewMode } from '@kbn/presentation-publishing';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';

/**
 * Capabilities object for the Dashboard application.
 * Defines the permissions available for dashboard operations.
 */
export interface DashboardCapabilities {
  /** Whether the user can see write controls (edit, save, etc.). */
  showWriteControls: boolean;
  /** Whether the user can create new dashboards. */
  createNew: boolean;
  /** Whether the user can view dashboards. */
  show: boolean;
  /** Additional capability flags. */
  [key: string]: boolean;
}

/**
 * Parameters for the dashboard locator.
 * Used to navigate to a specific dashboard with optional state.
 */
export type DashboardLocatorParams = Partial<
  Omit<DashboardState, 'filters' | 'query'> & {
    /**
     * Filters to apply. Pinned-ness is encoded on each filter (`$state.store`).
     */
    filters?: Filter[];
    query?: Query;
    viewMode?: ViewMode;

    /**
     * If provided, the dashboard with this id will be loaded. If not given, new, unsaved dashboard will be loaded.
     */
    dashboardId?: string;

    /**
     * Determines whether to hash the contents of the url to avoid url length issues. Defaults to the uiSettings configuration for `storeInSessionStorage`.
     */
    useHash?: boolean;

    /**
     * Denotes whether to merge provided filters from the locator state with the filters saved into the Dashboard.
     * When false, the saved filters will be overwritten. Defaults to true.
     */
    preserveSavedFilters?: boolean;

    /**
     * Search search session ID to restore.
     * (Background search)
     */
    searchSessionId?: string;
  }
>;
