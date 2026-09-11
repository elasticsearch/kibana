/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StateComparators, WithAllKeys } from '@kbn/presentation-publishing';
import { diffComparators, initializeStateManager } from '@kbn/presentation-publishing';
import { BehaviorSubject } from 'rxjs';
import { combineLatestWith, debounceTime, map, startWith } from 'rxjs';
import type { DashboardState, DashboardOptions } from '@kbn/as-code-dashboard-schema';
import { DEFAULT_DASHBOARD_OPTIONS } from '../../common/constants';
import { coreServices, screenshotModeService } from '../services/kibana_services';

export type DashboardSettings = Required<DashboardOptions> & {
  description?: DashboardState['description'];
  tags: DashboardState['tags'];
  time_restore: boolean;
  project_routing_restore: boolean;
  title: DashboardState['title'];
};

const DEFAULT_SETTINGS: WithAllKeys<DashboardSettings> = {
  ...DEFAULT_DASHBOARD_OPTIONS,
  description: undefined,
  tags: [],
  time_restore: false,
  project_routing_restore: false,
  title: '',
};

const comparators: StateComparators<DashboardSettings> = {
  title: 'referenceEquality',
  description: 'referenceEquality',
  hide_panel_titles: 'referenceEquality',
  hide_panel_borders: 'referenceEquality',
  sync_colors: 'referenceEquality',
  sync_cursor: 'referenceEquality',
  sync_tooltips: 'referenceEquality',
  auto_apply_filters: 'referenceEquality',
  time_restore: 'referenceEquality',
  use_margins: 'referenceEquality',
  project_routing_restore: 'referenceEquality',
  tags: 'deepEquality',
};

function deserializeState(state: DashboardState) {
  return {
    ...state.options,
    description: state.description,
    tags: state.tags,
    time_restore: Boolean(state.time_range),
    project_routing_restore: Boolean(state.project_routing),
    title: state.title,
  };
}

export function initializeSettingsManager(initialState: DashboardState) {
  const stateManager = initializeStateManager(
    deserializeState(initialState),
    DEFAULT_SETTINGS,
    comparators
  );

  const deferBelowFold = coreServices.uiSettings.get('labs:dashboard:deferBelowFold', false);
  // disable defer below fold with reporting
  // can not check viewMode === 'print' because viewMode is only "print" when print format is enabled
  const getFetchOnlyVisible = () =>
    screenshotModeService.isScreenshotMode() ? false : deferBelowFold;
  const fetchOnlyVisible$ = new BehaviorSubject<boolean>(getFetchOnlyVisible());

  function serializeSettings() {
    const { description, tags, time_restore, project_routing_restore, title, ...options } =
      stateManager.getLatestState();
    return {
      ...(description && { description }),
      tags,
      title,
      options,
    };
  }

  return {
    api: {
      fetchOnlyVisible$,
      setTags: stateManager.api.setTags,
      getSettings: stateManager.getLatestState,
      setSettings: (settings: Partial<DashboardSettings>) => {
        stateManager.reinitializeState({
          ...stateManager.getLatestState(),
          ...settings,
        });
      },
      projectRoutingRestore$: stateManager.api.projectRoutingRestore$,
      title$: stateManager.api.title$,
      description$: stateManager.api.description$,
      timeRestore$: stateManager.api.timeRestore$,
      hideTitle$: stateManager.api.hidePanelTitles$,
      hideBorder$: stateManager.api.hidePanelBorders$,
      settings: {
        autoApplyFilters$: stateManager.api.autoApplyFilters$,
        syncColors$: stateManager.api.syncColors$,
        syncCursor$: stateManager.api.syncCursor$,
        syncTooltips$: stateManager.api.syncTooltips$,
        useMargins$: stateManager.api.useMargins$,
      },
    },
    internalApi: {
      anyStateChange$: stateManager.anyStateChange$,
      serializeSettings,
      startComparing: (lastSavedState$: BehaviorSubject<DashboardState>) => {
        return stateManager.anyStateChange$.pipe(
          // anyStateChange$ does not emit on subscribe
          // use startWith to compare unsaved changes on subscribe
          startWith(undefined),
          debounceTime(100),
          map(() => stateManager.getLatestState()),
          combineLatestWith(lastSavedState$.pipe(map((lastSaved) => deserializeState(lastSaved)))),
          map(([latestState, lastSavedState]) => {
            const {
              description,
              tags,

              time_restore,

              project_routing_restore,
              title,
              ...optionDiffs
            } = diffComparators(comparators, lastSavedState, latestState, DEFAULT_SETTINGS);
            // options needs to contain all values and not just diffs since is spread into saved state
            const options = Object.keys(optionDiffs).length
              ? { ...serializeSettings().options, ...optionDiffs }
              : undefined;
            return {
              ...(description && { description }),
              ...(tags && { tags }),
              ...(title && { title }),
              ...(typeof time_restore === 'boolean' && { time_restore }),
              ...(typeof project_routing_restore === 'boolean' && { project_routing_restore }),
              ...(options && { options }),
            };
          })
        );
      },
      reset: (lastSavedState: DashboardState) => {
        stateManager.reinitializeState(deserializeState(lastSavedState));
      },
    },
  };
}
