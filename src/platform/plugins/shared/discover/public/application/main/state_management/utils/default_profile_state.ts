/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { DiscoverGridSettings } from '@kbn/saved-search-plugin/common';
import { uniqBy } from 'lodash';
import {
  type DiscoverAppState,
  DEFAULT_PROFILE_STATE_FIELDS,
  type DefaultProfileStateField,
  type DefaultProfileStateFields,
  type TabState,
} from '../redux';
import type { DefaultAppStateColumn, ScopedProfilesManager } from '../../../../context_awareness';
import { getMergedAccessor } from '../../../../context_awareness';
import type { DataDocumentsMsg } from '../discover_data_state_container';

export const getDefaultProfileState = ({
  scopedProfilesManager,
  defaultProfileState,
  dataView,
}: {
  scopedProfilesManager: ScopedProfilesManager;
  defaultProfileState: TabState['defaultProfileState'];
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
        shouldResetDefaultProfileField(defaultProfileState, 'breakdownField') &&
        defaultState.breakdownField !== undefined &&
        dataView.fields.getByName(defaultState.breakdownField)
      ) {
        stateUpdate.breakdownField = defaultState.breakdownField;
      }

      if (
        shouldResetDefaultProfileField(defaultProfileState, 'hideChart') &&
        defaultState.hideChart !== undefined
      ) {
        stateUpdate.hideChart = defaultState.hideChart;
      }

      if (
        shouldResetDefaultProfileField(defaultProfileState, 'hideTable') &&
        defaultState.hideTable !== undefined
      ) {
        stateUpdate.hideTable = defaultState.hideTable;
      }

      if (
        shouldResetDefaultProfileField(defaultProfileState, 'hideSidebar') &&
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

      if (shouldResetDefaultProfileField(defaultProfileState, 'columns')) {
        const mappedDefaultColumns = defaultColumns.map((name) => ({ name }));
        const isValidColumn = getIsValidColumn(dataView, esqlQueryColumns);
        const validColumns = uniqBy(
          defaultState.columns?.concat(mappedDefaultColumns).filter(isValidColumn),
          'name'
        );

        if (validColumns?.length) {
          const hasAutoWidthColumn = validColumns.some(({ width }) => !width);
          const columns = validColumns.reduce<DiscoverGridSettings['columns']>(
            (acc, { name, width }, index) => {
              // Ensure there's at least one auto width column so the columns fill the grid
              const skipColumnWidth = !hasAutoWidthColumn && index === validColumns.length - 1;
              return width && !skipColumnWidth ? { ...acc, [name]: { width } } : acc;
            },
            undefined
          );

          stateUpdate.grid = columns ? { columns } : undefined;
          stateUpdate.columns = validColumns.map(({ name }) => name);
        }
      }

      if (
        shouldResetDefaultProfileField(defaultProfileState, 'rowHeight') &&
        defaultState.rowHeight !== undefined
      ) {
        stateUpdate.rowHeight = defaultState.rowHeight;
      }

      return Object.keys(stateUpdate).length ? stateUpdate : undefined;
    },
  };
};

export const getFieldsToReset = (
  shouldResetByField: Record<DefaultProfileStateField, boolean>
): DefaultProfileStateFields => {
  const fields = DEFAULT_PROFILE_STATE_FIELDS.filter((field) => shouldResetByField[field]);

  if (fields.length === 0) {
    return 'none';
  }

  if (fields.length === DEFAULT_PROFILE_STATE_FIELDS.length) {
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

const shouldResetDefaultProfileField = (
  defaultProfileState: TabState['defaultProfileState'],
  field: DefaultProfileStateField
) =>
  defaultProfileState.fieldsToReset === 'all' ||
  (defaultProfileState.fieldsToReset !== 'none' &&
    defaultProfileState.fieldsToReset.includes(field));

const getIsValidColumn =
  (dataView: DataView, esqlQueryColumns: DataDocumentsMsg['esqlQueryColumns']) =>
  (column: DefaultAppStateColumn) => {
    const isValid = esqlQueryColumns
      ? esqlQueryColumns.some((esqlColumn) => esqlColumn.name === column.name)
      : dataView.fields.getByName(column.name);

    return Boolean(isValid);
  };
