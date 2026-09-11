/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiCallOut, EuiToolTip, transparentize, useEuiTheme } from '@elastic/eui';
import {
  Background,
  type ColorMode,
  type EdgeTypes,
  MiniMap,
  type NodeTypes,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Viewport,
} from '@xyflow/react';
import React, {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { i18n } from '@kbn/i18n';
import type {
  LayoutDirection,
  TransformResult,
  WorkflowStepExecutionDto,
  WorkflowYaml,
} from '@kbn/workflows';
import { TRIGGER_STEP_TYPES } from '@kbn/workflows';
import '@xyflow/react/dist/style.css';
import { useWorkflowLayout } from './use_workflow_layout';
import { type RenderStepIcon, WorkflowGraphActionsContext } from './workflow_graph_actions_context';
import { WorkflowGraphBypassLaneNode } from './workflow_graph_bypass_lane_node';
import { WorkflowGraphEdge } from './workflow_graph_edge';
import { WorkflowGraphForeachGroupNode } from './workflow_graph_foreach_group_node';
import { WorkflowGraphNode } from './workflow_graph_node';

interface GraphErrorBoundaryState {
  error: Error | null;
}

class GraphErrorBoundary extends Component<
  { children: ReactNode; onError?: (msg: string) => void },
  GraphErrorBoundaryState
> {
  state: GraphErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): GraphErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error.message);
  }

  render() {
    if (this.state.error) {
      return (
        <EuiCallOut
          announceOnMount
          title={i18n.translate('workflowsUi.graph.renderErrorTitle', {
            defaultMessage: 'Workflow graph could not be displayed',
          })}
          color="danger"
          iconType="error"
        >
          <p>{this.state.error.message}</p>
        </EuiCallOut>
      );
    }
    return this.props.children;
  }
}

const NODE_TYPES: NodeTypes = {
  step: WorkflowGraphNode,
  trigger: WorkflowGraphNode,
  foreachGroup: WorkflowGraphForeachGroupNode,
  bypassLane: WorkflowGraphBypassLaneNode,
};

const EDGE_TYPES: EdgeTypes = {
  workflowEdge: WorkflowGraphEdge,
};

// Predefined zoom for the initial graph view; user can zoom in/out from
// the bar afterwards. Picked to match the readability shown in the design.
const INITIAL_ZOOM = 1;
const TOP_PADDING = 80;

const CANVAS_CONTROLS_SHADOW =
  '0 0 2px 0 rgba(43, 57, 79, 0.16), 0 1px 4px 0 rgba(43, 57, 79, 0.06), 0 2px 8px 0 rgba(43, 57, 79, 0.05)';

/**
 * Returns the `setCenter` target (x, y) for the initial / reset view.
 *
 * The framing is axis-aware: for `TB` (vertical) the trigger row is the topmost
 * rank so we anchor it near the top edge — `minY` is placed `TOP_PADDING` pixels
 * from the top, and the graph is centred horizontally (`centerX`). For `LR`
 * (horizontal) the trigger column is the leftmost rank, so we mirror the framing:
 * `minX` is anchored `TOP_PADDING` pixels from the left edge, and the graph is
 * centred vertically (`centerY`). Both axes use the same `TOP_PADDING` constant.
 */
const getResetViewTarget = (
  direction: LayoutDirection,
  bounds: { minX: number; minY: number; centerX: number; centerY: number },
  wrapperWidth: number,
  wrapperHeight: number
): { x: number; y: number } =>
  direction === 'LR'
    ? { x: bounds.minX + wrapperWidth / 2 - TOP_PADDING, y: bounds.centerY }
    : { x: bounds.centerX, y: bounds.minY + wrapperHeight / 2 - TOP_PADDING };

function CanvasZoomControls({
  onResetView,
  onFitView,
}: {
  onResetView: () => void;
  onFitView: () => void;
}) {
  const { euiTheme } = useEuiTheme();
  const { zoomIn, zoomOut } = useReactFlow();

  const zoomOutLabel = i18n.translate('workflowsUi.graph.zoomOut', {
    defaultMessage: 'Zoom out',
  });
  const zoomInLabel = i18n.translate('workflowsUi.graph.zoomIn', {
    defaultMessage: 'Zoom in',
  });
  const resetZoomLabel = i18n.translate('workflowsUi.graph.resetZoom', {
    defaultMessage: 'Reset zoom',
  });
  const fitViewLabel = i18n.translate('workflowsUi.graph.fitView', {
    defaultMessage: 'Fit to view',
  });

  const handleZoomOut = useCallback(() => zoomOut({ duration: 200 }), [zoomOut]);
  const handleZoomIn = useCallback(() => zoomIn({ duration: 200 }), [zoomIn]);

  return (
    <Panel position="bottom-right" style={{ margin: 12 }}>
      <div
        css={{
          background: euiTheme.colors.backgroundBasePlain,
          borderRadius: 8,
          boxShadow: CANVAS_CONTROLS_SHADOW,
          display: 'flex',
          flexDirection: 'column',
          padding: 4,
          gap: 2,
        }}
      >
        <EuiToolTip content={zoomInLabel} position="left" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="plusCircle"
            aria-label={zoomInLabel}
            color="text"
            size="s"
            onClick={handleZoomIn}
            data-test-subj="workflowCanvas-zoom-in"
          />
        </EuiToolTip>
        <EuiToolTip content={zoomOutLabel} position="left" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="minusCircle"
            aria-label={zoomOutLabel}
            color="text"
            size="s"
            onClick={handleZoomOut}
            data-test-subj="workflowCanvas-zoom-out"
          />
        </EuiToolTip>
        <EuiToolTip content={resetZoomLabel} position="left" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="bullseye"
            aria-label={resetZoomLabel}
            color="text"
            size="s"
            onClick={onResetView}
            data-test-subj="workflowCanvas-reset-zoom"
          />
        </EuiToolTip>
        <EuiToolTip content={fitViewLabel} position="left" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="fullScreen"
            aria-label={fitViewLabel}
            color="text"
            size="s"
            onClick={onFitView}
            data-test-subj="workflowCanvas-fit-view"
          />
        </EuiToolTip>
      </div>
    </Panel>
  );
}

export interface WorkflowGraphCanvasProps {
  readonly workflow: WorkflowYaml | undefined;
  /** Optional precomputed transform result for this workflow snapshot. */
  readonly transformed?: TransformResult;
  readonly stepExecutions?: WorkflowStepExecutionDto[];
  readonly isYamlValid: boolean;
  /** Optional UI rendered inside the ReactFlow canvas (e.g. top-left toolbar). */
  readonly toolbar?: React.ReactNode;
  readonly selectedStepId?: string;
  readonly onStepSelect: (stepId: string | undefined) => void;
  readonly onNodeClick?: (stepId: string, stepType: string) => void;
  readonly onLayoutFailed?: (reason: string) => void;
  readonly onPerfMark?: (name: 'transform_ms' | 'layout_ms' | 'first_paint_ms', ms: number) => void;
  readonly colorMode?: ColorMode;
  /** Triggered by the hover "Run step" icon on a node. */
  readonly onStepRun?: (stepName: string) => void;
  /** Disables the per-node Run action when false. */
  readonly canRunSteps?: boolean;
  /**
   * Optional renderer for step icons. When provided the canvas delegates icon
   * resolution to the caller (e.g. plugin's `<StepIcon/>`) instead of the
   * built-in fallback table. Falls back gracefully when omitted.
   */
  readonly renderStepIcon?: RenderStepIcon;
  /** Dagre rank direction (default `'TB'`). */
  readonly direction?: LayoutDirection;
  /** Override dagre rank separation (arrow length in layout direction). */
  readonly rankSep?: number;
  /** Override dagre node separation (gap between siblings in a rank). */
  readonly nodeSep?: number;
  /**
   * When true the viewport is fitted to show all nodes on init, overriding the
   * default centre-on-top behaviour.
   */
  readonly fitView?: boolean;
  /** Options forwarded to ReactFlow's fitView when `fitView` is true. */
  readonly fitViewOptions?: {
    readonly padding?: number;
    readonly minZoom?: number;
    readonly maxZoom?: number;
  };
  /** Whether to render the minimap. Pass false to suppress it (e.g. for exports). */
  readonly showMinimap?: boolean;
  /** Whether to render the floating zoom controls in the bottom-right corner. */
  readonly showZoomControls?: boolean;
  /**
   * Whether to render the dot-pattern background and the coloured wrapper div
   * background. Pass false for export canvases that need a transparent output.
   */
  readonly showBackground?: boolean;
  /**
   * Override the z-index applied to every edge. The default (-1) keeps edges
   * below nodes in the live editor, but breaks DOM-to-image capture because
   * negative-z children are clipped by the stacking context. Pass 0 for
   * off-screen export canvases.
   */
  readonly edgeZIndex?: number;
  /**
   * Called once after ReactFlow has initialised and positioned the viewport
   * (including any fitView). Useful for off-screen export canvases that need
   * to know when the graph is ready to capture.
   */
  readonly onReady?: () => void;
  /**
   * When provided, ReactFlow uses this as the initial viewport instead of
   * running the default centering. Pair with `onViewportChange` to persist
   * the user's zoom/pan across canvas remounts (e.g. YAML↔graph toggle).
   */
  readonly defaultViewport?: Viewport;
  /**
   * Fires when the user finishes a pan or zoom gesture. The caller is
   * responsible for storing this so it can be passed back as
   * `defaultViewport` on the next mount.
   */
  readonly onViewportChange?: (viewport: Viewport) => void;
  /**
   * Static preview mode: icon-only nodes, no interaction, no invalid-YAML
   * callout, autofit. Used by `WorkflowGraphPreview` to render a compact
   * non-interactive snapshot (e.g. inline attachment previews).
   */
  readonly previewMode?: boolean;
}

function WorkflowGraphCanvasInner(props: WorkflowGraphCanvasProps) {
  const {
    workflow,
    transformed,
    stepExecutions,
    isYamlValid,
    toolbar,
    selectedStepId,
    onStepSelect,
    onNodeClick,
    onLayoutFailed,
    onPerfMark,
    colorMode,
    onStepRun,
    canRunSteps,
    renderStepIcon,
    direction = 'TB',
    rankSep,
    nodeSep,
    previewMode = false,
    fitView: fitViewPropRaw = false,
    fitViewOptions: fitViewOptionsProp,
    showMinimap: showMinimapProp,
    showZoomControls = false,
    showBackground: showBackgroundProp,
    edgeZIndex = -1,
    onReady,
    defaultViewport,
    onViewportChange,
  } = props;

  const fitViewProp = previewMode ? true : fitViewPropRaw;
  const showMinimap = showMinimapProp ?? !previewMode;
  const showBackground = showBackgroundProp ?? !previewMode;
  const resolvedFitViewOptions = useMemo(
    () => fitViewOptionsProp ?? { padding: 0.08, minZoom: 0.2, maxZoom: 2 },
    [fitViewOptionsProp]
  );

  const defaultEdgeOptions = useMemo(
    () => ({ type: 'workflowEdge', zIndex: edgeZIndex }),
    [edgeZIndex]
  );
  const actions = useMemo(
    () => ({
      onStepRun,
      canRunSteps,
      renderStepIcon,
      onStepSelect,
    }),
    [onStepRun, canRunSteps, renderStepIcon, onStepSelect]
  );
  const { euiTheme, colorMode: euiColorMode } = useEuiTheme();
  // Background dots: `borderBasePlain` in light; softened to 50% opacity in dark
  // so the grid reads as subtle texture rather than active dots on the dark canvas.
  const backgroundDotColor =
    euiColorMode === 'DARK'
      ? transparentize(euiTheme.colors.borderBasePlain, 0.5)
      : euiTheme.colors.borderBasePlain;

  const { nodes, edges } = useWorkflowLayout({
    workflow,
    transformed,
    stepExecutions,
    direction,
    rankSep,
    nodeSep,
    onPerfMark,
    onLayoutFailed,
  });

  // First-paint mark: time from component mount, not from navigation start.
  const mountTimeRef = useRef(performance.now());
  const firstPaintRecorded = useRef(false);
  useEffect(() => {
    if (firstPaintRecorded.current) return;
    if (nodes.length === 0) return;
    firstPaintRecorded.current = true;
    requestAnimationFrame(() => {
      onPerfMark?.('first_paint_ms', performance.now() - mountTimeRef.current);
    });
  }, [nodes.length, onPerfMark]);

  // Decorate nodes with selection state and preview flag — without rebuilding
  // identity for non-changed ones. In preview mode every node also gets
  // `data.preview: true`, which triggers the icon-only compact render inside
  // `WorkflowGraphNode`.
  const decoratedNodes = useMemo(() => {
    if (!previewMode && !selectedStepId) return nodes;
    return nodes.map((n) => {
      const next = previewMode ? { ...n, data: { ...n.data, preview: true } } : n;
      return n.id === selectedStepId ? { ...next, selected: true } : next;
    });
  }, [nodes, selectedStepId, previewMode]);

  const handleNodeClick = useCallback(
    (_evt: React.MouseEvent, node: { id: string; data: Record<string, unknown> }) => {
      const stepType = typeof node.data?.stepType === 'string' ? node.data.stepType : '';
      onStepSelect(node.id);
      onNodeClick?.(node.id, stepType);
    },
    [onStepSelect, onNodeClick]
  );

  const handlePaneClick = useCallback(() => {
    if (selectedStepId) onStepSelect(undefined);
  }, [selectedStepId, onStepSelect]);

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => onViewportChange?.(viewport),
    [onViewportChange]
  );

  // Single-pass bounding-box over the stable layout output (`nodes`, not
  // `decoratedNodes`) so that selection changes never invalidate the extent
  // or reset-viewport callbacks.  `Math.min/max(...arr.map(...))` is avoided:
  // spreading large arrays as call args can raise RangeError on very big graphs.
  const graphBounds = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000, centerX: 0, centerY: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const w = typeof n.width === 'number' ? n.width : 300;
      const h = typeof n.height === 'number' ? n.height : 64;
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
      if (n.position.x + w > maxX) maxX = n.position.x + w;
      if (n.position.y + h > maxY) maxY = n.position.y + h;
    }
    return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
  }, [nodes]);

  // Restrict panning to the graph's bounding box plus a comfortable margin
  // so the user can't scroll far off into empty space.
  const translateExtent = useMemo<[[number, number], [number, number]]>(() => {
    const PAD = 400;
    return [
      [graphBounds.minX - PAD, graphBounds.minY - PAD],
      [graphBounds.maxX + PAD, graphBounds.maxY + PAD],
    ];
  }, [graphBounds]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);

  // React Flow's `setCenter` derives the viewport from the store's container
  // `width`/`height`, which are 0 until its ResizeObserver measures the canvas
  // (usually *after* `onInit` fires). Subscribe to those measured dimensions so
  // the initial centering can wait until they are known.
  const measuredWidth = useStore((s) => s.width);
  const measuredHeight = useStore((s) => s.height);
  const nodesInitialized = useNodesInitialized();
  const hasCenteredInitialViewRef = useRef(false);
  const [instanceReady, setInstanceReady] = useState(false);

  // Single home-viewport implementation shared by initial centering, direction
  // changes, and the Reset zoom button. The leading-edge anchor is direction-
  // aware: trigger node near top for TB, near left for LR (see getResetViewTarget).
  const applyHomeViewport = useCallback(
    (instance: ReactFlowInstance, duration: number) => {
      if (nodes.length === 0) return;
      const wrapperWidth = wrapperRef.current?.clientWidth ?? 0;
      const wrapperHeight = wrapperRef.current?.clientHeight ?? 0;
      const target = getResetViewTarget(direction, graphBounds, wrapperWidth, wrapperHeight);
      instance.setCenter(target.x, target.y, { zoom: INITIAL_ZOOM, duration });
    },
    [nodes.length, graphBounds, direction]
  );

  const handleResetView = useCallback(() => {
    const instance = flowInstanceRef.current;
    if (!instance) return;
    applyHomeViewport(instance, 200);
  }, [applyHomeViewport]);

  // Scales and pans the viewport to show every node. Uses fitBounds (direct
  // panZoom.setViewport call) rather than fitView (queued through BatchProvider +
  // React re-render cycle) so the viewport updates synchronously without any
  // interference from the outer ReactFlowProvider context.
  const handleFitView = useCallback(() => {
    const instance = flowInstanceRef.current;
    if (!instance || nodes.length === 0) return;

    instance.fitBounds(
      {
        x: graphBounds.minX,
        y: graphBounds.minY,
        width: graphBounds.maxX - graphBounds.minX,
        height: graphBounds.maxY - graphBounds.minY,
      },
      { duration: 200, padding: 0.08 }
    );
  }, [nodes.length, graphBounds]);

  // Record the instance and decide who owns the initial viewport. The default
  // centering is deferred to the measurement-gated effect below, because
  // `setCenter` needs the container dimensions React Flow has not measured yet
  // when `onInit` fires.
  const handleInit = useCallback(
    (instance: ReactFlowInstance) => {
      flowInstanceRef.current = instance;

      // When fitView is declarative (fitViewProp=true), ReactFlow handles the
      // viewport positioning internally before firing onInit. Just signal ready.
      if (fitViewProp) {
        hasCenteredInitialViewRef.current = true;
        onReady?.();
        return;
      }

      // If the caller supplied a `defaultViewport`, React Flow has already
      // restored the user's previous zoom/pan — don't re-center over it.
      // (The store doesn't survive a remount of <ReactFlow>, so we can't
      // detect this from `instance.getViewport()`; the explicit prop is the
      // only reliable signal.)
      if (defaultViewport) {
        hasCenteredInitialViewRef.current = true;
        onReady?.();
        return;
      }

      setInstanceReady(true);
    },
    [defaultViewport, fitViewProp, onReady]
  );

  // Perform the one-time initial centering, but only once React Flow has
  // measured the canvas. Centering during the 0-dimension window computes a
  // wrong transform that pins a small graph to the top of the view until the
  // first pan re-clamps it against `translateExtent`. Waiting for measured
  // dimensions (and node measurement) also handles nodes that arrive after the
  // canvas mounts. The ref keeps this to a single centering for the component's
  // lifetime, so later resizes never yank the viewport away from the user.
  useEffect(() => {
    if (hasCenteredInitialViewRef.current || !instanceReady) {
      return;
    }
    const instance = flowInstanceRef.current;
    if (!instance || nodes.length === 0) {
      return;
    }
    if (measuredWidth <= 0 || measuredHeight <= 0 || !nodesInitialized) {
      return;
    }
    hasCenteredInitialViewRef.current = true;
    applyHomeViewport(instance, 0);
    onReady?.();
  }, [
    instanceReady,
    measuredWidth,
    measuredHeight,
    nodesInitialized,
    nodes.length,
    applyHomeViewport,
    onReady,
  ]);

  const previousDirectionRef = useRef(direction);
  useEffect(() => {
    if (previousDirectionRef.current === direction) {
      return;
    }
    previousDirectionRef.current = direction;

    const instance = flowInstanceRef.current;
    if (!instance || nodes.length === 0) {
      return;
    }

    // Wait for dagre positions to commit in React Flow before re-centering.
    let raf2: number | undefined;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (fitViewProp) {
          void instance.fitView({
            padding: fitViewOptionsProp?.padding ?? 0.08,
            minZoom: fitViewOptionsProp?.minZoom ?? 0.2,
            maxZoom: fitViewOptionsProp?.maxZoom ?? 2,
            duration: 200,
          });
        } else {
          applyHomeViewport(instance, 200);
        }
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== undefined) {
        cancelAnimationFrame(raf2);
      }
    };
  }, [direction, nodes.length, fitViewProp, fitViewOptionsProp, applyHomeViewport]);

  const minimapNodeColor = useCallback(
    (n: { type?: string; data?: unknown }) => {
      // Placeholder nodes for empty `if` branches are invisible — hide them in
      // the minimap too so they don't appear as spurious coloured dots.
      if (n.type === 'bypassLane') return 'transparent';
      const data = n.data as
        | { stepExecution?: { status?: string }; isTrigger?: boolean; stepType?: string }
        | undefined;
      const status = data?.stepExecution?.status;
      if (status === 'failed') return euiTheme.colors.danger;
      // Figma (node 10808:19179): the trigger node reads as pink (accent) in the
      // minimap, matching its icon accent; all other steps are blue (primary).
      // Tokens keep the light look (#0b64dd / #ee72a6) and adapt in dark mode.
      const isTriggerNode =
        data?.isTrigger || (data?.stepType ? TRIGGER_STEP_TYPES.has(data.stepType) : false);
      return isTriggerNode ? euiTheme.colors.accent : euiTheme.colors.primary;
    },
    [euiTheme.colors.danger, euiTheme.colors.accent, euiTheme.colors.primary]
  );

  const dimmed = !isYamlValid && !previewMode;

  return (
    <WorkflowGraphActionsContext.Provider value={actions}>
      <div
        ref={wrapperRef}
        css={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: showBackground ? euiTheme.colors.backgroundBaseSubdued : 'transparent',
          // Inset the MiniMap's inner SVG so the container's white background
          // shows through as a 4px frame on all sides. React Flow sizes the
          // SVG via attributes to match the container's outer dimensions, so
          // CSS padding alone only takes effect on top/left — shrinking the
          // SVG dimensions in CSS is what works uniformly.
          '& .react-flow__minimap-svg': {
            margin: 4,
            width: 'calc(100% - 8px)',
            height: 'calc(100% - 8px)',
          },
        }}
        data-test-subj="workflowGraphCanvas"
      >
        {dimmed && (
          <div
            css={{
              position: 'absolute',
              top: 8,
              left: 8,
              right: 8,
              zIndex: euiTheme.levels.header,
            }}
          >
            <EuiCallOut
              data-test-subj="workflowGraphYamlErrorCallout"
              announceOnMount
              size="s"
              iconType="warning"
              title={i18n.translate('workflowsUi.graph.invalidYaml', {
                defaultMessage: 'YAML has errors — fix to update graph',
              })}
              color="warning"
            />
          </div>
        )}
        <div
          css={{
            width: '100%',
            height: '100%',
            opacity: dimmed ? 0.5 : 1,
            pointerEvents: dimmed ? 'none' : 'auto',
            transition: 'opacity 200ms ease',
          }}
        >
          <GraphErrorBoundary onError={onLayoutFailed}>
            <ReactFlow
              nodes={decoratedNodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              defaultEdgeOptions={defaultEdgeOptions}
              colorMode={colorMode}
              onInit={handleInit}
              fitView={fitViewProp}
              fitViewOptions={fitViewProp ? resolvedFitViewOptions : undefined}
              defaultViewport={defaultViewport}
              onMoveEnd={handleMoveEnd}
              onNodeClick={previewMode ? undefined : handleNodeClick}
              onPaneClick={previewMode ? undefined : handlePaneClick}
              nodesDraggable={false}
              nodesConnectable={false}
              // Prevent React Flow from boosting a selected node's z-index above
              // its siblings / parent. Without this, selecting an inner step of
              // a foreach group lifts the (transparent) group body above the
              // outer edges that pass behind it, making those edges visible
              // through the body.
              elevateNodesOnSelect={false}
              elevateEdgesOnSelect={false}
              elementsSelectable={!previewMode}
              panOnScroll={!previewMode}
              panOnDrag={!previewMode}
              zoomOnScroll={false}
              zoomOnPinch={!previewMode}
              zoomOnDoubleClick={false}
              translateExtent={previewMode ? undefined : translateExtent}
              minZoom={0.1}
            >
              {showBackground && (
                <Background
                  bgColor={euiTheme.colors.backgroundBaseSubdued}
                  color={backgroundDotColor}
                />
              )}
              {toolbar}
              {showZoomControls && (
                <CanvasZoomControls onResetView={handleResetView} onFitView={handleFitView} />
              )}
              {showMinimap && (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-left"
                  bgColor={euiTheme.colors.backgroundBaseSubdued}
                  maskColor={transparentize(euiTheme.colors.backgroundBaseSubdued, 0.7)}
                  nodeColor={minimapNodeColor}
                  nodeStrokeWidth={0}
                  nodeBorderRadius={2}
                  style={{
                    width: 160,
                    height: 126,
                    boxSizing: 'border-box',
                    background: euiTheme.colors.emptyShade,
                    borderRadius: 4,
                    overflow: 'hidden',
                    boxShadow:
                      '0 0 2px 0 rgba(43, 57, 79, 0.16), 0 1px 4px 0 rgba(43, 57, 79, 0.06), 0 2px 8px 0 rgba(43, 57, 79, 0.05)',
                  }}
                />
              )}
            </ReactFlow>
          </GraphErrorBoundary>
        </div>
      </div>
    </WorkflowGraphActionsContext.Provider>
  );
}

/**
 * Inner version of the canvas — does NOT wrap itself in a `ReactFlowProvider`.
 * Use when a parent provides the provider (e.g. so sibling components like
 * the floating bottom bar can `useReactFlow()` against the same flow).
 */
export const WorkflowGraphCanvasWithoutProvider = WorkflowGraphCanvasInner;
