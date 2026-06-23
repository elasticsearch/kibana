/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import type { Reference } from '@kbn/content-management-utils';
import type {
  LegacyStoredDataControlState,
  StrictDataControlState,
  DataControlState,
} from '@kbn/controls-schemas';
import { ControlValuesSource, DEFAULT_DATA_CONTROL_STATE } from '@kbn/controls-constants';
import { DATA_VIEW_SAVED_OBJECT_TYPE } from '@kbn/data-views-plugin/common';
import { convertCamelCasedKeysToSnakeCase } from '@kbn/presentation-publishing';

type FieldDataControlState = Extract<
  StrictDataControlState,
  { values_source: ControlValuesSource.FIELD }
>;
type EsqlDataControlState<T> = Extract<
  StrictDataControlState,
  { values_source: ControlValuesSource.ESQL }
> &
  Omit<T, keyof StrictDataControlState>;

type StoredFieldDataControlState<T> = Omit<FieldDataControlState, 'data_view_id'> & {
  dataViewRefName: string;
} & Omit<T, keyof StrictDataControlState>;

export function transformDataControlIn<StoredStateType extends DataControlState>(
  state: DataControlState,
  referenceName: string
): {
  state: StoredFieldDataControlState<StoredStateType> | EsqlDataControlState<StoredStateType>;
  references?: Reference[];
} {
  if (state.values_source === ControlValuesSource.ESQL) {
    return {
      state: omit(state, 'data_view_id', 'field_name') as EsqlDataControlState<StoredStateType>,
    };
  }

  const { data_view_id } = state as FieldDataControlState;
  return {
    state: {
      ...omit(state, 'data_view_id', 'esql_query'),
      dataViewRefName: referenceName,
    } as StoredFieldDataControlState<StoredStateType>,
    references: [
      {
        name: referenceName,
        type: DATA_VIEW_SAVED_OBJECT_TYPE,
        id: data_view_id,
      },
    ],
  };
}

export function transformDataControlOut<
  StoredStateType extends Partial<LegacyStoredDataControlState & StrictDataControlState>
>(
  id: string | undefined,
  state: StoredStateType,
  refNames: Readonly<string[]>,
  panelReferences: Reference[] = [],
  containerReferences: Reference[] = []
): StrictDataControlState {
  if (state.values_source === ControlValuesSource.ESQL) {
    const { title, esql_query, use_global_filters, ignore_validations } = state;
    const convertedState = {
      ...DEFAULT_DATA_CONTROL_STATE,
      values_source: ControlValuesSource.ESQL,
      title,
      esql_query: esql_query ?? '',
      ...(typeof use_global_filters === 'boolean' && { use_global_filters }),
      ...(typeof ignore_validations === 'boolean' && { ignore_validations }),
    } as EsqlDataControlState<StoredStateType>;

    ensureRequiredFields(convertedState);
    return convertedState;
  }

  // Anything without `values_source === 'esql'` is treated as a field-sourced control —
  // including legacy data written before the discriminator existed.
  const references = [...containerReferences, ...panelReferences];
  let { dataViewRefName } = state;
  let dataViewRef: Reference | undefined;
  if (!dataViewRefName && id) {
    // backwards compatibility for when we didn't store the ref name with the saved object (<9.4)
    for (const refName of refNames) {
      dataViewRefName = getLegacyReferenceName(id, refName);
      dataViewRef = references.find(({ name }) => name === dataViewRefName);
      if (dataViewRef) break;
    }
  } else {
    dataViewRef = references.find(({ name }) => name === dataViewRefName);
  }

  /**
   * Pre 9.4 the control state was stored in camelCase; these transforms ensure they are converted to snake_case
   */
  const { title, use_global_filters, ignore_validations, field_name, data_view_id } =
    convertCamelCasedKeysToSnakeCase<LegacyStoredDataControlState>(
      state as LegacyStoredDataControlState
    );

  const dataViewId = dataViewRef?.id ?? data_view_id ?? '';
  const convertedState = {
    ...DEFAULT_DATA_CONTROL_STATE,
    values_source: ControlValuesSource.FIELD,
    data_view_id: dataViewId,
    ...(title && { title }),
    field_name: field_name ?? '',
    ...(typeof use_global_filters === 'boolean' && { use_global_filters }),
    ...(typeof ignore_validations === 'boolean' && { ignore_validations }),
  } as FieldDataControlState;

  ensureRequiredFields(convertedState);
  return convertedState;
}

function getLegacyReferenceName(controlId: string, refName: string) {
  return `controlGroup_${controlId}:${refName}`;
}

const ensureRequiredFields = (state: StrictDataControlState) => {
  if (state.values_source === ControlValuesSource.ESQL) {
    if (!state.esql_query.length) {
      throw new Error('Must include a non-empty ES|QL query');
    }
    return;
  }

  if (!state.data_view_id.length) {
    throw new Error('Must include a non-empty data view ID');
  }
  if (!state.field_name.length) {
    throw new Error('Must include a non-empty field name');
  }
};
