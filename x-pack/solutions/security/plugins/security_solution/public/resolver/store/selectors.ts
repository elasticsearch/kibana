/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSelector, defaultMemoize } from 'reselect';
import type { State } from '../../common/store/types';
import * as cameraSelectors from './camera/selectors';
import * as dataSelectors from './data/selectors';
import * as uiSelectors from './ui/selectors';
import type {
  AnalyzerById,
  ResolverState,
  IsometricTaxiLayout,
  DataState,
  VisibleEntites,
  NodeData,
} from '../types';
import type { EventStats } from '../../../common/endpoint/types';
import * as nodeModel from '../../../common/endpoint/models/node';

export const selectAnalyzer = (state: State): AnalyzerById => state.analyzer;

export const selectAnalyzerById = (state: State, id: string): ResolverState => state.analyzer[id];

export const analyzerByIdSelector = createSelector(
  selectAnalyzer,
  (analyzer: AnalyzerById) => analyzer
);

/**
 * A matrix that when applied to a Vector2 will convert it from world coordinates to screen coordinates.
 * See https://en.wikipedia.org/wiki/Orthographic_projection
 */
export const projectionMatrix = composeSelectors(
  cameraStateSelector,
  cameraSelectors.projectionMatrix
);

export const translation = composeSelectors(cameraStateSelector, cameraSelectors.translation);

export const detectedBounds = composeSelectors(dataStateSelector, dataSelectors.detectedBounds);

export const agentId = composeSelectors(dataStateSelector, dataSelectors.agentId);

export const overriddenTimeBounds = composeSelectors(
  dataStateSelector,
  dataSelectors.overriddenTimeBounds
);

export const currentAppliedTimeRange = composeSelectors(
  dataStateSelector,
  dataSelectors.currentAppliedTimeRange
);

/**
 * A matrix that when applied to a Vector2 converts it from screen coordinates to world coordinates.
 * See https://en.wikipedia.org/wiki/Orthographic_projection
 */
export const inverseProjectionMatrix = composeSelectors(
  cameraStateSelector,
  cameraSelectors.inverseProjectionMatrix
);

/**
 * The scale by which world values are scaled when rendered.
 */
export const scale = composeSelectors(cameraStateSelector, cameraSelectors.scale);

/**
 * Scales the coordinate system, used for zooming. Should always be between 0 and 1
 */
export const scalingFactor = composeSelectors(cameraStateSelector, cameraSelectors.scalingFactor);

/**
 * Whether or not the user is current panning the map.
 */
export const userIsPanning = composeSelectors(cameraStateSelector, cameraSelectors.userIsPanning);

/**
 * Whether or not the camera is animating, at a given time.
 */
export const isAnimating = composeSelectors(cameraStateSelector, cameraSelectors.isAnimating);

export const resolverTreeHasNodes = composeSelectors(
  dataStateSelector,
  dataSelectors.resolverTreeHasNodes
);

/**
 * The position of nodes and edges.
 */
export const layout: (state: ResolverState) => IsometricTaxiLayout = composeSelectors(
  dataStateSelector,
  dataSelectors.layout
);

/**
 * If we need to fetch, this is the entity ID to fetch.
 */
export const treeParametersToFetch = composeSelectors(
  dataStateSelector,
  dataSelectors.treeParametersToFetch
);

export const treeRequestParametersToAbort = composeSelectors(
  dataStateSelector,
  dataSelectors.treeRequestParametersToAbort
);

/**
 * An array of indices to use for resolver panel requests.
 */
export const eventIndices = composeSelectors(dataStateSelector, dataSelectors.eventIndices);

export const resolverComponentInstanceID = composeSelectors(
  dataStateSelector,
  dataSelectors.resolverComponentInstanceID
);

/**
 * This returns a map of nodeIDs to the associated stats provided by the datasource.
 */
export const nodeStats: (state: ResolverState) => (nodeID: string) => EventStats | undefined =
  composeSelectors(dataStateSelector, dataSelectors.nodeStats);

/**
 * This returns the "aggregate total" for related events, tallied as the sum
 * of their individual `event.category`s. E.g. a [DNS, Network] would count as two
 * towards the aggregate total.
 */
export const relatedEventTotalCount: (
  state: ResolverState
) => (nodeID: string) => number | undefined = composeSelectors(
  dataStateSelector,
  dataSelectors.relatedEventTotalCount
);

/**
 * the loading state of the current related event data for the `event_detail` view
 */
export const isCurrentRelatedEventLoading = composeSelectors(
  dataStateSelector,
  dataSelectors.isCurrentRelatedEventLoading
);

/**
 * the current related event data for the `event_detail` view
 */
export const currentRelatedEventData = composeSelectors(
  dataStateSelector,
  dataSelectors.currentRelatedEventData
);

export const timeRangeFilters = composeSelectors(dataStateSelector, dataSelectors.timeRangeFilters);

/**
 * Returns the id of the "current" tree node (fake-focused)
 */
export const ariaActiveDescendant = composeSelectors(
  uiStateSelector,
  uiSelectors.ariaActiveDescendant
);

/**
 * Returns the nodeID of the selected node
 */
export const selectedNode = composeSelectors(uiStateSelector, uiSelectors.selectedNode);

/**
 * Returns the camera state from within ResolverState
 */
function cameraStateSelector(state: ResolverState) {
  return state.camera;
}

/**
 * Returns the data state from within ResolverState
 */
function dataStateSelector(state: ResolverState) {
  return state.data;
}

/**
 * Returns the ui state from within ResolverState
 */
function uiStateSelector(state: ResolverState) {
  return state.ui;
}

/**
 * Whether or not the resolver is pending fetching data
 */
export const isTreeLoading = composeSelectors(dataStateSelector, dataSelectors.isTreeLoading);

/**
 * Whether or not the resolver encountered an error while fetching data
 */
export const hadErrorLoadingTree = composeSelectors(
  dataStateSelector,
  dataSelectors.hadErrorLoadingTree
);

/**
 * True there might be more descendants to retrieve in the resolver graph.
 */
export const hasMoreChildren = composeSelectors(dataStateSelector, dataSelectors.hasMoreChildren);

/**
 * True if there might be more ancestors to retrieve in the resolver graph.
 */
export const hasMoreAncestors = composeSelectors(dataStateSelector, dataSelectors.hasMoreAncestors);

/**
 * True if there might be more generations to retrieve in the resolver graph.
 */
export const hasMoreGenerations = composeSelectors(
  dataStateSelector,
  dataSelectors.hasMoreGenerations
);

const boundingBox = composeSelectors(cameraStateSelector, cameraSelectors.viewableBoundingBox);

const nodesAndEdgelines = composeSelectors(dataStateSelector, dataSelectors.nodesAndEdgelines);

/**
 * Total count of related events for a process.
 * @deprecated
 */
export const statsTotalForNode = composeSelectors(
  dataStateSelector,
  dataSelectors.statsTotalForNode
);

/**
 * Return the visible edge lines and process nodes based on the camera position at `time`.
 * The bounding box represents what the camera can see. The camera position is a function of time because it can be
 * animated. So in order to get the currently visible entities, we need to pass in time.
 */
export const visibleNodesAndEdgeLines = createSelector(
  nodesAndEdgelines,
  boundingBox,
  function (nodesAndEdgelinesFn, boundingBoxFn) {
    // `boundingBox` and `nodesAndEdgelines` are each memoized.
    return (time: number) => nodesAndEdgelinesFn(boundingBoxFn(time));
  }
);

/**
 * Takes a nodeID (aka entity_id) and returns the associated aria level as a number or null if the node ID isn't in the tree.
 */
export const ariaLevel: (state: ResolverState) => (nodeID: string) => number | null =
  composeSelectors(dataStateSelector, dataSelectors.ariaLevel);

/**
 * the node ID of the node representing the databaseDocumentID
 */
export const originID: (state: ResolverState) => string | undefined = composeSelectors(
  dataStateSelector,
  dataSelectors.originID
);

/**
 * Takes a nodeID (aka entity_id) and returns the node ID of the node that aria should 'flowto' or null
 * If the node has a flowto candidate that is currently visible, that will be returned, otherwise null.
 */
export const ariaFlowtoNodeID = createSelector(
  visibleNodesAndEdgeLines as (state: ResolverState) => (time: number) => VisibleEntites,
  composeSelectors(dataStateSelector, dataSelectors.ariaFlowtoCandidate) as (
    state: ResolverState
  ) => (nodeId: string) => string | null,
  function (
    visibleNodesAndEdgeLinesAtTime: (time: number) => VisibleEntites,
    ariaFlowtoCandidate: (nodeId: string) => string | null
  ) {
    return defaultMemoize((time: number) => {
      // get the visible nodes at `time`
      const { processNodePositions } = visibleNodesAndEdgeLinesAtTime(time);

      // get a `Set` containing their node IDs
      const nodesVisibleAtTime: Set<string> = new Set();
      // NB: in practice, any event that has been graphed is guaranteed to have an entity_id
      for (const visibleNode of processNodePositions.keys()) {
        const nodeID = nodeModel.nodeID(visibleNode);
        if (nodeID !== undefined) {
          nodesVisibleAtTime.add(nodeID);
        }
      }

      // return the ID of `nodeID`'s following sibling, if it is visible
      return (nodeID: string): string | null => {
        const flowtoNode: string | null = ariaFlowtoCandidate(nodeID);

        return flowtoNode === null || nodesVisibleAtTime.has(flowtoNode) === false
          ? null
          : flowtoNode;
      };
    });
  }
);

export const panelViewAndParameters = composeSelectors(
  uiStateSelector,
  uiSelectors.panelViewAndParameters
);

export const relativeHref = composeSelectors(uiStateSelector, uiSelectors.relativeHref);

/**
 * Total count of events related to `nodeID`.
 * Based on `ResolverNodeStats`
 */
export const totalRelatedEventCountForNode = composeSelectors(
  dataStateSelector,
  dataSelectors.totalRelatedEventCountForNode
);

/**
 * Count of events with `category` related to `nodeID`.
 * Based on `ResolverNodeStats`
 * Used to populate the breadcrumbs in the `nodeEventsInCategory` panel.
 */
export const relatedEventCountOfTypeForNode = composeSelectors(
  dataStateSelector,
  dataSelectors.relatedEventCountOfTypeForNode
);

/**
 * Events related to the panel node that are in the panel category.
 * Used to populate the breadcrumbs in the `nodeEventsInCategory` panel.
 * NB: This cannot tell the view loading information. For example, this does not tell the view if data has been request or if data failed to load.
 */
export const nodeEventsInCategory = composeSelectors(
  dataStateSelector,
  dataSelectors.nodeEventsInCategory
);

/**
 * Flag used to show a Load More Data button in the nodeEventsOfType panel view.
 */
export const lastRelatedEventResponseContainsCursor = composeSelectors(
  dataStateSelector,
  dataSelectors.lastRelatedEventResponseContainsCursor
);

/**
 * Flag to show an error message when loading more related events.
 */
export const hadErrorLoadingNodeEventsInCategory = composeSelectors(
  dataStateSelector,
  dataSelectors.hadErrorLoadingNodeEventsInCategory
);
/**
 * Flag used to show a loading view for the initial loading of related events.
 */
export const isLoadingNodeEventsInCategory = composeSelectors(
  dataStateSelector,
  dataSelectors.isLoadingNodeEventsInCategory
);

/**
 * Flag used to show a loading state for any additional related events.
 */
export const isLoadingMoreNodeEventsInCategory = composeSelectors(
  dataStateSelector,
  dataSelectors.isLoadingMoreNodeEventsInCategory
);

/**
 * Returns the state of the node, loading, running, or terminated.
 */
export const nodeDataStatus = composeSelectors(dataStateSelector, dataSelectors.nodeDataStatus);

/**
 * Returns the node data object for a specific node ID.
 */
export const nodeDataForID = composeSelectors(dataStateSelector, dataSelectors.nodeDataForID);

/**
 * Returns the graph node for a given ID
 */
export const graphNodeForID = composeSelectors(dataStateSelector, dataSelectors.graphNodeForID);

/**
 * Returns a Set of node IDs representing the visible nodes in the view that we do no have node data for already.
 */
export const newIDsToRequest: (state: ResolverState) => (time: number) => Set<string> =
  createSelector(
    composeSelectors(dataStateSelector, (dataState: DataState) => dataState.nodeData) as (
      state: ResolverState
    ) => Map<string, NodeData> | undefined,
    visibleNodesAndEdgeLines as (state: ResolverState) => (time: number) => VisibleEntites,
    function (
      nodeData: Map<string, NodeData> | undefined,
      visibleNodesAndEdgeLinesAtTime: (time: number) => VisibleEntites
    ) {
      return defaultMemoize((time: number) => {
        const { processNodePositions: nodesInView } = visibleNodesAndEdgeLinesAtTime(time);

        const nodes: Set<string> = new Set();
        // loop through the nodes in view and see if any of them are new aka we don't have node data for them already
        for (const node of nodesInView.keys()) {
          const id = nodeModel.nodeID(node);
          // if the node has a valid ID field, and we either don't have any node data currently, or
          // the map doesn't have info for this particular node, then add it to the set so it'll be requested
          // by the middleware
          if (id !== undefined && (!nodeData || !nodeData.has(id))) {
            nodes.add(id);
          }
        }
        return nodes;
      });
    }
  );

/**
 * Returns the schema for the current resolver tree. Currently, only used in the graph controls panel.
 */
export const resolverTreeSourceAndSchema = composeSelectors(
  dataStateSelector,
  dataSelectors.resolverTreeSourceAndSchema
);

/**
 * Calls the `secondSelector` with the result of the `selector`. Use this when re-exporting a
 * concern-specific selector. `selector` should return the concern-specific state.
 */
function composeSelectors<OuterState, InnerState, ReturnValue>(
  selector: (state: OuterState) => InnerState,
  secondSelector: (state: InnerState) => ReturnValue
): (state: OuterState) => ReturnValue {
  return (state) => secondSelector(selector(state));
}
