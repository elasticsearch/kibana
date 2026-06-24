/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore as useReactFlowStore,
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
  type FitViewOptions,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from '@xyflow/react';
import {
  useEuiTheme,
  EuiScreenReaderOnly,
  EuiScreenReaderLive,
  EuiFlexGroup,
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiPanel,
  EuiToolTip,
  useGeneratedHtmlId,
  keys,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import '@xyflow/react/dist/style.css';
import { css } from '@emotion/react';
import type { ApmPluginStartDeps, ApmServices } from '../../../plugin';
import { getDagreLayoutFailureDiagnostics } from './dagre_layout_failure_diagnostics';
import { applyServiceMapLayout } from '../../shared/service_map/layout';
import {
  FIT_VIEW_PADDING,
  FIT_VIEW_DURATION,
  FIT_VIEW_DEFER_MS,
  MIN_ZOOM,
  MAX_ZOOM,
} from './constants';
import { getServiceMapViewTarget } from './get_service_map_view_target';
import { ServiceNode } from '../../shared/service_map/service_node';
import { DependencyNode } from '../../shared/service_map/dependency_node';
import { GroupedResourcesNode } from '../../shared/service_map/grouped_resources_node';
import { ServiceMapEdge } from './service_map_edge';
import { useEdgeHighlighting } from './use_edge_highlighting';
import { useReducedMotion } from './use_reduced_motion';
import { useKeyboardNavigation } from './use_keyboard_navigation';
import { MapPopover } from './popover';
import { ServiceMapMinimap } from './service_map_minimap';
import {
  DEFAULT_SERVICE_MAP_VIEW_FILTERS,
  type ServiceMapViewFilters,
} from './apply_service_map_visibility';
import { useServiceMapFilterState } from './use_service_map_filter_state';
import { focusServiceMapFindInput } from './service_map_find_in_page';
import { ServiceMapHighlightProvider } from '../../shared/service_map/service_map_search_context';
import { ServiceMapAlertsNavigateProvider } from '../../shared/service_map/service_map_alerts_navigate_context';
import { useServiceMapAlertsNavigateFactory } from './use_service_map_alerts_tab_href';
import {
  ServiceMapOptionsPanel,
  ServiceMapOptionsPanelToggle,
  type ServiceMapOrientation,
} from './service_map_options_panel';
import { ServiceMapLegend } from './service_map_legend';
import { AddToDashboardButton } from './add_to_dashboard_button';
import type { Environment } from '../../../../common/environment_rt';
import {
  isServiceNode,
  type ServiceMapNode,
  type ServiceMapEdge as ServiceMapEdgeType,
} from '../../../../common/service_map';

const nodeTypes: NodeTypes = {
  service: ServiceNode,
  dependency: DependencyNode,
  groupedResources: GroupedResourcesNode,
};

const edgeTypes: EdgeTypes = {
  default: ServiceMapEdge,
};

interface GraphProps {
  height: number | string;
  nodes: ServiceMapNode[];
  edges: ServiceMapEdgeType[];
  /** Currently focused service name (for service-specific map) */
  serviceName?: string;
  environment: Environment;
  kuery: string;
  start: string;
  end: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** When set, shows a "View full service map" button that links to the full map (focused map only) */
  fullMapHref?: string;
  /** When true, hides minimap, options panel, and navigation actions that don't apply in dashboard embeds. */
  isEmbedded?: boolean;
  /**
   * When true, shows the quick-filters toggle/menu and minimap even in embedded mode.
   * Used by the dashboard embeddable when the panel is maximized in view mode.
   */
  showEmbeddedControls?: boolean;
  /** Override for the popover's Focus map button visibility. Defaults to `!isEmbedded`. */
  showFocusMap?: boolean;
  /** Focus button always navigates, even for the currently focused service. */
  alwaysNavigateOnPopoverFocus?: boolean;
  /** Strip `kuery` from popover-built URLs (env still flows through). */
  clearKueryOnPopoverNavigation?: boolean;
  /**
   * When set to a service name that exists on the map, that node gets context highlight
   * (frame, fill, primary node ring). Blue edges/markers remain tied to explicit selection only.
   */
  highlightedServiceName?: string;
  /** Controlled initial / current orientation when supplied. Falls back to internal `useState` otherwise. */
  mapOrientation?: ServiceMapOrientation;
  /** Called when orientation changes (Options panel or any other host control). */
  onMapOrientationChange?: (next: ServiceMapOrientation) => void;
  /** Controlled view filters when supplied (e.g. embeddable hydrating from persisted state). */
  viewFilters?: ServiceMapViewFilters;
  /** Called when view filters change in the options panel. */
  onViewFiltersChange?: (next: ServiceMapViewFilters) => void;
  /** Optional service group filter — forwarded to the "Add to dashboard" panel state. */
  serviceGroupId?: string;
  /**
   * Raw (possibly relative, e.g. `now-15m`) time range from the APM URL. Used by
   * "Add to dashboard" to seed the destination dashboard's global time so a relative
   * range stays live instead of being frozen to absolute timestamps. Falls back to the
   * resolved `start`/`end` when unavailable.
   */
  rangeFrom?: string;
  rangeTo?: string;
}

function GraphInner({
  height,
  nodes: initialNodes,
  edges: initialEdges,
  serviceName,
  environment,
  kuery,
  start,
  end,
  isFullscreen = false,
  onToggleFullscreen,
  fullMapHref,
  isEmbedded = false,
  showEmbeddedControls = false,
  showFocusMap,
  alwaysNavigateOnPopoverFocus,
  clearKueryOnPopoverNavigation,
  highlightedServiceName,
  mapOrientation: controlledOrientation,
  onMapOrientationChange,
  viewFilters: controlledViewFilters,
  onViewFiltersChange,
  serviceGroupId,
  rangeFrom,
  rangeTo,
}: GraphProps) {
  const { services } = useKibana<ApmPluginStartDeps & ApmServices>();
  const { telemetry } = services;
  const { euiTheme } = useEuiTheme();
  const { fitView, zoomIn, zoomOut, setCenter, getNodes, getNodesBounds } =
    useReactFlow<ServiceMapNode>();
  const viewportWidth = useReactFlowStore((state) => state.width);
  const viewportHeight = useReactFlowStore((state) => state.height);
  const makeAlertsNavigateHandler = useServiceMapAlertsNavigateFactory();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeForPopover, setSelectedNodeForPopover] = useState<ServiceMapNode | null>(null);
  const [selectedEdgeForPopover, setSelectedEdgeForPopover] = useState<ServiceMapEdgeType | null>(
    null
  );
  const serviceMapId = useGeneratedHtmlId({ prefix: 'serviceMap' });
  const mapRegionRef = useRef<HTMLDivElement | null>(null);

  const [internalViewFilters, setInternalViewFilters] = useState<ServiceMapViewFilters>(
    controlledViewFilters ?? DEFAULT_SERVICE_MAP_VIEW_FILTERS
  );
  const viewFilters = controlledViewFilters ?? internalViewFilters;
  // Keep a ref to the currently-effective view filters so function updaters always see the
  // latest "prev" — internalViewFilters can be stale when the host drives state via
  // `controlledViewFilters` (we never write back to internalViewFilters in that case).
  const viewFiltersRef = useRef(viewFilters);
  viewFiltersRef.current = viewFilters;
  const setViewFilters = useCallback(
    (updater: ServiceMapViewFilters | ((prev: ServiceMapViewFilters) => ServiceMapViewFilters)) => {
      const next =
        typeof updater === 'function'
          ? (updater as (prev: ServiceMapViewFilters) => ServiceMapViewFilters)(
              viewFiltersRef.current
            )
          : updater;
      setInternalViewFilters(next);
      onViewFiltersChange?.(next);
    },
    [onViewFiltersChange]
  );
  // Find-in-page is a standalone-only affordance (the options panel that hosts it never renders
  // when embedded), so the search query is purely internal state.
  const [searchQuery, setSearchQuery] = useState('');
  // Used to badge the controls toggle when the panel is collapsed but state is non-default.
  // Persisted view filters / search query keep the map "the same view" — but the options panel
  // itself stays closed on the dashboard (product feedback: it's an authoring affordance).
  const hasActiveControls =
    viewFilters.alertStatusFilter.length > 0 ||
    viewFilters.sloStatusFilter.length > 0 ||
    viewFilters.connectionFilter.length > 0 ||
    viewFilters.anomalySeverityFilter.length > 0 ||
    searchQuery.trim().length > 0;
  const [panelExpanded, setPanelExpanded] = useState(!isEmbedded);
  // When the panel is maximized in a dashboard (view mode), we show the quick-filters and minimap
  // even though we're embedded. In all other embedded states they stay hidden.
  const showControls = !isEmbedded || showEmbeddedControls;
  // Auto-open the quick-filters panel the moment the dashboard panel is maximized so users
  // immediately discover the controls. The user can still close it manually mid-session.
  useEffect(() => {
    if (showEmbeddedControls) {
      setPanelExpanded(true);
    }
  }, [showEmbeddedControls]);
  const [internalOrientation, setInternalOrientation] = useState<ServiceMapOrientation>(
    controlledOrientation ?? 'horizontal'
  );
  const mapOrientation = controlledOrientation ?? internalOrientation;
  const setMapOrientation = useCallback(
    (next: ServiceMapOrientation) => {
      setInternalOrientation(next);
      onMapOrientationChange?.(next);
    },
    [onMapOrientationChange]
  );

  // Track the current selected node for use in layout effect without triggering re-layout
  const selectedNodeIdRef = useRef<string | null>(null);
  selectedNodeIdRef.current = selectedNodeId;
  const selectedEdgeForPopoverRef = useRef<string | null>(null);
  selectedEdgeForPopoverRef.current = selectedEdgeForPopover?.id ?? null;

  const { applyEdgeHighlighting } = useEdgeHighlighting();

  const { getAnimationDuration } = useReducedMotion();
  const getFitViewOptions = useCallback(
    (animate = true): FitViewOptions<ServiceMapNode> => ({
      padding: FIT_VIEW_PADDING,
      duration: animate ? getAnimationDuration(FIT_VIEW_DURATION) : 0,
    }),
    [getAnimationDuration]
  );

  // Camera placement used for both initial load and the "fit view" control. Most maps use fitView;
  // very large, sprawling maps center on the median node so the user lands on content rather than the
  // empty middle of the bounding box.
  const handleFitView = useCallback(
    (animate = true) => {
      const visibleNodes = getNodes().filter((node) => !node.hidden);
      const target = getServiceMapViewTarget({
        visibleNodes,
        bounds: getNodesBounds(visibleNodes),
        viewportWidth,
        viewportHeight,
      });

      if (target.kind === 'center') {
        setCenter(target.x, target.y, {
          zoom: MIN_ZOOM,
          duration: animate ? getAnimationDuration(FIT_VIEW_DURATION) : 0,
        });
        return;
      }

      fitView(getFitViewOptions(animate));
    },
    [
      getNodes,
      getNodesBounds,
      viewportWidth,
      viewportHeight,
      setCenter,
      getAnimationDuration,
      fitView,
      getFitViewOptions,
    ]
  );

  // The first time nodes appear we place the viewport without animation to avoid the visible
  // "hunt for center" caused by multiple animated fits on mount. Subsequent fits animate.
  const hasPerformedInitialFitRef = useRef(false);

  // EBT + console fire once per failed layout computation (each useMemo re-run that throws),
  // not strictly once per page visit—intentional for measuring failure frequency.
  const onDagreLayoutFailure = useCallback(
    (error: unknown) => {
      telemetry.reportServiceMapDagreLayoutFallback(getDagreLayoutFailureDiagnostics(error));
      console.error('[APM Service map] Dagre.layout failed; using grid fallback.', error);
    },
    [telemetry]
  );

  const layoutedNodes = useMemo(
    () =>
      applyServiceMapLayout(
        initialNodes,
        initialEdges,
        {
          rankdir: mapOrientation === 'vertical' ? 'TB' : 'LR',
        },
        onDagreLayoutFailure
      ),
    [initialNodes, initialEdges, mapOrientation, onDagreLayoutFailure]
  );

  const { filterOptionCounts, nodesAfterFilters, edgesAfterFilters } = useServiceMapFilterState({
    layoutedNodes,
    initialNodes,
    initialEdges,
    viewFilters,
    mapOrientation,
    onDagreLayoutFailure,
  });

  const nodesWithContextHighlight = useMemo(
    () =>
      nodesAfterFilters.map((n) => {
        if (!isServiceNode(n)) {
          return n;
        }
        const contextHighlight = Boolean(highlightedServiceName && n.id === highlightedServiceName);
        return { ...n, data: { ...n.data, contextHighlight } };
      }),
    [nodesAfterFilters, highlightedServiceName]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ServiceMapNode>(nodesWithContextHighlight);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ServiceMapEdgeType>(edgesAfterFilters);

  useEffect(() => {
    setNodes(nodesWithContextHighlight);

    const highlightedEdges = applyEdgeHighlighting(edgesAfterFilters, {
      selectedNodeId: selectedEdgeForPopoverRef.current ? null : selectedNodeIdRef.current,
      selectedEdgeId: selectedEdgeForPopoverRef.current,
    });

    const edgesWithContextHighlight = highlightedServiceName
      ? highlightedEdges.map((edge) => ({
          ...edge,
          data: {
            ...edge.data,
            sourceContextHighlight: edge.source === highlightedServiceName,
            targetContextHighlight: edge.target === highlightedServiceName,
          },
        }))
      : highlightedEdges;

    setEdges(edgesWithContextHighlight as ServiceMapEdgeType[]);

    if (nodesAfterFilters.length > 0) {
      const isInitialFit = !hasPerformedInitialFitRef.current;
      hasPerformedInitialFitRef.current = true;
      const timer = setTimeout(() => handleFitView(!isInitialFit), FIT_VIEW_DEFER_MS);
      return () => clearTimeout(timer);
    }
  }, [
    nodesWithContextHighlight,
    edgesAfterFilters,
    setNodes,
    setEdges,
    handleFitView,
    applyEdgeHighlighting,
    nodesAfterFilters.length,
    highlightedServiceName,
  ]);

  const handleNodeClick: NodeMouseHandler<ServiceMapNode> = useCallback(
    (_, node) => {
      // Use ref so toggle logic always matches last committed selection without stale closure issues,
      // and keep this callback stable for React Flow.
      const newSelectedId = selectedNodeIdRef.current === node.id ? null : node.id;
      setSelectedNodeId(newSelectedId);
      setEdges((currentEdges) =>
        applyEdgeHighlighting(currentEdges, {
          selectedNodeId: newSelectedId,
          selectedEdgeId: null,
        })
      );
      setSelectedNodeForPopover(newSelectedId ? node : null);
      setSelectedEdgeForPopover(null);
    },
    [setEdges, applyEdgeHighlighting]
  );
  const handleEdgeClick: EdgeMouseHandler<ServiceMapEdgeType> = useCallback(
    (_, edge) => {
      setSelectedNodeId(null);
      setSelectedNodeForPopover(null);
      const newSelectedEdge = selectedEdgeForPopover?.id === edge.id ? null : edge;
      setSelectedEdgeForPopover(newSelectedEdge);
      setEdges((currentEdges) =>
        applyEdgeHighlighting(currentEdges, {
          selectedNodeId: null,
          selectedEdgeId: newSelectedEdge?.id ?? null,
        })
      );
    },
    [selectedEdgeForPopover, setEdges, applyEdgeHighlighting]
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeForPopover(null);
    setSelectedEdgeForPopover(null);
    setNodes((currentNodes) =>
      currentNodes.map((n) => ({
        ...n,
        selected: false,
      }))
    );
    setEdges((currentEdges) => applyEdgeHighlighting(currentEdges, null));
  }, [setNodes, setEdges, applyEdgeHighlighting]);

  const handlePopoverClose = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeForPopover(null);
    setSelectedEdgeForPopover(null);
    setNodes((currentNodes) =>
      currentNodes.map((n) => ({
        ...n,
        selected: false,
      }))
    );
    setEdges((currentEdges) => applyEdgeHighlighting(currentEdges, null));
  }, [setNodes, setEdges, applyEdgeHighlighting]);

  useEffect(() => {
    if (selectedNodeId && nodesAfterFilters.some((n) => n.id === selectedNodeId && n.hidden)) {
      handlePopoverClose();
    }
  }, [nodesAfterFilters, selectedNodeId, handlePopoverClose]);

  useEffect(() => {
    // Find-in-page (and its Cmd/Ctrl+K shortcut) only exists in the standalone view; when
    // embedded the search box isn't rendered, so the shortcut would be a silent no-op.
    if (isEmbedded) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'k') {
        return;
      }
      const active = document.activeElement;
      const inMapRegion = Boolean(active && mapRegionRef.current?.contains(active));
      const isBareDocumentFocus =
        active == null || active === document.body || active === document.documentElement;

      if (!inMapRegion && !isBareDocumentFocus) {
        return;
      }
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setPanelExpanded(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focusServiceMapFindInput();
        });
      });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isEmbedded]);

  // Close popover when user starts dragging (map panning or node dragging)
  const handleDragStart = useCallback(() => {
    if (selectedNodeForPopover || selectedEdgeForPopover) {
      handlePopoverClose();
    }
  }, [selectedNodeForPopover, selectedEdgeForPopover, handlePopoverClose]);

  // Handle node selection from keyboard navigation
  const handleKeyboardNodeSelect = useCallback(
    (node: ServiceMapNode | null) => {
      if (node) {
        setSelectedNodeId(node.id);
        setSelectedNodeForPopover(node);
        setSelectedEdgeForPopover(null);
        setEdges((currentEdges) =>
          applyEdgeHighlighting(currentEdges, {
            selectedNodeId: node.id,
            selectedEdgeId: null,
          })
        );
      } else {
        handlePopoverClose();
      }
    },
    [setEdges, applyEdgeHighlighting, handlePopoverClose]
  );

  // Handle edge selection from keyboard navigation
  const handleKeyboardEdgeSelect = useCallback(
    (edge: ServiceMapEdgeType | null) => {
      if (edge) {
        setSelectedNodeId(null);
        setSelectedNodeForPopover(null);
        setSelectedEdgeForPopover(edge);
        setEdges((currentEdges) =>
          applyEdgeHighlighting(currentEdges, {
            selectedNodeId: null,
            selectedEdgeId: edge.id,
          })
        );
      } else {
        handlePopoverClose();
      }
    },
    [setEdges, applyEdgeHighlighting, handlePopoverClose]
  );

  // Use keyboard navigation hook for accessibility
  const { screenReaderAnnouncement } = useKeyboardNavigation({
    nodes,
    edges,
    selectedNodeId,
    selectedNodeForPopover,
    selectedEdgeForPopover,
    onNodeSelect: handleKeyboardNodeSelect,
    onEdgeSelect: handleKeyboardEdgeSelect,
    onPopoverClose: handlePopoverClose,
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === keys.ESCAPE && isFullscreen && onToggleFullscreen) {
        e.preventDefault();
        onToggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, onToggleFullscreen]);

  const fullscreenButtonLabel = isFullscreen
    ? i18n.translate('xpack.apm.serviceMap.fullScreenExitButton', {
        defaultMessage: 'Exit fullscreen (esc)',
      })
    : i18n.translate('xpack.apm.serviceMap.fullScreenButton', {
        defaultMessage: 'Enter fullscreen',
      });

  const viewFullMapButtonLabel = i18n.translate('xpack.apm.serviceMap.viewFullServiceMapButton', {
    defaultMessage: 'View full service map',
  });

  const zoomInLabel = i18n.translate('xpack.apm.serviceMap.zoomInControl', {
    defaultMessage: 'Zoom In',
  });
  const zoomOutLabel = i18n.translate('xpack.apm.serviceMap.zoomOutControl', {
    defaultMessage: 'Zoom Out',
  });
  const fitViewLabel = i18n.translate('xpack.apm.serviceMap.fitViewControl', {
    defaultMessage: 'Fit View',
  });

  const containerStyle = useMemo(
    () => ({
      height,
      width: '100%',
      overflow: 'auto',
      zIndex: Number(euiTheme.levels.content) + 1,
      background: `linear-gradient(
        90deg,
        ${euiTheme.colors.backgroundBasePlain}
          calc(${euiTheme.size.l} - calc(${euiTheme.size.xs} / 2)),
        transparent 1%
      )
      center,
      linear-gradient(
        ${euiTheme.colors.backgroundBasePlain}
          calc(${euiTheme.size.l} - calc(${euiTheme.size.xs} / 2)),
        transparent 1%
      )
      center,
      ${euiTheme.colors.lightShade}`,
      backgroundSize: `${euiTheme.size.l} ${euiTheme.size.l}`,
    }),
    [height, euiTheme]
  );

  const topLeftToolbarStyles = useMemo(
    () => css`
      display: flex;
      flex-direction: row;
      gap: ${euiTheme.size.s};
      align-items: flex-start;
      margin: ${euiTheme.size.s};
    `,
    [euiTheme]
  );

  /** Stacks the options toggle and zoom controls; stays in place regardless of menu state. */
  const topLeftToolbarColumnStyles = useMemo(
    () => css`
      display: flex;
      flex-direction: column;
      gap: ${euiTheme.size.s};
      align-items: flex-start;
    `,
    [euiTheme]
  );

  /** Match ServiceMapOptionsPanel show/hide controls: `EuiButtonIcon` empty + hit target. */
  const mapToolbarControlIconCss = useMemo(
    () => css`
      min-inline-size: calc(${euiTheme.size.base} * 2);
      min-block-size: calc(${euiTheme.size.base} * 2);
    `,
    [euiTheme]
  );

  const serviceMapZoomControlsPanelCss = useMemo(
    () => css`
      z-index: ${euiTheme.levels.content};

      @media (max-width: 960px) {
        margin: ${euiTheme.size.xxs} !important;
        overflow: auto;
      }
    `,
    [euiTheme]
  );

  const screenReaderInstructions = i18n.translate('xpack.apm.serviceMap.screenReaderInstructions', {
    defaultMessage:
      'This is an interactive service map showing application services and their dependencies. ' +
      'Use Tab to navigate between service nodes. Use Arrow keys to move between adjacent nodes. ' +
      'Press Enter or Space to select a node and view its details including connections. ' +
      'Press Escape to close the details popover. ' +
      'When focus is in the map region or on the page background (no text field focused), press Command K or Control K to open find in page and focus the search field. ' +
      'The options panel and zoom controls in the top left allow you to filter, change layout, zoom in, zoom out, and fit the view.',
  });

  return (
    <ServiceMapHighlightProvider>
      <ServiceMapAlertsNavigateProvider makeAlertsNavigateHandler={makeAlertsNavigateHandler}>
        <div
          ref={mapRegionRef}
          css={css(containerStyle)}
          data-test-subj="serviceMapGraph"
          role="group"
          tabIndex={0}
          aria-label={i18n.translate('xpack.apm.serviceMap.regionLabel', {
            defaultMessage: 'Service map with {nodeCount} services and dependencies.',
            values: { nodeCount: nodes.length },
          })}
          aria-describedby={serviceMapId}
        >
          <EuiScreenReaderOnly>
            <div id={serviceMapId}>{screenReaderInstructions}</div>
          </EuiScreenReaderOnly>
          <EuiScreenReaderLive>{screenReaderAnnouncement}</EuiScreenReaderLive>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            onMoveStart={handleDragStart}
            onNodeDragStart={handleDragStart}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            nodesFocusable
            edgesFocusable={false}
          >
            <Background gap={24} size={1} color={euiTheme.colors.lightShade} />
            {initialNodes.length > 0 && nodes.length === 0 && (
              <Panel position="top-center">
                <EuiEmptyPrompt
                  iconType="filter"
                  titleSize="xs"
                  title={
                    <h2>
                      {i18n.translate('xpack.apm.serviceMap.noNodesMatchFiltersTitle', {
                        defaultMessage: 'No services match these filters',
                      })}
                    </h2>
                  }
                  body={
                    <p>
                      {i18n.translate('xpack.apm.serviceMap.noNodesMatchFiltersBody', {
                        defaultMessage:
                          'Try removing or changing the view filters to see services again.',
                      })}
                    </p>
                  }
                  data-test-subj="serviceMapNoNodesMatchFilters"
                />
              </Panel>
            )}
            <Panel position="top-left" css={topLeftToolbarStyles}>
              <div css={topLeftToolbarColumnStyles}>
                {showControls && (
                  <ServiceMapOptionsPanelToggle
                    isExpanded={panelExpanded}
                    onExpandedChange={setPanelExpanded}
                    hasActiveControls={hasActiveControls}
                  />
                )}
                <EuiPanel
                  hasBorder
                  hasShadow={false}
                  paddingSize="none"
                  borderRadius="m"
                  grow={false}
                  data-testid="rf__controls"
                  data-test-subj="serviceMapControls"
                  css={serviceMapZoomControlsPanelCss}
                >
                  <EuiFlexGroup
                    direction="column"
                    gutterSize="none"
                    alignItems="center"
                    justifyContent="center"
                    responsive={false}
                  >
                    <EuiToolTip content={zoomInLabel} disableScreenReaderOutput>
                      <EuiButtonIcon
                        display="empty"
                        color="text"
                        size="s"
                        iconType="plus"
                        onClick={() => zoomIn()}
                        aria-label={zoomInLabel}
                        data-test-subj="serviceMapZoomInButton"
                        css={mapToolbarControlIconCss}
                      />
                    </EuiToolTip>
                    <EuiToolTip content={zoomOutLabel} disableScreenReaderOutput>
                      <EuiButtonIcon
                        display="empty"
                        color="text"
                        size="s"
                        iconType="minus"
                        onClick={() => zoomOut()}
                        aria-label={zoomOutLabel}
                        data-test-subj="serviceMapZoomOutButton"
                        css={mapToolbarControlIconCss}
                      />
                    </EuiToolTip>
                    <EuiToolTip content={fitViewLabel} disableScreenReaderOutput>
                      <EuiButtonIcon
                        display="empty"
                        color="text"
                        size="s"
                        iconType="crosshair"
                        onClick={() => handleFitView()}
                        aria-label={fitViewLabel}
                        data-test-subj="serviceMapFitViewButton"
                        css={mapToolbarControlIconCss}
                      />
                    </EuiToolTip>
                    {fullMapHref && (
                      <EuiToolTip content={viewFullMapButtonLabel} disableScreenReaderOutput>
                        <EuiButtonIcon
                          display="empty"
                          color="text"
                          size="s"
                          iconType="apps"
                          href={fullMapHref}
                          aria-label={viewFullMapButtonLabel}
                          data-test-subj="serviceMapViewFullMapButton"
                          css={mapToolbarControlIconCss}
                        />
                      </EuiToolTip>
                    )}
                    {onToggleFullscreen && (
                      <EuiToolTip content={fullscreenButtonLabel} disableScreenReaderOutput>
                        <EuiButtonIcon
                          display="empty"
                          color="text"
                          size="s"
                          iconType={isFullscreen ? 'fullScreenExit' : 'fullScreen'}
                          onClick={onToggleFullscreen}
                          aria-label={fullscreenButtonLabel}
                          data-test-subj="serviceMapFullScreenButton"
                          css={mapToolbarControlIconCss}
                        />
                      </EuiToolTip>
                    )}
                  </EuiFlexGroup>
                </EuiPanel>
                <EuiPanel
                  hasBorder
                  hasShadow={false}
                  paddingSize="none"
                  borderRadius="m"
                  grow={false}
                >
                  <ServiceMapLegend controlIconCss={mapToolbarControlIconCss} />
                </EuiPanel>
              </div>
              {showControls && panelExpanded && (
                <ServiceMapOptionsPanel
                  nodes={nodesAfterFilters}
                  filterOptionCounts={filterOptionCounts}
                  connectionFilter={viewFilters.connectionFilter}
                  onConnectionFilterChange={(next) =>
                    setViewFilters((prev) => ({ ...prev, connectionFilter: next }))
                  }
                  alertStatusFilter={viewFilters.alertStatusFilter}
                  onAlertStatusFilterChange={(next) =>
                    setViewFilters((prev) => ({ ...prev, alertStatusFilter: next }))
                  }
                  sloStatusFilter={viewFilters.sloStatusFilter}
                  onSloStatusFilterChange={(next) =>
                    setViewFilters((prev) => ({ ...prev, sloStatusFilter: next }))
                  }
                  anomalySeverityFilter={viewFilters.anomalySeverityFilter}
                  onAnomalySeverityFilterChange={(next) =>
                    setViewFilters((prev) => ({ ...prev, anomalySeverityFilter: next }))
                  }
                  mapOrientation={mapOrientation}
                  onMapOrientationChange={setMapOrientation}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                />
              )}
            </Panel>
            {!isEmbedded && (
              <Panel position="top-right" css={topLeftToolbarStyles}>
                <EuiPanel
                  hasBorder
                  hasShadow={false}
                  paddingSize="none"
                  borderRadius="m"
                  grow={false}
                >
                  <AddToDashboardButton
                    environment={environment}
                    kuery={kuery}
                    start={start}
                    end={end}
                    rangeFrom={rangeFrom}
                    rangeTo={rangeTo}
                    serviceName={serviceName}
                    serviceGroupId={serviceGroupId}
                    mapOrientation={mapOrientation}
                    viewFilters={viewFilters}
                    controlIconCss={mapToolbarControlIconCss}
                  />
                </EuiPanel>
              </Panel>
            )}
            {showControls && <ServiceMapMinimap />}
          </ReactFlow>
          <MapPopover
            selectedNode={selectedNodeForPopover}
            selectedEdge={selectedEdgeForPopover}
            focusedServiceName={serviceName}
            environment={environment}
            kuery={kuery}
            start={start}
            end={end}
            onClose={handlePopoverClose}
            isEmbedded={isEmbedded}
            showFocusMap={showFocusMap}
            alwaysNavigateOnFocus={alwaysNavigateOnPopoverFocus}
            clearKueryOnNavigation={clearKueryOnPopoverNavigation}
          />
        </div>
      </ServiceMapAlertsNavigateProvider>
    </ServiceMapHighlightProvider>
  );
}

export function ServiceMapGraph(props: GraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
