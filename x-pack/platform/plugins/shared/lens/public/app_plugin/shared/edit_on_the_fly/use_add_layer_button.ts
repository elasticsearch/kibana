/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement } from 'react';
import { useCallback, useMemo } from 'react';

import type { CoreStart } from '@kbn/core/public';
import {
  LENS_DATASOURCE_ID,
  LENS_LAYER_TYPES,
  type AddLayerFunction,
  type FramePublicAPI,
  type LensDatasourceId,
} from '@kbn/lens-common';

import type { LensPluginStartDependencies } from '../../../plugin';
import { createIndexPatternService } from '../../../data_views_service/service';
import { useEditorFrameService } from '../../../editor_frame_service/editor_frame_service_context';
import type { LayerPanelProps } from '../../../editor_frame_service/editor_frame/config_panel/types';
import {
  addLayer as addLayerAction,
  changeIndexPattern,
  registerLibraryAnnotationGroup,
  setSelectedLayerId,
  updateIndexPatterns,
  useLensDispatch,
  useLensSelector,
} from '../../../state_management';
import { replaceIndexpattern } from '../../../state_management/lens_slice';
import { generateId } from '../../../id_generator';
import { isEsqlChart } from '../../../utils';

export const getDatasourceIdForNewLayer = (
  layerType: Parameters<AddLayerFunction>[0],
  selectedLayerDatasourceId: LensDatasourceId | undefined,
  isEsql: boolean
): LensDatasourceId | undefined => {
  if (layerType === LENS_LAYER_TYPES.REFERENCELINE) {
    return LENS_DATASOURCE_ID.FORM_BASED;
  }
  // On ES|QL charts only helper layers (reference lines / annotations) are
  // form-based; a new data layer must stay text-based even when a form-based
  // helper layer is currently selected, otherwise the chart ends up with
  // unsupported mixed ES|QL / non-ES|QL data layers.
  if (isEsql && layerType === LENS_LAYER_TYPES.DATA) {
    return LENS_DATASOURCE_ID.TEXT_BASED;
  }
  return selectedLayerDatasourceId;
};

export const useAddLayerButton = (
  framePublicAPI: FramePublicAPI,
  coreStart: CoreStart,
  dataViews: LensPluginStartDependencies['dataViews'],
  uiActions: LensPluginStartDependencies['uiActions'],
  setIsInlineFlyoutVisible: (flag: boolean) => void
): ReactElement | null => {
  const { visualizationMap } = useEditorFrameService();
  const { visualization, datasourceStates } = useLensSelector((state) => state.lens);
  const dispatchLens = useLensDispatch();

  const activeVisualization = visualization.activeId
    ? visualizationMap[visualization.activeId]
    : null;

  const indexPatternService = useMemo(
    () =>
      createIndexPatternService({
        dataViews,
        uiActions,
        core: coreStart,
        updateIndexPatterns: (newIndexPatternsState, options) => {
          dispatchLens(updateIndexPatterns(newIndexPatternsState));
        },
        replaceIndexPattern: (newIndexPattern, oldId, options) => {
          dispatchLens(replaceIndexpattern({ newIndexPattern, oldId }));
        },
      }),
    [coreStart, dispatchLens, dataViews, uiActions]
  );

  const addLayer: AddLayerFunction = useCallback(
    (layerType, extraArg, ignoreInitialValues, seriesType) => {
      const layerId = generateId();
      const selectedLayerDatasourceId = (
        visualization.selectedLayerId
          ? framePublicAPI.datasourceLayers[visualization.selectedLayerId]?.datasourceId
          : undefined
      ) as LensDatasourceId | undefined;
      const datasourceId = getDatasourceIdForNewLayer(
        layerType,
        selectedLayerDatasourceId,
        isEsqlChart(framePublicAPI.datasourceLayers)
      );

      dispatchLens(
        addLayerAction({
          layerId,
          layerType,
          extraArg,
          ignoreInitialValues,
          seriesType,
          datasourceId,
        })
      );
      dispatchLens(setSelectedLayerId({ layerId }));
    },
    [dispatchLens, framePublicAPI.datasourceLayers, visualization.selectedLayerId]
  );

  const registerLibraryAnnotationGroupFunction = useCallback<
    LayerPanelProps['registerLibraryAnnotationGroup']
  >((groupInfo) => dispatchLens(registerLibraryAnnotationGroup(groupInfo)), [dispatchLens]);

  return useMemo(() => {
    return (
      activeVisualization?.getAddLayerButtonComponent?.({
        state: visualization.state,
        supportedLayers: activeVisualization.getSupportedLayers(
          visualization.state,
          framePublicAPI
        ),
        addLayer,
        ensureIndexPattern: async (specOrId) => {
          let indexPatternId;

          if (typeof specOrId === 'string') {
            indexPatternId = specOrId;
          } else {
            const dataView = await dataViews.create(specOrId);

            if (!dataView.id) {
              return;
            }

            indexPatternId = dataView.id;
          }

          const newIndexPatterns = await indexPatternService?.ensureIndexPattern({
            id: indexPatternId,
            cache: framePublicAPI.dataViews.indexPatterns,
          });

          if (newIndexPatterns) {
            dispatchLens(
              changeIndexPattern({
                dataViews: { indexPatterns: newIndexPatterns },
                datasourceIds: Object.keys(datasourceStates),
                visualizationIds: visualization.activeId ? [visualization.activeId] : [],
                indexPatternId,
              })
            );
          }
        },
        registerLibraryAnnotationGroup: registerLibraryAnnotationGroupFunction,
        isInlineEditing: Boolean(setIsInlineFlyoutVisible),
        // annotation library groups are data-view-based and not supported on ES|QL charts
        hideAnnotationLibrary: isEsqlChart(framePublicAPI.datasourceLayers),
      }) ?? null
    );
  }, [
    activeVisualization,
    addLayer,
    datasourceStates,
    dispatchLens,
    indexPatternService,
    dataViews,
    framePublicAPI,
    setIsInlineFlyoutVisible,
    registerLibraryAnnotationGroupFunction,
    visualization.activeId,
    visualization.state,
  ]);
};
