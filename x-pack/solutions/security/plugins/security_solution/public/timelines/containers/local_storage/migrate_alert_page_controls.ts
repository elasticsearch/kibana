/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { ControlGroupRuntimeState, ControlPanelState } from '@kbn/control-group-renderer';
import type { OptionsListDSLControlState } from '@kbn/controls-schemas';
import {
  DEFAULT_DSL_OPTIONS_LIST_STATE,
  DEFAULT_PINNED_CONTROL_STATE,
  OPTIONS_LIST_CONTROL,
} from '@kbn/controls-constants';
import type { StartPlugins } from '../../../types';

export const GET_PAGE_FILTER_STORAGE_KEY = (spaceId: string = 'default') =>
  `siem.${spaceId}.pageFilters`;

interface OldFormat {
  viewMode: string;
  id: string;
  panels: {
    [key: string]: {
      type: string;
      order: number;
      grow: boolean;
      width: string;
      explicitInput: {
        id: string;
        dataViewId: string;
        fieldName: string;
        title: string;
        hideExclude: boolean;
        hideSort: boolean;
        hidePanelTitles: boolean;
        placeholder: string;
        ignoreParentSettings: {
          ignoreValidations: boolean;
        };
        selectedOptions: string[];
        hideActionBar: boolean;
        persist: boolean;
        hideExists: boolean;
        existsSelected: boolean;
        exclude: boolean;
      };
    };
  };
  defaultControlWidth: string;
  defaultControlGrow: boolean;
  controlStyle: string;
  chainingSystem: string;
  showApplySelections: boolean;
  ignoreParentSettings: {
    ignoreFilters: boolean;
    ignoreQuery: boolean;
    ignoreTimerange: boolean;
    ignoreValidations: boolean;
  };
  timeRange: {
    from: string;
    to: string;
    mode: string;
  };
  filters: Array<{
    meta: {
      alias: null;
      negate: boolean;
      disabled: boolean;
      type: string;
      key: string;
      index: string;
    };
    query: {
      exists: {
        field: string;
      };
    };
  }>;
  query: {
    query: string;
  };
}

export type NewFormatExplicitInput = OptionsListDSLControlState & {
  persist: boolean;
};

/**
 * Ref PR : https://github.com/elastic/kibana/pull/190561
 *
 * The above PR breaks the local storage format of page filters controls.
 * This migration script is to migrate the old format to the new format.
 *
 */
export async function migrateAlertPageControlsTo816(storage: Storage, plugins: StartPlugins) {
  const space = await plugins.spaces?.getActiveSpace();
  const spaceId = space?.id ?? 'default';
  const storageKey = GET_PAGE_FILTER_STORAGE_KEY(spaceId);
  const oldFormat: OldFormat = storage.get(GET_PAGE_FILTER_STORAGE_KEY(spaceId));
  if (oldFormat && Object.keys(oldFormat).includes('panels')) {
    // Only run when it is old format
    const newFormat: ControlGroupRuntimeState<NewFormatExplicitInput> = {
      initialChildControlState: {},
      ignoreParentSettings: oldFormat.ignoreParentSettings,
    };

    for (const [key, value] of Object.entries(oldFormat.panels)) {
      newFormat.initialChildControlState[key] = {
        ...DEFAULT_PINNED_CONTROL_STATE,
        ...DEFAULT_DSL_OPTIONS_LIST_STATE,
        type: OPTIONS_LIST_CONTROL,
        order: value.order,
        display_settings: {
          hide_exclude: value.explicitInput.hideExclude ?? true,
          hide_sort: value.explicitInput.hideSort ?? true,
          placeholder: value.explicitInput.placeholder ?? '',
          hide_action_bar: value.explicitInput.hideActionBar ?? false,
          hide_exists: value.explicitInput.hideExists ?? false,
        },
        width: value.width as ControlPanelState['width'],
        data_view_id: value.explicitInput.dataViewId ?? 'security_solution_alerts_dv',
        title: value.explicitInput.title,
        field_name: value.explicitInput.fieldName,
        selected_options:
          value.explicitInput.selectedOptions ?? DEFAULT_DSL_OPTIONS_LIST_STATE.selected_options,
        persist: value.explicitInput.persist ?? false,
      } as ControlPanelState<NewFormatExplicitInput>;
    }

    storage.set(storageKey, newFormat);
  }
}
