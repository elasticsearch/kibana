/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type { AnyAction, Dispatch } from 'redux-v4';
import type { ThunkDispatch } from 'redux-thunk-v2';
import { v4 as uuidv4 } from 'uuid';
import type { FeatureCollection } from 'geojson';
import type { Adapters } from '@kbn/inspector-plugin/common/adapters';
import type { MapStoreState } from '../reducers/store';
import {
  KBN_IS_CENTROID_FEATURE,
  LAYER_TYPE,
  SOURCE_DATA_REQUEST_ID,
} from '../../common/constants';
import {
  getDataFilters,
  getDataRequestDescriptor,
  getLayerById,
  getLayerList,
  getEditState,
} from '../selectors/map_selectors';
import type { ResultMeta } from '../reducers/non_serializable_instances';
import {
  cancelRequest,
  registerCancelCallback,
  unregisterCancelCallback,
  getEventHandlers,
  getInspectorAdapters,
  fitMapToBounds,
} from '../reducers/non_serializable_instances';
import {
  LAYER_DATA_LOAD_ENDED,
  LAYER_DATA_LOAD_ERROR,
  LAYER_DATA_LOAD_STARTED,
  SET_JOINS,
  SET_LAYER_STYLE_META,
  UPDATE_LAYER_PROP,
  UPDATE_SOURCE_DATA_REQUEST,
} from './map_action_constants';
import type { InnerJoin } from '../classes/joins/inner_join';
import type { ILayer } from '../classes/layers/layer';
import { hasVectorLayerMethod } from '../classes/layers/vector_layer';
import type { DataRequestMeta, DataFilters } from '../../common/descriptor_types';
import { DataRequestAbortError } from '../classes/util/data_request';
import { scaleBounds } from '../../common/elasticsearch_util';
import { getLayersExtent } from './get_layers_extent';
import { isLayerGroup } from '../classes/layers/layer_group';

const FIT_TO_BOUNDS_SCALE_FACTOR = 0.1;

export type DataRequestContext = {
  startLoading(dataId: string, requestToken: symbol, requestMeta?: DataRequestMeta): void;
  stopLoading(
    dataId: string,
    requestToken: symbol,
    data: object,
    resultsMeta?: DataRequestMeta
  ): void;
  onLoadError(dataId: string, requestToken: symbol, error: Error): void;
  onLoadAbort(dataId: string, requestToken: symbol): void;
  setJoinError(joinIndex: number, errorMessage?: string): void;
  updateSourceData(newData: object): void;
  isRequestStillActive(dataId: string, requestToken: symbol): boolean;
  registerCancelCallback(requestToken: symbol, callback: () => void): void;
  dataFilters: DataFilters;
  forceRefreshDueToDrawing: boolean; // Boolean signaling data request triggered by a user updating layer features via drawing tools. When true, layer will re-load regardless of "source.applyForceRefresh" flag.
  isForceRefresh: boolean; // Boolean signaling data request triggered by auto-refresh timer or user clicking refresh button. When true, layer will re-load only when "source.applyForceRefresh" flag is set to true.
  isFeatureEditorOpenForLayer: boolean; // Boolean signaling that feature editor menu is open for a layer. When true, layer will ignore all global and layer filtering so drawn features are displayed and not filtered out.
  inspectorAdapters: Adapters;
};

export function clearDataRequests(layer: ILayer) {
  return (dispatch: ThunkDispatch<MapStoreState, void, AnyAction>) => {
    layer.getInFlightRequestTokens().forEach((requestToken: symbol) => {
      dispatch(cancelRequest(requestToken));
    });
    dispatch({
      type: UPDATE_LAYER_PROP,
      id: layer.getId(),
      propName: '__dataRequests',
      newValue: [],
    });
  };
}

export function cancelAllInFlightRequests() {
  return (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    getLayerList(getState()).forEach((layer) => {
      layer.getInFlightRequestTokens().forEach((requestToken: symbol) => {
        dispatch(cancelRequest(requestToken));
      });
    });
  };
}

export function updateStyleMeta(layerId: string | null) {
  return async (dispatch: Dispatch, getState: () => MapStoreState) => {
    const layer = getLayerById(layerId, getState());
    if (!layer || isLayerGroup(layer)) {
      return;
    }

    const styleMeta = await layer.getStyleMetaDescriptorFromLocalFeatures();
    if (!styleMeta) {
      return;
    }

    dispatch({
      type: SET_LAYER_STYLE_META,
      layerId,
      styleMeta,
    });
  };
}

function getDataRequestContext(
  dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
  getState: () => MapStoreState,
  layerId: string,
  forceRefreshDueToDrawing: boolean,
  isForceRefresh: boolean
): DataRequestContext {
  return {
    dataFilters: getDataFilters(getState()),
    startLoading: (dataId: string, requestToken: symbol, meta: DataRequestMeta) =>
      dispatch(startDataLoad(layerId, dataId, requestToken, meta)),
    stopLoading: (dataId: string, requestToken: symbol, data: object, meta: DataRequestMeta) =>
      dispatch(endDataLoad(layerId, dataId, requestToken, data, meta)),
    onLoadError: (dataId: string, requestToken: symbol, error: Error) =>
      dispatch(onDataLoadError(layerId, dataId, requestToken, error)),
    onLoadAbort: (dataId: string, requestToken: symbol) =>
      dispatch(onDataLoadAbort(layerId, dataId, requestToken)),
    setJoinError: (joinIndex: number, errorMessage?: string) => {
      dispatch(setJoinError(layerId, joinIndex, errorMessage));
    },
    updateSourceData: (newData: object) => {
      dispatch(updateSourceDataRequest(layerId, newData));
    },
    isRequestStillActive: (dataId: string, requestToken: symbol) => {
      const dataRequest = getDataRequestDescriptor(getState(), layerId, dataId);
      if (!dataRequest) {
        return false;
      }
      return dataRequest.dataRequestToken === requestToken;
    },
    registerCancelCallback: (requestToken: symbol, callback: () => void) =>
      dispatch(registerCancelCallback(requestToken, callback)),
    forceRefreshDueToDrawing,
    isForceRefresh,
    isFeatureEditorOpenForLayer: getEditState(getState())?.layerId === layerId,
    inspectorAdapters: getInspectorAdapters(getState()),
  };
}

export function syncDataForAllLayers(isForceRefresh: boolean) {
  return async (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    const syncPromises = getLayerList(getState()).map((layer) => {
      return dispatch(syncDataForLayer(layer, isForceRefresh));
    });
    await Promise.all(syncPromises);
  };
}

function syncDataForAllJoinLayers() {
  return async (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    const syncPromises = getLayerList(getState())
      .filter((layer) => {
        return hasVectorLayerMethod(layer, 'hasJoins') ? layer.hasJoins() : false;
      })
      .map((layer) => {
        return dispatch(syncDataForLayer(layer, false));
      });
    await Promise.all(syncPromises);
  };
}

export function syncDataForLayerDueToDrawing(layer: ILayer) {
  return async (dispatch: Dispatch, getState: () => MapStoreState) => {
    const dataRequestContext = getDataRequestContext(
      dispatch,
      getState,
      layer.getId(),
      true,
      false
    );
    if (
      getState().map.__pauseSyncData ||
      !layer.isVisible() ||
      !layer.showAtZoomLevel(dataRequestContext.dataFilters.zoom)
    ) {
      return;
    }
    await layer.syncData(dataRequestContext);
  };
}

export function syncDataForLayer(layer: ILayer, isForceRefresh: boolean) {
  return async (dispatch: Dispatch, getState: () => MapStoreState) => {
    const dataRequestContext = getDataRequestContext(
      dispatch,
      getState,
      layer.getId(),
      false,
      isForceRefresh
    );
    if (
      getState().map.__pauseSyncData ||
      !layer.isVisible() ||
      !layer.showAtZoomLevel(dataRequestContext.dataFilters.zoom)
    ) {
      return;
    }
    await layer.syncData(dataRequestContext);
  };
}

export function syncDataForLayerId(layerId: string | null, isForceRefresh: boolean) {
  return async (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    const layer = getLayerById(layerId, getState());
    if (layer) {
      dispatch(syncDataForLayer(layer, isForceRefresh));
    }
  };
}

function startDataLoad(
  layerId: string,
  dataId: string,
  requestToken: symbol,
  meta: DataRequestMeta
) {
  return (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    const layer = getLayerById(layerId, getState());
    if (layer) {
      const prevRequestToken = layer.getPrevRequestToken(dataId);
      if (prevRequestToken) {
        dispatch(cancelRequest(prevRequestToken));
      }
    }

    const eventHandlers = getEventHandlers(getState());
    if (eventHandlers && eventHandlers.onDataLoad) {
      eventHandlers.onDataLoad({
        layerId,
        dataId,
      });
    }

    dispatch({
      meta,
      type: LAYER_DATA_LOAD_STARTED,
      layerId,
      dataId,
      requestToken,
    });
  };
}

function endDataLoad(
  layerId: string,
  dataId: string,
  requestToken: symbol,
  data: object,
  meta: DataRequestMeta
) {
  return (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    dispatch(unregisterCancelCallback(requestToken));
    const dataRequest = getDataRequestDescriptor(getState(), layerId, dataId);
    if (dataRequest && dataRequest.dataRequestToken !== requestToken) {
      // todo - investigate - this may arise with failing style meta request and should not throw in that case
      throw new DataRequestAbortError();
    }

    const features = data && 'features' in data ? (data as FeatureCollection).features : [];
    const layer = getLayerById(layerId, getState());

    const eventHandlers = getEventHandlers(getState());
    if (eventHandlers && eventHandlers.onDataLoadEnd) {
      const resultMeta: ResultMeta = {};
      if (layer && layer.getType() === LAYER_TYPE.GEOJSON_VECTOR) {
        const featuresWithoutCentroids = features.filter((feature) => {
          return feature.properties ? !feature.properties[KBN_IS_CENTROID_FEATURE] : true;
        });
        resultMeta.featuresCount = featuresWithoutCentroids.length;
      }

      eventHandlers.onDataLoadEnd({
        layerId,
        dataId,
        resultMeta,
      });
    }

    dispatch({
      type: LAYER_DATA_LOAD_ENDED,
      layerId,
      dataId,
      data,
      meta,
      requestToken,
    });

    dispatch(updateStyleMeta(layerId));
  };
}

function onDataLoadError(layerId: string, dataId: string, requestToken: symbol, error: Error) {
  return async (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    dispatch(unregisterCancelCallback(requestToken));

    const eventHandlers = getEventHandlers(getState());
    if (eventHandlers && eventHandlers.onDataLoadError) {
      eventHandlers.onDataLoadError({
        layerId,
        dataId,
        errorMessage: error.message,
      });
    }

    dispatch({
      type: LAYER_DATA_LOAD_ERROR,
      layerId,
      dataId,
      error,
      requestToken,
    });
  };
}

function onDataLoadAbort(layerId: string, dataId: string, requestToken: symbol) {
  return (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    dispatch(unregisterCancelCallback(requestToken));
    const dataRequest = getDataRequestDescriptor(getState(), layerId, dataId);
    if (dataRequest && dataRequest.dataRequestToken !== requestToken) {
      return;
    }
    dispatch({
      type: LAYER_DATA_LOAD_ENDED,
      layerId,
      dataId,
      data: {},
      meta: {},
      requestToken,
    });
  };
}

export function updateSourceDataRequest(layerId: string, newData: object) {
  return (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    dispatch({
      type: UPDATE_SOURCE_DATA_REQUEST,
      dataId: SOURCE_DATA_REQUEST_ID,
      layerId,
      newData,
    });

    dispatch(updateStyleMeta(layerId));
  };
}

export function fitToLayerExtent(layerId: string) {
  return async (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    const targetLayer = getLayerById(layerId, getState());

    if (targetLayer) {
      try {
        const bounds = await targetLayer.getBounds((boundsLayerId) =>
          getDataRequestContext(dispatch, getState, boundsLayerId, false, false)
        );
        if (bounds) {
          await dispatch(fitMapToBounds(scaleBounds(bounds, FIT_TO_BOUNDS_SCALE_FACTOR)));
        }
      } catch (error) {
        if (!(error instanceof DataRequestAbortError)) {
          // eslint-disable-next-line no-console
          console.warn(
            'Unhandled getBounds error for layer. Only DataRequestAbortError should be surfaced',
            error
          );
        }
        // new fitToLayerExtent request has superseded this thread of execution. Results no longer needed.
        return;
      }
    }
  };
}

export function fitToDataBounds(onNoBounds?: () => void) {
  return async (
    dispatch: ThunkDispatch<MapStoreState, void, AnyAction>,
    getState: () => MapStoreState
  ) => {
    const rootLayers = getLayerList(getState()).filter((layer) => {
      return layer.getParent() === undefined;
    });

    const extent = await getLayersExtent(rootLayers, (boundsLayerId) =>
      getDataRequestContext(dispatch, getState, boundsLayerId, false, false)
    );

    if (extent === null) {
      if (onNoBounds) {
        onNoBounds();
      }
      return;
    }

    dispatch(fitMapToBounds(scaleBounds(extent, FIT_TO_BOUNDS_SCALE_FACTOR)));
  };
}

let lastSetQueryCallId: string = '';
export function autoFitToBounds() {
  return async (dispatch: ThunkDispatch<MapStoreState, void, AnyAction>) => {
    // Method can be triggered before async actions complete
    // Use localSetQueryCallId to only continue execution path if method has not been re-triggered.
    const localSetQueryCallId = uuidv4();
    lastSetQueryCallId = localSetQueryCallId;

    // Joins are performed on the client.
    // As a result, bounds for join layers must also be performed on the client.
    // Therefore join layers need to fetch data prior to auto fitting bounds.
    await dispatch(syncDataForAllJoinLayers());

    if (localSetQueryCallId === lastSetQueryCallId) {
      // In cases where there are no bounds, such as no matching documents, fitToDataBounds does not trigger setGotoWithBounds.
      // Ensure layer syncing occurs when setGotoWithBounds is not triggered.
      function onNoBounds() {
        if (localSetQueryCallId === lastSetQueryCallId) {
          dispatch(syncDataForAllLayers(false));
        }
      }
      dispatch(fitToDataBounds(onNoBounds));
    }
  };
}

function setJoinError(layerId: string, joinIndex: number, error?: string) {
  return (dispatch: Dispatch, getState: () => MapStoreState) => {
    const layer = getLayerById(layerId, getState());
    if (!layer || !hasVectorLayerMethod(layer, 'getJoins')) {
      return;
    }

    const joins = layer.getJoins().map((join: InnerJoin) => {
      return join.toDescriptor();
    });

    if (!error && !joins[joinIndex].error) {
      return;
    }

    dispatch({
      type: SET_JOINS,
      layerId,
      joins: [
        ...joins.slice(0, joinIndex),
        { ...joins[joinIndex], error },
        ...joins.slice(joinIndex + 1),
      ],
    });
  };
}
