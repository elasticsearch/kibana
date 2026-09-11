/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, memo, useCallback } from 'react';
import { EuiForm, euiBreakpoint, useEuiTheme } from '@elastic/eui';
import type { ActionExecutionContext } from '@kbn/ui-actions-plugin/public';
import { UPDATE_FILTER_REFERENCES_ACTION } from '@kbn/unified-search-plugin/public';

import type { DragDropIdentifier, DropType } from '@kbn/dom-drag-drop';
import { css } from '@emotion/react';
import type { AddLayerFunction, DragDropOperation, Visualization } from '@kbn/lens-common';
import { UPDATE_FILTER_REFERENCES_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { DRAG_DROP_EXTRA_TARGETS_WIDTH, DRAG_DROP_EXTRA_TARGETS_PADDING } from '@kbn/lens-common';
import {
  changeIndexPattern,
  onDropToDimension,
  removeDimension,
} from '../../../state_management/lens_slice';
import { LayerPanel } from './layer_panel';
import { generateId } from '../../../id_generator';
import type { ConfigPanelWrapperProps, LayerPanelProps } from './types';
import {
  setLayerDefaultDimension,
  setDimensionAndUpdateDatasource,
  useLensDispatch,
  removeOrClearLayer,
  cloneLayer,
  addLayer as addLayerAction,
  updateDatasourceState,
  updateVisualizationState,
  setToggleFullscreen,
  useLensSelector,
  selectVisualization,
  selectSelectedLayerId,
  registerLibraryAnnotationGroup,
  selectCanEditTextBasedQuery,
} from '../../../state_management';
import { useEditorFrameService } from '../../editor_frame_service_context';
import { LENS_LAYER_TABS_CONTENT_ID } from '../../../app_plugin/shared/edit_on_the_fly/layer_tabs';

export const ConfigPanelWrapper = memo(function ConfigPanelWrapper(props: ConfigPanelWrapperProps) {
  const { visualizationMap } = useEditorFrameService();
  const visualization = useLensSelector(selectVisualization);

  const activeVisualization = visualization.activeId
    ? visualizationMap[visualization.activeId]
    : null;

  return activeVisualization && visualization.state ? (
    <ConfigPanel {...props} activeVisualization={activeVisualization} />
  ) : null;
});

export function ConfigPanel(
  props: ConfigPanelWrapperProps & {
    activeVisualization: Visualization;
  }
) {
  const { datasourceMap } = useEditorFrameService();
  const { activeVisualization, indexPatternService } = props;
  const canEditTextBasedQuery = useLensSelector(selectCanEditTextBasedQuery);
  const { activeDatasourceId, visualization, datasourceStates } = useLensSelector(
    (state) => state.lens
  );
  const selectedLayerIdFromState = useLensSelector(selectSelectedLayerId);

  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;

  const dispatchLens = useLensDispatch();

  const layerIds = useMemo(
    () => activeVisualization.getLayerIds(visualization.state),
    [activeVisualization, visualization.state]
  );

  // Determine if there is only one layer, or if multiple layers exist but only one is visible.
  // This avoids some rerendering when there's just one layer but the selectedLayerId hadn't been set yet.
  const { isOnlyLayer, selectedLayerId } = useMemo(() => {
    if (layerIds.length === 1) {
      return { isOnlyLayer: true, selectedLayerId: layerIds[0] };
    }

    const visibleLayerIds = layerIds.filter((id) => {
      const config = activeVisualization.getConfiguration({
        layerId: id,
        frame: props.framePublicAPI,
        state: visualization.state,
      });
      return !config.hidden;
    });

    const isOnlyVisibleLayer = visibleLayerIds.length === 1;

    return {
      isOnlyLayer: isOnlyVisibleLayer,
      selectedLayerId: isOnlyVisibleLayer ? visibleLayerIds[0] : selectedLayerIdFromState,
    };
  }, [
    activeVisualization,
    props.framePublicAPI,
    visualization.state,
    layerIds,
    selectedLayerIdFromState,
  ]);

  const focusLayerTabsContent = () => {
    setTimeout(() => {
      const element = document.getElementById(LENS_LAYER_TABS_CONTENT_ID);
      element?.focus({ preventScroll: true });
    }, 0);
  };

  useEffect(() => {
    // Do not trigger in ES|QL mode, as the focus should remain in the editor.
    if (selectedLayerId && !canEditTextBasedQuery) {
      focusLayerTabsContent();
    }
    // Needs layerIds to refocus when layers are removed
  }, [canEditTextBasedQuery, selectedLayerId, layerIds.length]);

  const setVisualizationState = useMemo(
    () => (newState: unknown) => {
      dispatchLens(
        updateVisualizationState({
          visualizationId: activeVisualization.id,
          newState,
        })
      );
    },
    [activeVisualization.id, dispatchLens]
  );
  const updateDatasource = useMemo(
    () =>
      (datasourceId: string | undefined, newState: unknown, dontSyncLinkedDimensions?: boolean) => {
        if (datasourceId) {
          dispatchLens(
            updateDatasourceState({
              newDatasourceState:
                typeof newState === 'function'
                  ? newState(datasourceStates[datasourceId].state)
                  : newState,
              datasourceId,
              clearStagedPreview: false,
              dontSyncLinkedDimensions,
            })
          );
        }
      },
    [dispatchLens, datasourceStates]
  );
  const updateDatasourceAsync = useMemo(
    () => (datasourceId: string | undefined, newState: unknown) => {
      // React will synchronously update if this is triggered from a third party component,
      // which we don't want. The timeout lets user interaction have priority, then React updates.
      setTimeout(() => {
        updateDatasource(datasourceId, newState);
      });
    },
    [updateDatasource]
  );

  const updateAll = useMemo<LayerPanelProps['updateAll']>(
    () =>
      ({ datasourceId, newDatasourceState, layerId, groupId, columnId }) => {
        const visualizationId = visualization.activeId;
        if (!datasourceId || !visualizationId) return;
        // Keep async behavior from dimension editors, but delegate the
        // datasource+visualization orchestration to a single reducer action.

        setTimeout(() => {
          const newDsState =
            typeof newDatasourceState === 'function'
              ? newDatasourceState(datasourceStates[datasourceId].state)
              : newDatasourceState;

          dispatchLens(
            setDimensionAndUpdateDatasource({
              visualizationId,
              layerId,
              groupId,
              columnId,
              datasourceId,
              newDatasourceState: newDsState,
            })
          );
        }, 0);
      },
    [dispatchLens, datasourceStates, visualization.activeId]
  );

  const toggleFullscreen = useCallback(() => {
    dispatchLens(setToggleFullscreen());
  }, [dispatchLens]);

  const handleDimensionDrop = useCallback(
    (payload: { source: DragDropIdentifier; target: DragDropOperation; dropType: DropType }) => {
      dispatchLens(onDropToDimension(payload));
    },
    [dispatchLens]
  );

  const onRemoveLayer = useCallback(
    async (layerToRemoveId: string) => {
      const datasourcePublicAPI = props.framePublicAPI.datasourceLayers?.[layerToRemoveId];
      const datasourceId = datasourcePublicAPI?.datasourceId;

      if (datasourceId) {
        const layerDatasource = datasourceMap[datasourceId];
        const layerDatasourceState = datasourceStates?.[datasourceId]?.state;
        const trigger = props.uiActions.getTrigger(UPDATE_FILTER_REFERENCES_TRIGGER);
        const action = await props.uiActions.getAction(UPDATE_FILTER_REFERENCES_ACTION);

        action?.execute({
          trigger,
          fromDataView: layerDatasource.getUsedDataView(layerDatasourceState, layerToRemoveId),
          usedDataViews: layerDatasource
            .getLayers(layerDatasourceState)
            .map((layer) => layerDatasource.getUsedDataView(layerDatasourceState, layer)),
          defaultDataView: layerDatasource.getUsedDataView(layerDatasourceState),
        } as ActionExecutionContext);
      }

      dispatchLens(
        removeOrClearLayer({
          visualizationId: activeVisualization.id,
          layerId: layerToRemoveId,
          layerIds,
        })
      );

      focusLayerTabsContent();
    },
    [
      activeVisualization.id,
      datasourceMap,
      datasourceStates,
      dispatchLens,
      layerIds,
      props.framePublicAPI.datasourceLayers,
      props.uiActions,
    ]
  );

  const onChangeIndexPattern = useCallback(
    async ({
      indexPatternId,
      datasourceId,
      visualizationId,
      layerId,
    }: {
      indexPatternId: string;
      datasourceId?: string;
      visualizationId?: string;
      layerId?: string;
    }) => {
      const indexPatterns = await props.indexPatternService?.ensureIndexPattern({
        id: indexPatternId,
        cache: props.framePublicAPI.dataViews.indexPatterns,
      });
      if (indexPatterns) {
        dispatchLens(
          changeIndexPattern({
            indexPatternId,
            datasourceIds: datasourceId ? [datasourceId] : [],
            visualizationIds: visualizationId ? [visualizationId] : [],
            layerId,
            dataViews: { indexPatterns },
          })
        );
      }
    },
    [dispatchLens, props.framePublicAPI.dataViews.indexPatterns, props.indexPatternService]
  );

  // This will be used only in dimension editors like metric charts which adds a hidden layer.
  // That's why we don't update the currently selected or focused layer.
  const addLayer: AddLayerFunction = useCallback(
    (layerType, extraArg, ignoreInitialValues, seriesType) => {
      const layerId = generateId();
      dispatchLens(
        addLayerAction({ layerId, layerType, extraArg, ignoreInitialValues, seriesType })
      );
    },
    [dispatchLens]
  );

  const registerLibraryAnnotationGroupFunction = useCallback<
    LayerPanelProps['registerLibraryAnnotationGroup']
  >((groupInfo) => dispatchLens(registerLibraryAnnotationGroup(groupInfo)), [dispatchLens]);

  const layerConfig = useMemo(() => {
    if (!selectedLayerId) return;

    return {
      layerId: selectedLayerId,
      layerType: activeVisualization.getLayerType(selectedLayerId, visualization.state),
      config: activeVisualization.getConfiguration({
        layerId: selectedLayerId,
        frame: props.framePublicAPI,
        state: visualization.state,
      }),
    };
  }, [activeVisualization, props.framePublicAPI, selectedLayerId, visualization.state]);

  if (layerConfig?.config.hidden || !selectedLayerId || !layerConfig) return null;

  return (
    <EuiForm
      css={css`
        .lnsApp & {
          /* Add left padding and negative margin to create space for drag-drop extra targets
             (e.g., "Alt/Option to duplicate" tooltip) that are positioned to the left of drop zones. */
          padding: ${euiTheme.size.base} ${euiTheme.size.base} ${euiTheme.size.xl}
            calc(${DRAG_DROP_EXTRA_TARGETS_PADDING}px + ${euiTheme.size.base});
          margin-left: -${DRAG_DROP_EXTRA_TARGETS_PADDING}px;
          /* Background gradient: transparent in the extended left area (for tooltips),
             solid color for the visible content area */
          background: linear-gradient(
            to right,
            transparent 0,
            transparent ${DRAG_DROP_EXTRA_TARGETS_PADDING}px,
            ${euiTheme.colors.emptyShade} ${DRAG_DROP_EXTRA_TARGETS_PADDING}px
          );
          /* Override the default max-width of drag-drop extra targets to reduce
             horizontal overflow space requirements */
          .domDroppable__extraTargets {
            width: ${DRAG_DROP_EXTRA_TARGETS_WIDTH}px;
          }
          /* Note: overflow scrolling is handled by the parent lnsConfigPanelScrollContainer */
          ${euiBreakpoint(euiThemeContext, ['xs', 's', 'm'])} {
            padding-left: ${euiTheme.size.base};
            margin-left: 0;
            background: ${euiTheme.colors.emptyShade};
          }
        }
      `}
    >
      <LayerPanel
        {...props}
        onDropToDimension={handleDimensionDrop}
        registerLibraryAnnotationGroup={registerLibraryAnnotationGroupFunction}
        dimensionGroups={layerConfig.config.groups}
        activeVisualization={activeVisualization}
        layerId={selectedLayerId}
        layerIndex={layerIds.indexOf(selectedLayerId)}
        visualizationState={visualization.state}
        updateVisualization={setVisualizationState}
        updateDatasource={updateDatasource}
        updateDatasourceAsync={updateDatasourceAsync}
        displayLayerSettings={!props.hideLayerHeader}
        onChangeIndexPattern={(args) => {
          onChangeIndexPattern(args);
          const layersToRemove =
            activeVisualization.getLayersToRemoveOnIndexPatternChange?.(visualization.state) ?? [];
          layersToRemove.forEach((id) => onRemoveLayer(id));
        }}
        updateAll={updateAll}
        addLayer={addLayer}
        isOnlyLayer={isOnlyLayer}
        onEmptyDimensionAdd={(columnId, { groupId }) => {
          // the layer's datasource can differ from the active one on mixed panels
          // (e.g. a form-based reference line layer on an ES|QL chart)
          const layerDatasourceId =
            props.framePublicAPI.datasourceLayers?.[selectedLayerId]?.datasourceId ??
            activeDatasourceId;
          // avoid state update if the datasource does not support initializeDimension
          if (layerDatasourceId != null && datasourceMap[layerDatasourceId]?.initializeDimension) {
            dispatchLens(
              setLayerDefaultDimension({
                layerId: selectedLayerId,
                columnId,
                groupId,
              })
            );
          }
        }}
        onCloneLayer={() => {
          dispatchLens(
            cloneLayer({
              layerId: selectedLayerId,
            })
          );
        }}
        onRemoveLayer={onRemoveLayer}
        onRemoveDimension={(dimensionProps) => {
          const datasourcePublicAPI = props.framePublicAPI.datasourceLayers?.[selectedLayerId];
          const datasourceId = datasourcePublicAPI?.datasourceId;
          dispatchLens(removeDimension({ ...dimensionProps, datasourceId }));
        }}
        toggleFullscreen={toggleFullscreen}
        indexPatternService={indexPatternService}
      />
    </EuiForm>
  );
}
