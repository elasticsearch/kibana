/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiCallOut, EuiToolTip, useEuiTheme } from '@elastic/eui';
import {
  Background,
  type ColorMode,
  type EdgeTypes,
  MiniMap,
  type NodeTypes,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  useReactFlow,
  type Viewport,
} from '@xyflow/react';
import React, { Component, type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  LayoutDirection,
  TransformResult,
  WorkflowStepExecutionDto,
  WorkflowYaml,
} from '@kbn/workflows';
import '@xyflow/react/dist/style.css';
import { findGraphFocusNode } from './find_graph_focus_node';
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

const PRO_OPTIONS = { hideAttribution: true } as const;
// Predefined zoom for the initial graph view; user can zoom in/out from
// the bar afterwards. Picked to match the readability shown in the design.
const INITIAL_ZOOM = 1;
const TOP_PADDING = 80;

const CANVAS_CONTROLS_SHADOW =
  '0 0 2px 0 rgba(43, 57, 79, 0.16), 0 1px 4px 0 rgba(43, 57, 79, 0.06), 0 2px 8px 0 rgba(43, 57, 79, 0.05)';

function CanvasZoomControls({ onResetView }: { onResetView: () => void }) {
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
        <EuiToolTip content={zoomOutLabel} position="left" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="minusInCircle"
            aria-label={zoomOutLabel}
            color="text"
            size="s"
            onClick={handleZoomOut}
            data-test-subj="workflowCanvas-zoom-out"
          />
        </EuiToolTip>
        <EuiToolTip content={zoomInLabel} position="left" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="plusInCircle"
            aria-label={zoomInLabel}
            color="text"
            size="s"
            onClick={handleZoomIn}
            data-test-subj="workflowCanvas-zoom-in"
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
  /**
   * When the canvas mounts (e.g. user switched from YAML to graph view),
   * centers on the node whose id or `data.label` matches, or on the first
   * trigger when this is `WORKFLOW_GRAPH_FOCUS_TRIGGER`. Falls back to
   * top-center of the graph if no match.
   */
  readonly focusStepId?: string | null;
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
    focusStepId,
    onStepRun,
    canRunSteps,
    renderStepIcon,
    direction = 'TB',
    fitView: fitViewProp = false,
    fitViewOptions: fitViewOptionsProp,
    showMinimap = true,
    showZoomControls = false,
    showBackground = true,
    edgeZIndex = -1,
    onReady,
    defaultViewport,
    onViewportChange,
  } = props;

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
  const { euiTheme } = useEuiTheme();

  const { nodes, edges } = useWorkflowLayout({
    workflow,
    transformed,
    stepExecutions,
    direction,
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

  // Decorate nodes with selection state — without rebuilding identity for non-changed ones
  const decoratedNodes = useMemo(() => {
    if (!selectedStepId) return nodes;
    return nodes.map((n) => (n.id === selectedStepId ? { ...n, selected: true } : n));
  }, [nodes, selectedStepId]);

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
      return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000, centerX: 0 };
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
    return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2 };
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

  // Position the viewport on the focused step or the graph's top row (same as onInit).
  const resetViewportToInitialView = useCallback(
    (instance: ReactFlowInstance, duration = 0) => {
      if (fitViewProp) {
        void instance.fitView({
          padding: fitViewOptionsProp?.padding ?? 0.08,
          minZoom: fitViewOptionsProp?.minZoom ?? 0.2,
          maxZoom: fitViewOptionsProp?.maxZoom ?? 2,
          duration,
        });
        return;
      }

      if (nodes.length === 0) {
        return;
      }

      const widthOf = (n: (typeof nodes)[number]) => (typeof n.width === 'number' ? n.width : 200);
      const heightOf = (n: (typeof nodes)[number]) =>
        typeof n.height === 'number' ? n.height : 64;

      if (focusStepId) {
        const focusNode = findGraphFocusNode(nodes, focusStepId);
        if (focusNode) {
          instance.setCenter(
            focusNode.position.x + widthOf(focusNode) / 2,
            focusNode.position.y + heightOf(focusNode) / 2,
            { zoom: INITIAL_ZOOM, duration }
          );
          return;
        }
      }

      const wrapperHeight = wrapperRef.current?.clientHeight ?? 600;
      instance.setCenter(graphBounds.centerX, graphBounds.minY + wrapperHeight / 2 - TOP_PADDING, {
        zoom: INITIAL_ZOOM,
        duration,
      });
    },
    [nodes, graphBounds, fitViewProp, fitViewOptionsProp, focusStepId]
  );

  // Centers on the graph's top row at the initial zoom — always ignores
  // focusStepId so the button reliably returns to the trigger-row view.
  const handleResetView = useCallback(() => {
    const instance = flowInstanceRef.current;
    if (!instance || nodes.length === 0) return;

    const wrapperHeight = wrapperRef.current?.clientHeight ?? 600;
    instance.setCenter(graphBounds.centerX, graphBounds.minY + wrapperHeight / 2 - TOP_PADDING, {
      zoom: INITIAL_ZOOM,
      duration: 200,
    });
  }, [nodes.length, graphBounds]);

  // Position the initial view: if focusStepId matches a node, centre on
  // that node; otherwise centre on the graph's top row.
  const handleInit = useCallback(
    (instance: ReactFlowInstance) => {
      flowInstanceRef.current = instance;

      // When fitView is declarative (fitViewProp=true), ReactFlow handles the
      // viewport positioning internally before firing onInit. Just signal ready.
      if (fitViewProp) {
        onReady?.();
        return;
      }

      if (nodes.length === 0) {
        return;
      }

      // If the caller supplied a `defaultViewport`, React Flow has already
      // restored the user's previous zoom/pan — don't re-center over it.
      // (The store doesn't survive a remount of <ReactFlow>, so we can't
      // detect this from `instance.getViewport()`; the explicit prop is the
      // only reliable signal.)
      if (defaultViewport) {
        onReady?.();
        return;
      }

      resetViewportToInitialView(instance, 0);
      onReady?.();
    },
    [nodes.length, defaultViewport, fitViewProp, onReady, resetViewportToInitialView]
  );

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
        resetViewportToInitialView(instance, 200);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== undefined) {
        cancelAnimationFrame(raf2);
      }
    };
  }, [direction, nodes.length, resetViewportToInitialView]);

  const minimapNodeColor = useCallback(
    (n: { type?: string; data?: unknown }) => {
      // Placeholder nodes for empty `if` branches are invisible — hide them in
      // the minimap too so they don't appear as spurious coloured dots.
      if (n.type === 'bypassLane') return 'transparent';
      const status = (n.data as { stepExecution?: { status?: string } } | undefined)?.stepExecution
        ?.status;
      return status === 'failed' ? euiTheme.colors.danger : '#0b64dd';
    },
    [euiTheme.colors.danger]
  );

  const dimmed = !isYamlValid;

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
              proOptions={PRO_OPTIONS}
              colorMode={colorMode}
              onInit={handleInit}
              fitView={fitViewProp}
              fitViewOptions={fitViewProp ? fitViewOptionsProp : undefined}
              defaultViewport={defaultViewport}
              onMoveEnd={handleMoveEnd}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              nodesDraggable={false}
              nodesConnectable={false}
              // Prevent React Flow from boosting a selected node's z-index above
              // its siblings / parent. Without this, selecting an inner step of
              // a foreach group lifts the (transparent) group body above the
              // outer edges that pass behind it, making those edges visible
              // through the body.
              elevateNodesOnSelect={false}
              elevateEdgesOnSelect={false}
              elementsSelectable
              panOnScroll
              panOnDrag
              zoomOnScroll={false}
              zoomOnPinch={true}
              zoomOnDoubleClick={false}
              translateExtent={translateExtent}
            >
              {showBackground && (
                <Background
                  bgColor={euiTheme.colors.backgroundBaseSubdued}
                  color={euiTheme.colors.textSubdued}
                />
              )}
              {toolbar}
              {showZoomControls && <CanvasZoomControls onResetView={handleResetView} />}
              {showMinimap && (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-left"
                  bgColor="#f6f9fc"
                  maskColor="rgba(246, 249, 252, 0.7)"
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
