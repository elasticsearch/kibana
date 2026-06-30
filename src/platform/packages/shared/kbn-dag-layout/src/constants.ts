/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Exported so callers that render edges can apply the same threshold for
 * deciding whether to draw a straight line vs. a routed polyline.
 * (workflow_graph_edge.tsx uses an identical constant — importing from here
 * keeps the two in sync without a manual "keep in sync" comment.)
 */
export const STRAIGHT_X_THRESHOLD = 100;

/** When barycenter moves endpoints by unequal cross-axis deltas, Dagre waypoints are stale. */
export const CROSS_AXIS_DELTA_TOLERANCE = 1;

export const DEFAULT_COMPOUND_PADDING = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;
