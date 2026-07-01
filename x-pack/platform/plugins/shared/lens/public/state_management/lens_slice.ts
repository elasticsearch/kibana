/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAction, createReducer, current } from '@reduxjs/toolkit';
import type { VisualizeFieldContext } from '@kbn/ui-actions-plugin/public';
import { mapValues, uniq } from 'lodash';
import type { Filter, Query } from '@kbn/es-query';
import type { History } from 'history';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { EventAnnotationGroupConfig } from '@kbn/event-annotation-common';
import type { DragDropIdentifier, DropType } from '@kbn/dom-drag-drop';
import type {
  DateRange,
  VisualizationState,
  DataViewsState,
  FramePublicAPI,
  Datasource,
  VisualizationMap,
  DatasourceMap,
  SeriesType,
  VisualizeEditorContext,
  LensAppState,
  LensStoreDeps,
  TableInspectorAdapter,
  DragDropOperation,
  LensAppServices,
  IndexPattern,
  LensEditEvent,
  LensEditContextMapping,
} from '@kbn/lens-common';
import { getInitialDatasourceId, getResolvedDateRange, getRemoveOperation } from '../utils';
import { isComingFromContainerView } from '../app_plugin/app_helpers';
import { generateId } from '../id_generator';
import { getVisualizeFieldSuggestions } from '../editor_frame_service/editor_frame/suggestion_helpers';
import { selectDataViews, selectFramePublicAPI } from './selectors';
import { getUpdatedFrameWithDatasourceState } from './utils';
import { onDropForVisualization } from '../editor_frame_service/editor_frame/config_panel/buttons/drop_targets_utils';
import type { LensSerializedState, LayerType, Suggestion, Visualization } from '..';

const getQueryFromContext = (
  context: VisualizeFieldContext | VisualizeEditorContext,
  data: LensAppServices['data']
) => {
  if ('searchQuery' in context && context.searchQuery) {
    return context.searchQuery;
  }
  if ('query' in context && context.query) {
    return context.query;
  }
  return data.query.queryString.getQuery();
};

export const initialState: LensAppState = {
  persistedDoc: undefined,
  searchSessionId: '',
  filters: [],
  query: { language: 'kuery', query: '' },
  resolvedDateRange: { fromDate: '', toDate: '' },
  isFullscreenDatasource: false,
  isSaveable: false,
  isLoading: false,
  isLinkedToOriginatingApp: false,
  activeDatasourceId: null,
  datasourceStates: {},
  visualization: {
    state: null,
    activeId: null,
    selectedLayerId: null,
  },
  dataViews: {
    indexPatternRefs: [],
    indexPatterns: {},
  },
  annotationGroups: {},
  projectRouting: undefined,
  managed: false,
  hideTextBasedEditor: false,
};

export const getPreloadedState = ({
  lensServices: { data },
  initialContext,
  initialStateFromLocator,
  embeddableEditorIncomingState,
  datasourceMap,
  visualizationMap,
  visualizationType,
}: LensStoreDeps) => {
  const initialDatasourceId = getInitialDatasourceId(datasourceMap);
  const datasourceStates: LensAppState['datasourceStates'] = {};
  // Initialize an empty datasourceStates for each datasource
  if (initialDatasourceId) {
    Object.keys(datasourceMap).forEach((datasourceId) => {
      datasourceStates[datasourceId] = {
        state: null,
        isLoading: true,
      };
    });
  }
  if (initialStateFromLocator) {
    // if anything is passed via locator then populate the empty state
    if ('datasourceStates' in initialStateFromLocator) {
      Object.keys(datasourceMap).forEach((datasourceId) => {
        datasourceStates[datasourceId].state =
          initialStateFromLocator.datasourceStates[datasourceId];
      });
    }
    return {
      ...initialState,
      isLoading: true,
      ...initialStateFromLocator,
      activeDatasourceId:
        ('activeDatasourceId' in initialStateFromLocator &&
          initialStateFromLocator.activeDatasourceId) ||
        initialDatasourceId,
      datasourceStates,
    };
  }

  const query = !initialContext
    ? data.query.queryString.getDefaultQuery()
    : getQueryFromContext(initialContext, data);

  const state: LensAppState = {
    ...initialState,
    isLoading: true,
    query,
    // Do not use app-specific filters from previous app,
    // only if Lens was opened with the intention to visualize a field (e.g. coming from Discover)
    filters: !initialContext
      ? data.query.filterManager.getGlobalFilters()
      : 'searchFilters' in initialContext && initialContext.searchFilters
      ? initialContext.searchFilters
      : data.query.filterManager.getFilters(),
    searchSessionId: data.search.session.getSessionId() ?? '',
    resolvedDateRange: getResolvedDateRange(data.query.timefilter.timefilter),
    isLinkedToOriginatingApp: Boolean(
      isComingFromContainerView(embeddableEditorIncomingState) ||
        (initialContext && 'isEmbeddable' in initialContext && initialContext.isEmbeddable)
    ),
    activeDatasourceId: initialDatasourceId,
    datasourceStates,
    visualization: {
      state: null,
      activeId: visualizationType ?? Object.keys(visualizationMap)[0] ?? null,
      selectedLayerId: null,
    },
  };
  return state;
};

export interface SetExecutionContextPayload {
  query?: Query;
  filters?: Filter[];
  searchSessionId?: string;
  resolvedDateRange?: DateRange;
}

export interface InitialAppState {
  initialInput?: LensSerializedState;
  redirectCallback?: (savedObjectId?: string) => void;
  history?: History<unknown>;
  inlineEditing?: boolean;
  /** If true, hides the ES|QL editor in the flyout, used by Discover */
  hideTextBasedEditor?: boolean;
}

export const setState = createAction<Partial<LensAppState>>('lens/setState');
export const setExecutionContext = createAction<SetExecutionContextPayload>(
  'lens/setExecutionContext'
);
export const initExisting = createAction<Partial<LensAppState>>('lens/initExisting');
export const onActiveDataChange = createAction<{
  activeData: TableInspectorAdapter;
}>('lens/onActiveDataChange');
export const setSaveable = createAction<boolean>('lens/setSaveable');
export const enableAutoApply = createAction<void>('lens/enableAutoApply');
export const disableAutoApply = createAction<void>('lens/disableAutoApply');
export const applyChanges = createAction<void>('lens/applyChanges');
export const setChangesApplied = createAction<boolean>('lens/setChangesApplied');
export const updateDatasourceState = createAction<{
  newDatasourceState: unknown;
  datasourceId: string;
  clearStagedPreview?: boolean;
  dontSyncLinkedDimensions?: boolean;
}>('lens/updateDatasourceState');
export const updateVisualizationState = createAction<{
  visualizationId: string;
  newState: unknown;
  dontSyncLinkedDimensions?: boolean;
}>('lens/updateVisualizationState');

export const insertLayer = createAction<{
  layerId: string;
  datasourceId: string;
}>('lens/insertLayer');

export const switchVisualization = createAction<{
  suggestion: {
    newVisualizationId: string;
    visualizationState: unknown;
    datasourceState?: unknown;
    datasourceId?: string;
  };
  clearStagedPreview?: boolean;
}>('lens/switchVisualization');
export const rollbackSuggestion = createAction<void>('lens/rollbackSuggestion');
export const setToggleFullscreen = createAction<void>('lens/setToggleFullscreen');
export const setIsLoadLibraryVisible = createAction<boolean>('lens/setIsLoadLibraryVisible');
export const submitSuggestion = createAction<void>('lens/submitSuggestion');
export const switchDatasource = createAction<{
  newDatasourceId: string;
}>('lens/switchDatasource');
export const switchAndCleanDatasource = createAction<{
  newDatasourceId: string;
  visualizationId: string | null;
  currentIndexPatternId?: string;
}>('lens/switchAndCleanDatasource');
export const navigateAway = createAction<void>('lens/navigateAway');
export const loadInitial = createAction<InitialAppState>('lens/loadInitial');
export const initEmpty = createAction(
  'initEmpty',
  function prepare({
    newState,
    initialContext,
  }: {
    newState: Partial<LensAppState>;
    initialContext?: VisualizeFieldContext | VisualizeEditorContext;
  }) {
    return { payload: { layerId: generateId(), newState, initialContext } };
  }
);
export const editVisualizationAction = createAction<{
  visualizationId: string;
  event: LensEditEvent<keyof LensEditContextMapping>;
}>('lens/editVisualizationAction');
export const removeLayers = createAction<{
  visualizationId: VisualizationState['activeId'];
  layerIds: string[];
}>('lens/removeLayers');
export const removeOrClearLayer = createAction<{
  visualizationId: string;
  layerId: string;
  layerIds: string[];
}>('lens/removeOrClearLayer');
export const setSelectedLayerId = createAction<{
  layerId: string | null;
}>('lens/setSelectedLayerId');

export const cloneLayer = createAction(
  'cloneLayer',
  function prepare({ layerId }: { layerId: string }) {
    return { payload: { newLayerId: generateId(), layerId } };
  }
);

export const addLayer = createAction<{
  layerId: string;
  layerType: LayerType;
  extraArg: unknown;
  ignoreInitialValues?: boolean;
  seriesType?: SeriesType;
}>('lens/addLayer');
export const onDropToDimension = createAction<{
  source: DragDropIdentifier;
  target: DragDropOperation;
  dropType: DropType;
}>('lens/onDropToDimension');

export const setLayerDefaultDimension = createAction<{
  layerId: string;
  columnId: string;
  groupId: string;
}>('lens/setLayerDefaultDimension');
export const setDimensionAndUpdateDatasource = createAction<{
  visualizationId: string;
  datasourceId: string;
  newDatasourceState: unknown;
  layerId: string;
  groupId: string;
  columnId: string;
}>('lens/setDimensionAndUpdateDatasource');

export const updateIndexPatterns = createAction<Partial<DataViewsState>>(
  'lens/updateIndexPatterns'
);
export const replaceIndexpattern = createAction<{ newIndexPattern: IndexPattern; oldId: string }>(
  'lens/replaceIndexPattern'
);
export const changeIndexPattern = createAction<{
  visualizationIds?: string[];
  datasourceIds?: string[];
  indexPatternId: string;
  layerId?: string;
  dataViews: Partial<DataViewsState>;
}>('lens/changeIndexPattern');
export const removeDimension = createAction<{
  layerId: string;
  columnId: string;
  datasourceId?: string;
}>('lens/removeDimension');
export const registerLibraryAnnotationGroup = createAction<{
  group: EventAnnotationGroupConfig;
  id: string;
}>('lens/registerLibraryAnnotationGroup');

export const lensActions = {
  initExisting,
  setState,
  setExecutionContext,
  onActiveDataChange,
  setSaveable,
  enableAutoApply,
  disableAutoApply,
  applyChanges,
  setChangesApplied,
  updateDatasourceState,
  updateVisualizationState,
  insertLayer,
  switchVisualization,
  rollbackSuggestion,
  setToggleFullscreen,
  setIsLoadLibraryVisible,
  submitSuggestion,
  switchDatasource,
  switchAndCleanDatasource,
  navigateAway,
  loadInitial,
  initEmpty,
  editVisualizationAction,
  removeLayers,
  removeOrClearLayer,
  setSelectedLayerId,
  addLayer,
  onDropToDimension,
  setDimensionAndUpdateDatasource,
  cloneLayer,
  setLayerDefaultDimension,
  updateIndexPatterns,
  replaceIndexpattern,
  changeIndexPattern,
  removeDimension,
  syncLinkedDimensions,
  registerLibraryAnnotationGroup,
};

export const makeLensReducer = (storeDeps: LensStoreDeps) => {
  const { datasourceMap, visualizationMap } = storeDeps;
  return createReducer<LensAppState>(initialState, (builder) => {
    builder
      .addCase(setState, (state, { payload }) => {
        return {
          ...state,
          ...payload,
        };
      })
      .addCase(setExecutionContext, (state, { payload }) => {
        return {
          ...state,
          ...payload,
        };
      })
      .addCase(initExisting, (state, { payload }) => {
        return {
          ...state,
          ...payload,
        };
      })
      .addCase(onActiveDataChange, (state, { payload: { activeData } }) => {
        return {
          ...state,
          activeData,
        };
      })
      .addCase(setSaveable, (state, { payload }) => {
        return {
          ...state,
          isSaveable: payload,
        };
      })
      .addCase(enableAutoApply, (state) => {
        state.autoApplyDisabled = false;
      })
      .addCase(disableAutoApply, (state) => {
        state.autoApplyDisabled = true;
        state.changesApplied = true;
      })
      .addCase(applyChanges, (state) => {
        if (typeof state.applyChangesCounter === 'undefined') {
          state.applyChangesCounter = 0;
        }
        state.applyChangesCounter++;
      })
      .addCase(setChangesApplied, (state, { payload: applied }) => {
        state.changesApplied = applied;
      })
      .addCase(cloneLayer, (state, { payload: { layerId, newLayerId } }) => {
        const clonedIDsMap = new Map<string, string>();

        const getNewId = (prevId: string) => {
          const inMapValue = clonedIDsMap.get(prevId);
          if (!inMapValue) {
            const newId = generateId();
            clonedIDsMap.set(prevId, newId);
            return newId;
          }
          return inMapValue;
        };

        if (!state.activeDatasourceId || !state.visualization.activeId) {
          return state;
        }

        state.datasourceStates = mapValues(
          state.datasourceStates,
          (datasourceState, datasourceId) =>
            datasourceId
              ? {
                  ...datasourceState,
                  state: datasourceMap[datasourceId].cloneLayer(
                    datasourceState.state,
                    layerId,
                    newLayerId,
                    getNewId
                  ),
                }
              : datasourceState
        );
        state.visualization.state = visualizationMap[state.visualization.activeId].cloneLayer!(
          state.visualization.state,
          layerId,
          newLayerId,
          clonedIDsMap
        );
        // Set the selected layer to the newly cloned layer
        state.visualization.selectedLayerId = newLayerId;
      })
      .addCase(removeOrClearLayer, (state, { payload: { visualizationId, layerId, layerIds } }) => {
        const activeVisualization = visualizationMap[visualizationId];
        const activeDataSource = datasourceMap[state.activeDatasourceId!];
        const isOnlyLayer =
          getRemoveOperation(
            activeVisualization,
            state.visualization.state,
            layerId,
            layerIds.length
          ) === 'clear';

        let removedLayerIds: string[] = [];

        state.datasourceStates = mapValues(
          state.datasourceStates,
          (datasourceState, datasourceId) => {
            const datasource = datasourceMap[datasourceId!];

            const { newState, removedLayerIds: removedLayerIdsForThisDatasource } = isOnlyLayer
              ? datasource.clearLayer(datasourceState.state, layerId)
              : datasource.removeLayer(datasourceState.state, layerId);

            removedLayerIds = [...removedLayerIds, ...removedLayerIdsForThisDatasource];

            return {
              ...datasourceState,
              ...(datasourceId === state.activeDatasourceId && {
                state: newState,
              }),
            };
          }
        );
        state.stagedPreview = undefined;
        // reuse the activeDatasource current dataView id for the moment
        const currentDataViewsId = activeDataSource.getUsedDataView(
          state.datasourceStates[state.activeDatasourceId!].state
        );

        if (isOnlyLayer || !activeVisualization.removeLayer) {
          state.visualization.state = activeVisualization.clearLayer(
            state.visualization.state,
            layerId,
            currentDataViewsId
          );
        }

        uniq(removedLayerIds).forEach(
          (removedId) =>
            (state.visualization.state = activeVisualization.removeLayer?.(
              state.visualization.state,
              removedId
            ))
        );
      })
      .addCase(setSelectedLayerId, (state, { payload }) => {
        state.visualization.selectedLayerId = payload.layerId;
      })
      .addCase(changeIndexPattern, (state, { payload }) => {
        const { visualizationIds, datasourceIds, layerId, indexPatternId, dataViews } = payload;
        if (!dataViews.indexPatterns) {
          throw new Error('Invariant: indexPatterns should be defined');
        }
        const newIndexPatternRefs = [...state.dataViews.indexPatternRefs];
        const availableRefs = new Set(newIndexPatternRefs.map((ref) => ref.id));
        // check for missing refs
        Object.values(dataViews.indexPatterns || {}).forEach((indexPattern) => {
          if (!availableRefs.has(indexPattern.id)) {
            newIndexPatternRefs.push({
              id: indexPattern.id!,
              name: indexPattern.name,
              title: indexPattern.title,
            });
          }
        });
        const newState: Partial<LensAppState> = {
          dataViews: {
            ...state.dataViews,
            indexPatterns: dataViews.indexPatterns,
            indexPatternRefs: newIndexPatternRefs,
          },
        };
        if (visualizationIds?.length) {
          for (const visualizationId of visualizationIds) {
            const activeVisualization =
              visualizationId &&
              state.visualization.activeId === visualizationId &&
              visualizationMap[visualizationId];
            if (activeVisualization && layerId && activeVisualization?.onIndexPatternChange) {
              newState.visualization = {
                ...state.visualization,
                state: activeVisualization.onIndexPatternChange(
                  state.visualization.state,
                  indexPatternId,
                  layerId
                ),
              };
            }
          }
        }
        if (datasourceIds?.length) {
          newState.datasourceStates = { ...state.datasourceStates };
          const frame = selectFramePublicAPI(
            { lens: { ...current(state), dataViews: newState.dataViews! } },
            datasourceMap
          );
          const datasourceLayers = frame.datasourceLayers;

          for (const datasourceId of datasourceIds) {
            const activeDatasource = datasourceId && datasourceMap[datasourceId];
            if (activeDatasource && activeDatasource?.onIndexPatternChange) {
              newState.datasourceStates = {
                ...newState.datasourceStates,
                [datasourceId]: {
                  isLoading: false,
                  state: activeDatasource.onIndexPatternChange(
                    newState.datasourceStates[datasourceId].state,
                    dataViews.indexPatterns,
                    indexPatternId,
                    layerId
                  ),
                },
              };
              // Update the visualization columns
              if (layerId && state.visualization.activeId) {
                const nextPublicAPI = activeDatasource.getPublicAPI({
                  state: newState.datasourceStates[datasourceId].state,
                  layerId,
                  indexPatterns: dataViews.indexPatterns,
                });
                const nextTable = new Set(
                  nextPublicAPI.getTableSpec().map(({ columnId }) => columnId)
                );
                const datasourcePublicAPI = datasourceLayers[layerId];
                if (datasourcePublicAPI) {
                  const removed = datasourcePublicAPI
                    .getTableSpec()
                    .map(({ columnId }) => columnId)
                    .filter((columnId) => !nextTable.has(columnId));
                  const activeVisualization = visualizationMap[state.visualization.activeId];
                  let nextVisState = (newState.visualization || state.visualization).state;
                  removed.forEach((columnId) => {
                    nextVisState = activeVisualization.removeDimension({
                      layerId,
                      columnId,
                      prevState: nextVisState,
                      frame,
                    });
                  });
                  newState.visualization = {
                    ...state.visualization,
                    state: nextVisState,
                  };
                }
              }
            }
          }
        }

        return { ...state, ...newState };
      })
      .addCase(updateIndexPatterns, (state, { payload }) => {
        return {
          ...state,
          dataViews: { ...state.dataViews, ...payload },
        };
      })
      .addCase(replaceIndexpattern, (state, { payload }) => {
        state.dataViews.indexPatterns[payload.newIndexPattern.id] = payload.newIndexPattern;
        delete state.dataViews.indexPatterns[payload.oldId];
        state.dataViews.indexPatternRefs = state.dataViews.indexPatternRefs.filter(
          (r) => r.id !== payload.oldId
        );
        state.dataViews.indexPatternRefs.push({
          id: payload.newIndexPattern.id,
          title: payload.newIndexPattern.title,
          name: payload.newIndexPattern.name,
        });
        const visualization = visualizationMap[state.visualization.activeId!];
        state.visualization.state =
          visualization.onIndexPatternRename?.(
            state.visualization.state,
            payload.oldId,
            payload.newIndexPattern.id
          ) ?? state.visualization.state;

        Object.entries(state.datasourceStates).forEach(([datasourceId, datasourceState]) => {
          const datasource = datasourceMap[datasourceId];
          state.datasourceStates[datasourceId].state =
            datasource?.onIndexPatternRename?.(
              datasourceState.state,
              payload.oldId,
              payload.newIndexPattern.id!
            ) ?? datasourceState.state;
        });
      })
      .addCase(updateDatasourceState, (state, { payload }) => {
        if (payload.clearStagedPreview) {
          state.stagedPreview = undefined;
        }

        state.datasourceStates[payload.datasourceId] = {
          state: payload.newDatasourceState,
          isLoading: false,
        };

        if (payload.dontSyncLinkedDimensions) {
          return;
        }

        const currentState = current(state);

        const {
          datasourceState: syncedDatasourceState,
          visualizationState: syncedVisualizationState,
          frame,
        } = syncLinkedDimensions(
          currentState,
          visualizationMap,
          datasourceMap,
          payload.datasourceId
        );

        const visualization = visualizationMap[state.visualization.activeId!];

        state.visualization.state =
          visualization.onDatasourceUpdate?.(syncedVisualizationState, frame) ??
          syncedVisualizationState;
        state.datasourceStates[payload.datasourceId].state = syncedDatasourceState;
      })
      .addCase(updateVisualizationState, (state, { payload }) => {
        if (!state.visualization.activeId) {
          throw new Error(
            'Invariant: visualization state got updated without active visualization'
          );
        }
        // This is a safeguard that prevents us from accidentally updating the
        // wrong visualization. This occurs in some cases due to the uncoordinated
        // way we manage state across plugins.
        if (state.visualization.activeId !== payload.visualizationId) {
          return state;
        }

        state.visualization.state = payload.newState;

        if (!state.activeDatasourceId) {
          return;
        }

        if (payload.dontSyncLinkedDimensions) {
          return;
        }

        // TODO - consolidate into applySyncLinkedDimensions
        const {
          datasourceState: syncedDatasourceState,
          visualizationState: syncedVisualizationState,
        } = syncLinkedDimensions(current(state), visualizationMap, datasourceMap);

        state.datasourceStates[state.activeDatasourceId].state = syncedDatasourceState;
        state.visualization.state = syncedVisualizationState;
      })
      .addCase(setDimensionAndUpdateDatasource, (state, { payload }) => {
        if (!state.visualization.activeId) {
          return state;
        }
        // This is a safeguard that prevents us from accidentally updating the
        // wrong visualization. This occurs in some cases due to the uncoordinated
        // way we manage state across plugins.
        if (state.visualization.activeId !== payload.visualizationId) {
          return state;
        }

        const layerDatasource = datasourceMap[payload.datasourceId];
        if (!layerDatasource) {
          return state;
        }

        const currentDatasourceState = state.datasourceStates[payload.datasourceId]?.state;
        if (currentDatasourceState === undefined) {
          return state;
        }

        const activeVisualization = visualizationMap[state.visualization.activeId];
        const newDatasourceState =
          typeof payload.newDatasourceState === 'function'
            ? (payload.newDatasourceState as (previousState: unknown) => unknown)(
                currentDatasourceState
              )
            : payload.newDatasourceState;

        const framePublicAPI = selectFramePublicAPI({ lens: current(state) }, datasourceMap);
        const updatedFramePublicAPI = getUpdatedFrameWithDatasourceState(
          framePublicAPI,
          layerDatasource,
          newDatasourceState,
          payload.layerId
        );

        state.visualization.state = activeVisualization.setDimension({
          layerId: payload.layerId,
          groupId: payload.groupId,
          columnId: payload.columnId,
          prevState: state.visualization.state,
          frame: updatedFramePublicAPI,
        });
        state.datasourceStates[payload.datasourceId] = {
          state: newDatasourceState,
          isLoading: false,
        };

        const {
          datasourceState: syncedDatasourceState,
          visualizationState: syncedVisualizationState,
          frame,
        } = syncLinkedDimensions(
          current(state),
          visualizationMap,
          datasourceMap,
          payload.datasourceId
        );

        state.visualization.state =
          activeVisualization.onDatasourceUpdate?.(syncedVisualizationState, frame) ??
          syncedVisualizationState;
        state.datasourceStates[payload.datasourceId].state = syncedDatasourceState;
      })

      .addCase(switchVisualization, (state, { payload }) => {
        const { newVisualizationId, visualizationState, datasourceState, datasourceId } =
          payload.suggestion;
        return {
          ...state,
          datasourceStates: datasourceId
            ? {
                ...state.datasourceStates,
                [datasourceId]: {
                  ...state.datasourceStates[datasourceId],
                  state: datasourceState,
                },
              }
            : state.datasourceStates,
          visualization: {
            ...state.visualization,
            activeId: newVisualizationId,
            state: visualizationState,
          },
          stagedPreview: payload.clearStagedPreview
            ? undefined
            : state.stagedPreview || {
                datasourceStates: state.datasourceStates,
                visualization: state.visualization,
                activeData: state.activeData,
              },
        };
      })
      .addCase(rollbackSuggestion, (state) => {
        return {
          ...state,
          ...(state.stagedPreview || {}),
          stagedPreview: undefined,
        };
      })
      .addCase(setToggleFullscreen, (state) => {
        return { ...state, isFullscreenDatasource: !state.isFullscreenDatasource };
      })
      .addCase(submitSuggestion, (state) => {
        return {
          ...state,
          stagedPreview: undefined,
        };
      })
      .addCase(switchDatasource, (state, { payload }) => {
        return {
          ...state,
          datasourceStates: {
            ...state.datasourceStates,
            [payload.newDatasourceId]: state.datasourceStates[payload.newDatasourceId] || {
              state: null,
              isLoading: true,
            },
          },
          activeDatasourceId: payload.newDatasourceId,
        };
      })
      .addCase(switchAndCleanDatasource, (state, { payload }) => {
        const activeVisualization =
          payload.visualizationId && visualizationMap[payload.visualizationId];
        const visualization = state.visualization;
        let newVizState = visualization.state;
        const ids: string[] = [];
        if (activeVisualization && activeVisualization.getLayerIds) {
          const layerIds = activeVisualization.getLayerIds(visualization.state);
          ids.push(...Object.values(layerIds));
          newVizState = activeVisualization.initialize(() => ids[0]);
        }
        const currentVizId = ids[0];

        const datasourceState = current(state).datasourceStates[payload.newDatasourceId]
          ? current(state).datasourceStates[payload.newDatasourceId]?.state
          : datasourceMap[payload.newDatasourceId].createEmptyLayer(
              payload.currentIndexPatternId ?? ''
            );
        const updatedState = datasourceMap[payload.newDatasourceId].insertLayer(
          datasourceState,
          currentVizId
        );

        return {
          ...state,
          datasourceStates: {
            [payload.newDatasourceId]: {
              state: updatedState,
              isLoading: false,
            },
          },
          activeDatasourceId: payload.newDatasourceId,
          visualization: {
            ...visualization,
            state: newVizState,
          },
        };
      })
      .addCase(navigateAway, (state) => state)
      .addCase(loadInitial, (state, payload) => state)
      .addCase(initEmpty, (state, { payload }) => {
        const newState = {
          ...state,
          ...payload.newState,
        };
        const suggestion: Suggestion | undefined = getVisualizeFieldSuggestions({
          datasourceMap,
          datasourceStates: newState.datasourceStates,
          visualizationMap,
          visualizeTriggerFieldContext: payload.initialContext,
          dataViews: newState.dataViews,
        });
        if (suggestion) {
          return {
            ...newState,
            datasourceStates: {
              ...newState.datasourceStates,
              [suggestion.datasourceId!]: {
                ...newState.datasourceStates[suggestion.datasourceId!],
                state: suggestion.datasourceState,
              },
            },
            visualization: {
              ...newState.visualization,
              activeId: suggestion.visualizationId,
              state: suggestion.visualizationState,
            },
            stagedPreview: undefined,
          };
        }

        const visualization = newState.visualization;

        if (!visualization.activeId) {
          throw new Error(
            'Invariant: visualization state got updated without active visualization'
          );
        }

        const activeVisualization = visualizationMap[visualization.activeId];
        if (visualization.state === null && activeVisualization) {
          const activeDatasourceId = getInitialDatasourceId(datasourceMap)!;
          const newVisState = activeVisualization.initialize(() => payload.layerId);
          const activeDatasource = datasourceMap[activeDatasourceId];
          return {
            ...newState,
            activeDatasourceId,
            datasourceStates: {
              ...newState.datasourceStates,
              [activeDatasourceId]: {
                ...newState.datasourceStates[activeDatasourceId],
                state: activeDatasource.insertLayer(
                  newState.datasourceStates[activeDatasourceId]?.state,
                  payload.layerId
                ),
              },
            },
            visualization: {
              ...visualization,
              state: newVisState,
            },
          };
        }
        return newState;
      })
      .addCase(editVisualizationAction, (state, { payload }) => {
        if (!state.visualization.activeId) {
          throw new Error(
            'Invariant: visualization state got updated without active visualization'
          );
        }
        // This is a safeguard that prevents us from accidentally updating the
        // wrong visualization. This occurs in some cases due to the uncoordinated
        // way we manage state across plugins.
        if (state.visualization.activeId !== payload.visualizationId) {
          return state;
        }
        const activeVisualization = visualizationMap[payload.visualizationId];
        if (activeVisualization?.onEditAction) {
          state.visualization.state = activeVisualization.onEditAction(
            state.visualization.state,
            payload.event
          );
        }
      })
      .addCase(insertLayer, (state, { payload }) => {
        const updater = datasourceMap[payload.datasourceId].insertLayer;
        return {
          ...state,
          datasourceStates: {
            ...state.datasourceStates,
            [payload.datasourceId]: {
              ...state.datasourceStates[payload.datasourceId],
              state: updater(
                current(state).datasourceStates[payload.datasourceId].state,
                payload.layerId
              ),
            },
          },
        };
      })
      .addCase(removeLayers, (state, { payload: { visualizationId, layerIds } }) => {
        if (!state.visualization.activeId) {
          throw new Error(
            'Invariant: visualization state got updated without active visualization'
          );
        }

        const activeVisualization = visualizationId && visualizationMap[visualizationId];

        // This is a safeguard that prevents us from accidentally updating the
        // wrong visualization. This occurs in some cases due to the uncoordinated
        // way we manage state across plugins.
        if (
          state.visualization.activeId === visualizationId &&
          activeVisualization &&
          activeVisualization.removeLayer &&
          state.visualization.state
        ) {
          const updater = layerIds.reduce<unknown>(
            (acc, layerId) =>
              activeVisualization.removeLayer ? activeVisualization.removeLayer(acc, layerId) : acc,
            state.visualization.state
          );

          state.visualization.state =
            typeof updater === 'function' ? updater(current(state.visualization.state)) : updater;
        }

        const datasourceByLayerId = new Map<string, string>(
          Object.entries(datasourceMap).flatMap(([datasourceId, datasource]) => {
            if (!state.datasourceStates[datasourceId]) {
              return [];
            }
            return datasource
              .getLayers(state.datasourceStates[datasourceId].state)
              .map((layerId) => [layerId, datasourceId]);
          }) ?? []
        );

        layerIds.forEach((layerId) => {
          const layerDatasourceId = datasourceByLayerId.get(layerId);
          if (layerDatasourceId) {
            const { newState } = datasourceMap[layerDatasourceId].removeLayer(
              current(state).datasourceStates[layerDatasourceId].state,
              layerId
            );
            state.datasourceStates[layerDatasourceId].state = newState;
            // TODO - call removeLayer for any extra (linked) layers removed by the datasource
          }
        });
      })

      .addCase(
        addLayer,
        (state, { payload: { layerId, layerType, extraArg, seriesType, ignoreInitialValues } }) => {
          if (!state.activeDatasourceId || !state.visualization.activeId) {
            return state;
          }

          const activeVisualization = visualizationMap[state.visualization.activeId];
          const activeDatasource = datasourceMap[state.activeDatasourceId];
          // reuse the active datasource dataView id for the new layer
          const currentDataViewsId = activeDatasource.getUsedDataView(
            state.datasourceStates[state.activeDatasourceId!].state
          );
          const visualizationState = activeVisualization.appendLayer!(
            state.visualization.state,
            layerId,
            layerType,
            currentDataViewsId,
            extraArg,
            seriesType
          );

          const framePublicAPI = selectFramePublicAPI({ lens: current(state) }, datasourceMap);

          const { noDatasource } =
            activeVisualization
              .getSupportedLayers(visualizationState, framePublicAPI)
              .find(({ type }) => type === layerType) || {};

          const layersToLinkTo =
            activeVisualization.getLayersToLinkTo?.(visualizationState, layerId) ?? [];

          const datasourceState =
            !noDatasource && activeDatasource
              ? activeDatasource.insertLayer(
                  state.datasourceStates[state.activeDatasourceId].state,
                  layerId,
                  layersToLinkTo
                )
              : state.datasourceStates[state.activeDatasourceId].state;

          const { activeDatasourceState, activeVisualizationState } = ignoreInitialValues
            ? {
                activeDatasourceState: datasourceState,
                activeVisualizationState: visualizationState,
              }
            : addInitialValueIfAvailable({
                datasourceState,
                visualizationState,
                framePublicAPI,
                activeVisualization,
                activeDatasource,
                layerId,
                layerType,
              });

          state.visualization.state = activeVisualizationState;
          state.datasourceStates[state.activeDatasourceId].state = activeDatasourceState;
          state.stagedPreview = undefined;

          const {
            datasourceState: syncedDatasourceState,
            visualizationState: syncedVisualizationState,
          } = syncLinkedDimensions(current(state), visualizationMap, datasourceMap);

          state.datasourceStates[state.activeDatasourceId].state = syncedDatasourceState;
          state.visualization.state = syncedVisualizationState;
        }
      )
      .addCase(onDropToDimension, (state, { payload: { source, target, dropType } }) => {
        if (!state.visualization.activeId) {
          return state;
        }

        const activeVisualization = visualizationMap[state.visualization.activeId];
        const framePublicAPI = selectFramePublicAPI({ lens: current(state) }, datasourceMap);

        const { groups } = activeVisualization.getConfiguration({
          layerId: target.layerId,
          frame: framePublicAPI,
          state: state.visualization.state,
        });

        const [layerDatasourceId, layerDatasource] =
          Object.entries(datasourceMap).find(
            ([datasourceId, datasource]) =>
              state.datasourceStates[datasourceId] &&
              datasource
                .getLayers(state.datasourceStates[datasourceId].state)
                .includes(target.layerId)
          ) || [];

        let newDatasourceState;

        if (layerDatasource && layerDatasourceId) {
          newDatasourceState = layerDatasource?.onDrop({
            state: state.datasourceStates[layerDatasourceId].state,
            source,
            target: {
              ...(target as unknown as DragDropOperation),
              filterOperations:
                groups.find(({ groupId: gId }) => gId === target.groupId)?.filterOperations ||
                Boolean,
            },
            targetLayerDimensionGroups: groups,
            dropType,
            indexPatterns: framePublicAPI.dataViews.indexPatterns,
            activeVisualizationTypeId: activeVisualization.getVisualizationTypeId?.(
              state.visualization.state,
              target.layerId
            ),
          });
          if (!newDatasourceState) {
            return;
          }
          state.datasourceStates[layerDatasourceId].state = newDatasourceState;
        }

        // Create an updated frame with the new datasource state so that
        // setDimension (called by onDrop) has access to the updated operation info
        const updatedFramePublicAPI =
          newDatasourceState && layerDatasource
            ? getUpdatedFrameWithDatasourceState(
                framePublicAPI,
                layerDatasource,
                newDatasourceState,
                target.layerId
              )
            : framePublicAPI;

        activeVisualization.onDrop = activeVisualization.onDrop?.bind(activeVisualization);
        const newVisualizationState = (activeVisualization.onDrop || onDropForVisualization)?.(
          {
            prevState: state.visualization.state,
            frame: updatedFramePublicAPI,
            target,
            source,
            dropType,
            group: groups.find(({ groupId: gId }) => gId === target.groupId),
          },
          activeVisualization
        );
        state.visualization.state = newVisualizationState;

        if (layerDatasourceId) {
          const {
            datasourceState: syncedDatasourceState,
            visualizationState: syncedVisualizationState,
          } = syncLinkedDimensions(current(state), visualizationMap, datasourceMap);

          state.datasourceStates[layerDatasourceId].state = syncedDatasourceState;
          state.visualization.state = syncedVisualizationState;
        }
        state.stagedPreview = undefined;
      })
      .addCase(setLayerDefaultDimension, (state, { payload: { layerId, columnId, groupId } }) => {
        if (!state.activeDatasourceId || !state.visualization.activeId) {
          return state;
        }

        const activeDatasource = datasourceMap[state.activeDatasourceId];
        const activeVisualization = visualizationMap[state.visualization.activeId];
        const layerType =
          activeVisualization.getLayerType(layerId, state.visualization.state) || LayerTypes.DATA;
        const { activeDatasourceState, activeVisualizationState } = addInitialValueIfAvailable({
          datasourceState: state.datasourceStates[state.activeDatasourceId].state,
          visualizationState: state.visualization.state,
          framePublicAPI: selectFramePublicAPI({ lens: current(state) }, datasourceMap),
          activeVisualization,
          activeDatasource,
          layerId,
          layerType,
          columnId,
          groupId,
        });

        state.visualization.state = activeVisualizationState;
        state.datasourceStates[state.activeDatasourceId].state = activeDatasourceState;
      })
      .addCase(removeDimension, (state, { payload: { layerId, columnId, datasourceId } }) => {
        if (!state.visualization.activeId) {
          return state;
        }

        const activeVisualization = visualizationMap[state.visualization.activeId];

        const links = activeVisualization.getLinkedDimensions?.(state.visualization.state);

        const linkedDimensions = links
          ?.filter(({ from: { columnId: fromId } }) => columnId === fromId)
          ?.map(({ to }) => to);

        const datasource = datasourceId ? datasourceMap[datasourceId] : undefined;

        const frame = selectFramePublicAPI({ lens: current(state) }, datasourceMap);

        const remove = (dimensionProps: { layerId: string; columnId: string }) => {
          if (datasource && datasourceId) {
            let datasourceState;
            try {
              datasourceState = current(state.datasourceStates[datasourceId].state);
            } catch {
              datasourceState = state.datasourceStates[datasourceId].state;
            }
            state.datasourceStates[datasourceId].state = datasource?.removeColumn({
              layerId: dimensionProps.layerId,
              columnId: dimensionProps.columnId,
              prevState: datasourceState,
              indexPatterns: frame.dataViews.indexPatterns,
            });
          }

          let visualizationState;
          try {
            visualizationState = current(state.visualization.state);
          } catch {
            visualizationState = state.visualization.state;
          }
          state.visualization.state = activeVisualization.removeDimension({
            layerId: dimensionProps.layerId,
            columnId: dimensionProps.columnId,
            prevState: visualizationState,
            frame,
          });
        };

        remove({ layerId, columnId });

        linkedDimensions?.forEach(
          (linkedDimension) =>
            linkedDimension.columnId && // if there's no columnId, there's no dimension to remove
            remove({ columnId: linkedDimension.columnId, layerId: linkedDimension.layerId })
        );
      })
      .addCase(registerLibraryAnnotationGroup, (state, { payload: { group, id } }) => {
        state.annotationGroups[id] = group;
      })
      .addDefaultCase((state) => state);
  });
};

function addInitialValueIfAvailable({
  visualizationState,
  datasourceState,
  activeVisualization,
  activeDatasource,
  framePublicAPI,
  layerType,
  layerId,
  columnId,
  groupId,
}: {
  framePublicAPI: FramePublicAPI;
  visualizationState: unknown;
  datasourceState: unknown;
  activeDatasource?: Datasource;
  activeVisualization: Visualization;
  layerId: string;
  layerType: string;
  columnId?: string;
  groupId?: string;
}) {
  const { initialDimensions, noDatasource } =
    activeVisualization
      .getSupportedLayers(visualizationState, framePublicAPI)
      .find(({ type }) => type === layerType) || {};

  if (initialDimensions) {
    const info = groupId
      ? initialDimensions.find(({ groupId: id }) => id === groupId)
      : initialDimensions[0]; // pick the first available one if not passed

    if (info) {
      const activeVisualizationState = activeVisualization.setDimension({
        groupId: info.groupId,
        layerId,
        columnId: columnId || info.columnId,
        prevState: visualizationState,
        frame: framePublicAPI,
      });

      if (!noDatasource && activeDatasource?.initializeDimension) {
        return {
          activeDatasourceState: activeDatasource.initializeDimension(
            datasourceState,
            layerId,
            framePublicAPI.dataViews.indexPatterns,
            {
              ...info,
              columnId: columnId || info.columnId,
              visualizationGroups: activeVisualization.getConfiguration({
                layerId,
                frame: framePublicAPI,
                state: activeVisualizationState,
              }).groups,
              activeVisualizationTypeId: activeVisualization.getVisualizationTypeId?.(
                activeVisualizationState,
                layerId
              ),
            }
          ),
          activeVisualizationState,
        };
      } else {
        return {
          activeDatasourceState: datasourceState,
          activeVisualizationState,
        };
      }
    }
  }

  return {
    activeDatasourceState: datasourceState,
    activeVisualizationState: visualizationState,
  };
}

function syncLinkedDimensions(
  state: LensAppState,
  visualizationMap: VisualizationMap,
  datasourceMap: DatasourceMap,
  _datasourceId?: string
) {
  const datasourceId = _datasourceId ?? state.activeDatasourceId;

  if (!datasourceId) {
    return { datasourceState: null, visualizationState: state.visualization.state };
  }

  const indexPatterns = selectDataViews({ lens: state }).indexPatterns;

  let datasourceState: unknown = state.datasourceStates[datasourceId].state;
  let visualizationState: unknown = state.visualization.state;

  const activeVisualization = visualizationMap[state.visualization.activeId!]; // TODO - double check the safety of this coercion
  const linkedDimensions = activeVisualization.getLinkedDimensions?.(visualizationState);
  const frame = selectFramePublicAPI({ lens: state }, datasourceMap);

  if (linkedDimensions) {
    const getDimensionGroups = (layerId: string) =>
      activeVisualization.getConfiguration({
        state: visualizationState,
        layerId,
        frame,
      }).groups;

    const idAssuredLinks = linkedDimensions.map((link) => ({
      ...link,
      to: { ...link.to, columnId: link.to.columnId ?? generateId() },
    }));

    datasourceState = datasourceMap[datasourceId].syncColumns({
      state: datasourceState,
      links: idAssuredLinks,
      getDimensionGroups,
      indexPatterns,
    });

    idAssuredLinks.forEach(({ from, to }) => {
      const dropSource = {
        ...from,
        id: from.columnId,
        // don't need to worry about accessibility here
        humanData: { label: '' },
      };

      const dropTarget = {
        ...to,
        filterOperations: () => true,
      };

      visualizationState = (activeVisualization.onDrop || onDropForVisualization)?.(
        {
          prevState: visualizationState,
          frame,
          target: dropTarget,
          source: dropSource,
          dropType: 'duplicate_compatible',
          group: getDimensionGroups(to.layerId).find(
            ({ groupId }) => groupId === dropTarget.groupId
          ),
        },
        activeVisualization
      );
    });
  }

  return { datasourceState, visualizationState, frame };
}
