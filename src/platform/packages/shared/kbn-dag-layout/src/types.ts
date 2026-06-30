/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** Minimal node descriptor required by the layout engine. */
export interface DagNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface DagEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

/**
 * A nested independent subgraph rendered inside compound node `id`.
 * Compound nodes never share edges with their parent graph — layout
 * is always independent.
 */
export interface DagCompoundGroup {
  readonly id: string;
  readonly innerNodes: readonly DagNode[];
  readonly innerEdges: readonly DagEdge[];
}

/** Positioned node with absolute coordinates. */
export interface DagPositionedNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DagPositionedEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** Dagre waypoints (absolute). Empty = render straight line. */
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export type DagLayoutDirection = 'TB' | 'LR';

export interface DagLayoutOptions {
  /** Default 'TB'. */
  direction?: DagLayoutDirection;
  /**
   * Cross-axis spacing between nodes (dagre nodeSep).
   * @kbn/workflows-ui defines DEFAULT_NODE_SEP / COMPACT_NODE_SEP constants.
   */
  nodeSep?: number;
  /** Main-axis spacing between ranks (dagre rankSep). */
  rankSep?: number;
  /**
   * Compact mode: skip inner-subgraph layout entirely.
   * Compound nodes use the caller-provided width/height as-is.
   * Inner nodes are not included in the output.
   * Intended for minimap / preview contexts.
   *
   * @remarks In compact mode, inner nodes of compound groups are excluded
   * from the returned `nodes` array. Callers must not assume output nodes
   * are a 1:1 match with input nodes when compact is true.
   */
  compact?: boolean;
  /** Padding around inner content of a compound node. Defaults to all zeros. */
  compoundPadding?: Partial<{ top: number; right: number; bottom: number; left: number }>;
}
