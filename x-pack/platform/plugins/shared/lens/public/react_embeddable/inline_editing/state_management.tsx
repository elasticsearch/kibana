/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FilterManager } from '@kbn/data-plugin/public';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import type {
  DatasourceStates,
  VisualizationMap,
  DatasourceMap,
  TypedLensSerializedState,
  LensDatasourceId,
} from '@kbn/lens-common';
import { mergeToNewDoc } from '../../state_management/shared_logic';
import { getActiveDatasourceIdFromDoc } from '../../utils';

export function getStateManagementForInlineEditing(
  initialDatasourceId: LensDatasourceId,
  getAttributes: () => TypedLensSerializedState['attributes'],
  updateAttributes: (
    newAttributes: TypedLensSerializedState['attributes'],
    resetId?: boolean
  ) => void,
  visualizationMap: VisualizationMap,
  datasourceMap: DatasourceMap,
  extractFilterReferences: FilterManager['extract']
) {
  const resolveActiveDatasourceId = (explicit?: LensDatasourceId): LensDatasourceId => {
    return explicit ?? getActiveDatasourceIdFromDoc(getAttributes()) ?? initialDatasourceId;
  };

  const updatePanelState = (
    datasourceState: unknown,
    visualizationState: unknown,
    visualizationType?: string,
    datasourceId?: LensDatasourceId,
    allDatasourceStates?: DatasourceStates,
    adHocDataViews?: Record<string, DataViewSpec>
  ) => {
    const vis = getAttributes();
    const activeDatasourceId = resolveActiveDatasourceId(datasourceId);
    // drop loading/uninitialized entries so they never get serialized into the attributes
    const loadedDatasourceStates: DatasourceStates = Object.fromEntries(
      Object.entries(allDatasourceStates ?? {}).filter(
        ([, { isLoading, state }]) => !isLoading && state !== null && state !== undefined
      )
    );
    // the active datasource must be the *first* key: getActiveDatasourceIdFromDoc
    // resolves the active datasource from the first key of the serialized states
    const { [activeDatasourceId]: _active, ...otherLoadedDatasourceStates } =
      loadedDatasourceStates;
    const datasourceStates: DatasourceStates = {
      // always guarantee the active datasource state is present
      [activeDatasourceId]: {
        isLoading: false,
        state: datasourceState,
      },
      ...otherLoadedDatasourceStates,
    };
    const newVis = mergeToNewDoc(
      vis,
      {
        activeId: visualizationType || vis.visualizationType,
        state: visualizationState,
        selectedLayerId: null,
      },
      datasourceStates,
      vis.state.query,
      vis.state.filters,
      activeDatasourceId,
      // Prefer the live ad hoc data views from the editing session: layers added
      // in the flyout (e.g. reference lines) may use ad hoc data views that are
      // not part of the previously persisted attributes yet.
      { ...vis.state.adHocDataViews, ...adHocDataViews },
      { visualizationMap, datasourceMap, extractFilterReferences }
    );
    const newDoc: TypedLensSerializedState['attributes'] = {
      ...vis,
      ...newVis,
      visualizationType: newVis?.visualizationType ?? vis.visualizationType,
    };

    if (newDoc.state) {
      updateAttributes(newDoc, true);
    }
  };

  const updateSuggestion = updateAttributes;

  return { updateSuggestion, updatePanelState };
}
