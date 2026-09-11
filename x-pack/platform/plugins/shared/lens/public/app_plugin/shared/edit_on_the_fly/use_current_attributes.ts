/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useMemo } from 'react';
import type { TypedLensSerializedState } from '@kbn/lens-common';
import { createEmptyLensState } from '../../../react_embeddable/helper';
import { selectAdHocDataViews, useLensSelector } from '../../../state_management';
import { extractReferencesFromState } from '../../../utils';
import { useEditorFrameService } from '../../../editor_frame_service/editor_frame_service_context';

export const useCurrentAttributes = ({
  initialAttributes,
}: {
  initialAttributes?: TypedLensSerializedState['attributes'];
}) => {
  const { visualizationMap, datasourceMap } = useEditorFrameService();

  const { datasourceStates, visualization, activeDatasourceId } = useLensSelector(
    (state) => state.lens
  );
  const sessionAdHocDataViews = useLensSelector(selectAdHocDataViews);

  // use the latest activeId, but fallback to attributes
  const visualizationType = visualization.activeId ?? initialAttributes?.visualizationType;
  const activeVisualization = visualizationType ? visualizationMap[visualizationType] : undefined;

  const currentAttributes = useMemo(() => {
    if (!activeVisualization) {
      return initialAttributes;
    }
    // The editor store initializes every datasource in the map, so a pure
    // form-based panel still carries an empty textBased state (and vice versa).
    // Serializing such empty states would make consumers like
    // getActiveDatasourceIdFromDoc misdetect the chart's datasource.
    const dsStates = Object.fromEntries(
      Object.entries(datasourceStates)
        .filter(([, ds]) => !isEmptyLayeredState(ds.state))
        .map(([id, ds]) => {
          const dsState = ds.state;
          return [id, dsState];
        })
    );
    // ES|QL layers use adHoc dataviews whose ids are not saved objects, so their
    // references must not be persisted as top-level references. They still need to
    // be resolvable at load time though (e.g. a form-based reference line layer
    // sharing the chart's ad hoc data view), so they move to internalReferences —
    // mirroring mergeToNewDoc. All other references (saved data views used by
    // form-based or query annotation layers) stay in references.
    const adHocDataViewIds = new Set([
      ...Object.keys(initialAttributes?.state.adHocDataViews ?? {}),
      ...Object.keys(sessionAdHocDataViews),
    ]);
    const allReferences = visualization.state
      ? extractReferencesFromState({
          activeDatasourceId,
          activeDatasources: Object.keys(datasourceStates).reduce(
            (acc, id) => ({
              ...acc,
              [id]: datasourceMap[id],
            }),
            {}
          ),
          datasourceStates,
          visualizationState: visualization.state,
          activeVisualization,
        })
      : [];
    const isAdHocRef = (ref: { type: string; id: string }) =>
      ref.type === 'index-pattern' && adHocDataViewIds.has(ref.id);
    const references = allReferences.filter((ref) => !isAdHocRef(ref));
    const internalReferences = allReferences.filter(isAdHocRef);
    const attributes = initialAttributes ?? createEmptyLensState().attributes;
    const attrs: TypedLensSerializedState['attributes'] = {
      ...attributes,
      state: {
        ...attributes.state,
        visualization: visualization.state,
        datasourceStates: dsStates,
        // include ad hoc data views created during the editing session (e.g. for
        // a new reference line layer) that are not persisted yet
        adHocDataViews: {
          ...attributes.state.adHocDataViews,
          ...sessionAdHocDataViews,
        },
        internalReferences,
      },
      references,
      visualizationType: activeVisualization.id,
    };
    return attrs;
  }, [
    activeDatasourceId,
    activeVisualization,
    datasourceMap,
    datasourceStates,
    initialAttributes,
    sessionAdHocDataViews,
    visualization.state,
  ]);

  return currentAttributes;
};

/**
 * True when a datasource state has a `layers` record with no entries, i.e. it was
 * initialized by the store but holds no data.
 */
const isEmptyLayeredState = (state: unknown): boolean => {
  if (!state || typeof state !== 'object' || !('layers' in state)) {
    return false;
  }
  const { layers } = state as { layers: unknown };
  return (
    layers !== null &&
    typeof layers === 'object' &&
    !Array.isArray(layers) &&
    Object.keys(layers).length === 0
  );
};
