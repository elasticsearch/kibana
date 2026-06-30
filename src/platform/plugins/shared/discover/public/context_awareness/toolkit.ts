/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import type { OpenInNewTabParams, UpdateESQLQueryFn } from './types';
import type { ProfileStateAdapter, ProfileStateDefinition } from './profile_state';

/**
 * Host-provided actions that profiles can use in extension point implementations.
 *
 * Each action is optional because availability depends on the current host surface
 * and the capabilities it chooses to expose.
 */
export interface ContextAwarenessToolkitActions {
  /**
   * Opens a Discover session in a new tab.
   */
  openInNewTab?: (params: OpenInNewTabParams) => Promise<void>;
  /**
   * Replaces the current ES|QL query.
   */
  updateESQLQuery?: UpdateESQLQueryFn;
  /**
   * Triggers a data reload for the current view.
   */
  refreshData?: () => void;
  /**
   * Adds a simple filter in either classic or ES|QL mode.
   */
  addFilter?: DocViewFilterFn;
  /**
   * Replaces the set of ad hoc data views available to the current session.
   */
  updateAdHocDataViews?: (adHocDataViews: DataView[]) => Promise<void>;
  /**
   * Opens or updates the expanded document flyout.
   */
  setExpandedDoc?: (record?: DataTableRecord, options?: { initialTabId?: string }) => void;
}

/**
 * Toolkit injected into profiles by the host application.
 */
export interface ContextAwarenessToolkit {
  /**
   * Optional host actions made available to profile implementations.
   */
  readonly actions: ContextAwarenessToolkitActions;
  /**
   * Returns host-scoped profile state for the requested definition.
   */
  readonly getStateAdapter: <TState extends object>(
    definition: ProfileStateDefinition<TState>
  ) => ProfileStateAdapter<TState>;
}

/**
 * Default toolkit used when no host actions are available.
 */
export const EMPTY_CONTEXT_AWARENESS_TOOLKIT: ContextAwarenessToolkit = {
  actions: {},
  getStateAdapter: () => {
    throw new Error('No profile state adapter is available in the empty toolkit.');
  },
};
