/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import {
  type DiscoverAppState,
  PROFILE_APP_STATE_DEFAULT_FIELDS,
  type ProfileAppStateDefaultField,
  type ProfileAppStateDefaultFields,
  type TabState,
} from '../redux';
import type { ScopedProfilesManager } from '../../../../context_awareness';
import { getMergedAccessor } from '../../../../context_awareness';
import { getResolvedProfileColumns } from '../../../../context_awareness/utils/get_resolved_profile_columns';
import type { DataDocumentsMsg } from '../discover_data_state_container';

export const getProfileAppStateDefaults = ({
  scopedProfilesManager,
  profileAppStateDefaults,
  dataView,
}: {
  scopedProfilesManager: ScopedProfilesManager;
  profileAppStateDefaults: TabState['profileAppStateDefaults'];
  dataView: DataView;
}) => {
  const defaultState = getDefaultState(scopedProfilesManager, dataView);

  return {
    /**
     * Returns state that should be updated before data fetching occurs,
     * for example state used as part of the data fetching process
     * @returns The state to reset to before fetching data
     */
    getPreFetchState: () => {
      const stateUpdate: DiscoverAppState = {};

      if (
        shouldResetProfileAppStateDefaultField(profileAppStateDefaults, 'breakdownField') &&
        defaultState.breakdownField !== undefined &&
        dataView.fields.getByName(defaultState.breakdownField)
      ) {
        stateUpdate.breakdownField = defaultState.breakdownField;
      }

      if (
        shouldResetProfileAppStateDefaultField(profileAppStateDefaults, 'hideChart') &&
        defaultState.hideChart !== undefined
      ) {
        stateUpdate.hideChart = defaultState.hideChart;
      }

      if (
        shouldResetProfileAppStateDefaultField(profileAppStateDefaults, 'hideTable') &&
        defaultState.hideTable !== undefined
      ) {
        stateUpdate.hideTable = defaultState.hideTable;
      }

      if (
        shouldResetProfileAppStateDefaultField(profileAppStateDefaults, 'hideSidebar') &&
        defaultState.hideSidebar !== undefined
      ) {
        stateUpdate.hideSidebar = defaultState.hideSidebar;
      }

      return Object.keys(stateUpdate).length ? stateUpdate : undefined;
    },

    /**
     * Returns state that should be updated after data fetching occurs,
     * for example state used to modify the UI after receiving data
     * @returns The state to reset to after fetching data
     */
    getPostFetchState: ({
      defaultColumns,
      esqlQueryColumns,
    }: {
      defaultColumns: string[];
      esqlQueryColumns: DataDocumentsMsg['esqlQueryColumns'];
    }) => {
      const stateUpdate: DiscoverAppState = {};

      if (shouldResetProfileAppStateDefaultField(profileAppStateDefaults, 'columns')) {
        const { columns, grid } = getResolvedProfileColumns({
          profileColumns: defaultState.columns,
          fallbackColumns: defaultState.columns === undefined ? [] : defaultColumns,
          dataView,
          esqlQueryColumns,
        });

        if (columns.length) {
          stateUpdate.grid = grid;
          stateUpdate.columns = columns;
        }
      }

      if (
        shouldResetProfileAppStateDefaultField(profileAppStateDefaults, 'rowHeight') &&
        defaultState.rowHeight !== undefined
      ) {
        stateUpdate.rowHeight = defaultState.rowHeight;
      }

      return Object.keys(stateUpdate).length ? stateUpdate : undefined;
    },
  };
};

export const getFieldsToReset = (
  shouldResetByField: Record<ProfileAppStateDefaultField, boolean>
): ProfileAppStateDefaultFields => {
  const fields = PROFILE_APP_STATE_DEFAULT_FIELDS.filter((field) => shouldResetByField[field]);

  if (fields.length === 0) {
    return 'none';
  }

  if (fields.length === PROFILE_APP_STATE_DEFAULT_FIELDS.length) {
    return 'all';
  }

  const [firstField, ...restFields] = fields;

  return [firstField, ...restFields];
};

const getDefaultState = (scopedProfilesManager: ScopedProfilesManager, dataView: DataView) => {
  const getDefaultAppState = getMergedAccessor(
    scopedProfilesManager.getProfiles(),
    'getDefaultAppState',
    () => ({})
  );

  return getDefaultAppState({ dataView });
};

export const shouldResetProfileAppStateDefaultField = (
  profileAppStateDefaults: TabState['profileAppStateDefaults'],
  field: ProfileAppStateDefaultField
) =>
  profileAppStateDefaults.fieldsToReset === 'all' ||
  (profileAppStateDefaults.fieldsToReset !== 'none' &&
    profileAppStateDefaults.fieldsToReset.includes(field));
