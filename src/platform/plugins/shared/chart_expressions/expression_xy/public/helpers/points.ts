/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** A single point to render in the points overlay layer */
export interface PointData {
  /** Unix timestamp (ms) for the X axis */
  x: number;
  /** Metric value for the Y axis */
  y: number;
  /** Arbitrary key-value metadata from the exemplar document (e.g. trace_id, span_id) */
  details: Array<{ field: string; value: string }>;
}
