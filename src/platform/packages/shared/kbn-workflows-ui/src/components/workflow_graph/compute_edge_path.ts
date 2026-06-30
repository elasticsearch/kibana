/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getSmoothStepPath, Position } from '@xyflow/react';
import { STRAIGHT_X_THRESHOLD } from '@kbn/dag-layout';
import type { EdgeBranchType } from '@kbn/workflows';

const CORNER_RADIUS = 4;
// Vertical (TB) / horizontal (LR) stub at each endpoint so multiple edges
// leaving (or entering) the same node visually share a trunk before they
// split. The source stub is shorter than the target stub so branching edges
// (`if` / `parallel`) bend tight under the source instead of leaving a
// large gap to the divergence point.
const TRUNK_LENGTH_FROM_SOURCE = 9;
const TRUNK_LENGTH_TO_TARGET = 14;

// Vertical offset from the source for branch labels (TB layout). Anchoring
// labels at a fixed Y instead of the source/target midpoint keeps sibling
// `true`/`false` labels on the same row even when the two branches lead to
// targets at very different ranks.
const TB_LABEL_Y_OFFSET = 30;

// Fork single-bus routing: distance from the source handle to the shared
// horizontal bus (TB) or vertical bus (LR). Used for all branching edges
// (switch case/default, if-then, if-else). Labels are anchored at a further
// fixed offset below/right of the bus so all branch labels sit on an aligned
// row (TB) / column (LR) regardless of sibling node heights.
const FORK_BUS_TRUNK = 20;
const FORK_BUS_LABEL_OFFSET = 20;

// Merge single-bus routing: distance from the shared horizontal bus (TB) or
// vertical bus (LR) to the target handle. Mirrors FORK_BUS_TRUNK so the
// fan-in and fan-out bus trunks are the same length.
const MERGE_BUS_TRUNK = 20;

const EPS = 0.5;

export interface ComputeEdgePathInput {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly sourcePosition: Position;
  readonly targetPosition: Position;
  readonly points?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly branchType?: EdgeBranchType;
  readonly isMerge?: boolean;
}

/**
 * For each pair of consecutive points, if the segment is diagonal (neither
 * horizontal nor vertical), insert an "elbow" point so the segment becomes
 * two right-angle segments. The elbow is chosen so the line first continues
 * in the same direction as the previous segment, then turns 90°.
 */
function enforceOrthogonal(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  if (points.length < 2) return points;
  const out: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const curr = points[i];
    const dx = Math.abs(curr.x - prev.x);
    const dy = Math.abs(curr.y - prev.y);
    if (dx < EPS || dy < EPS) {
      out.push(curr);
    } else {
      // Diagonal — break into horizontal-first then vertical when going
      // downward (the workflow case), so the horizontal lane sits near the
      // source rather than at the target. For upward / reverse cases, keep
      // the previous orientation flowing.
      const goingDown = curr.y > prev.y + EPS;
      const elbow = goingDown
        ? { x: curr.x, y: prev.y } // horizontal at prev.y, then descend
        : { x: prev.x, y: curr.y }; // vertical first, then horizontal
      out.push(elbow);
      out.push(curr);
    }
  }
  return out;
}

/**
 * Build an orthogonal SVG path through the given waypoints with rounded
 * corners (radius `r`) at each interior vertex. Falls back to straight
 * line segments when there isn't enough room for the curve.
 *
 * Exported for unit testing.
 */
export function buildRoundedOrthogonalPath(
  inputPoints: Array<{ x: number; y: number }>,
  r: number
): { path: string; labelX: number; labelY: number } {
  const points = enforceOrthogonal(inputPoints);
  if (points.length < 2) {
    return { path: '', labelX: 0, labelY: 0 };
  }
  const first = points[0];
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const lenIn = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const lenOut = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (lenIn < EPS || lenOut < EPS) {
      // Collinear / zero-length neighbour — skip the curve, just draw to curr.
      d += ` L ${curr.x} ${curr.y}`;
    } else {
      const radius = Math.min(r, lenIn / 2, lenOut / 2);
      const inDirX = (curr.x - prev.x) / lenIn;
      const inDirY = (curr.y - prev.y) / lenIn;
      const outDirX = (next.x - curr.x) / lenOut;
      const outDirY = (next.y - curr.y) / lenOut;
      const enterX = curr.x - inDirX * radius;
      const enterY = curr.y - inDirY * radius;
      const exitX = curr.x + outDirX * radius;
      const exitY = curr.y + outDirY * radius;
      d += ` L ${enterX} ${enterY} Q ${curr.x} ${curr.y} ${exitX} ${exitY}`;
    }
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  // Anchor the label on the longest VERTICAL segment of the path, ideally
  // the descending one closest to the target. Falls back to the geometric
  // midpoint when the path has no vertical segments.
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const isVertical = Math.abs(a.x - b.x) < EPS;
    if (isVertical) {
      const len = Math.abs(b.y - a.y);
      // Prefer the latest (closest to target) vertical segment when lengths
      // tie, so labels sit on the descent rather than the source trunk.
      if (len > bestLen + EPS || (len > bestLen - EPS && i > bestIdx)) {
        bestLen = len;
        bestIdx = i;
      }
    }
  }
  const labelAnchor =
    bestIdx >= 0
      ? {
          x: points[bestIdx].x,
          y: (points[bestIdx - 1].y + points[bestIdx].y) / 2,
        }
      : { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  return { path: d, labelX: labelAnchor.x, labelY: labelAnchor.y };
}

/**
 * Build the SVG path for a fork-edge single-bus routing. All branch edges of
 * one fork node (switch case/default, if-then, if-else) share the same
 * sourceX/sourceY, so their trunks and bus line (busY or busX) are identical —
 * they naturally overlay into one visible trunk + one bus. Labels sit at a
 * fixed offset below/right of the bus so all branch labels align on one row
 * (TB) / one column (LR) regardless of how deep each branch target sits.
 *
 * TB shape: source → trunk down → bus horizontal → drop vertical → target.
 * LR shape: source → trunk right → bus vertical → drop horizontal → target.
 *
 * Exported for unit testing.
 */
export function buildForkBusPath(
  p: { sourceX: number; sourceY: number; targetX: number; targetY: number },
  isLR: boolean,
  trunk: number
): { path: string; labelX: number; labelY: number } {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = p;
  if (isLR) {
    const busX = sx + trunk;
    const { path } = buildRoundedOrthogonalPath(
      [
        { x: sx - 2, y: sy },
        { x: busX, y: sy },
        { x: busX, y: ty },
        { x: tx, y: ty },
      ],
      CORNER_RADIUS
    );
    return { path, labelX: busX + FORK_BUS_LABEL_OFFSET, labelY: ty };
  } else {
    const busY = sy + trunk;
    const { path } = buildRoundedOrthogonalPath(
      [
        { x: sx, y: sy - 2 },
        { x: sx, y: busY },
        { x: tx, y: busY },
        { x: tx, y: ty },
      ],
      CORNER_RADIUS
    );
    return { path, labelX: tx, labelY: busY + FORK_BUS_LABEL_OFFSET };
  }
}

/**
 * Build the SVG path for a merge-edge single-bus routing. The inverse of
 * `buildForkBusPath`: all fan-in edges sharing the same target meet at a shared
 * horizontal bus just above the target (TB) or a vertical bus just left of the
 * target (LR), then one shared trunk descends / advances into the target.
 * Because all edges share targetX/targetY, their buses and trunks overlap into
 * one visible bus + one trunk, exactly mirroring the fork bus.
 *
 * TB shape: source → drop vertical to busY → bus horizontal to targetX → trunk down to target.
 * LR shape: source → drop horizontal to busX → bus vertical to targetY → trunk right to target.
 *
 * Exported for unit testing.
 */
export function buildMergeBusPath(
  p: { sourceX: number; sourceY: number; targetX: number; targetY: number },
  isLR: boolean,
  trunk: number
): { path: string; labelX: number; labelY: number } {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = p;
  if (isLR) {
    const busX = tx - trunk;
    const { path, labelX, labelY } = buildRoundedOrthogonalPath(
      [
        { x: sx - 2, y: sy },
        { x: busX, y: sy },
        { x: busX, y: ty },
        { x: tx, y: ty },
      ],
      CORNER_RADIUS
    );
    return { path, labelX, labelY };
  } else {
    const busY = ty - trunk;
    const { path, labelX, labelY } = buildRoundedOrthogonalPath(
      [
        { x: sx, y: sy - 2 },
        { x: sx, y: busY },
        { x: tx, y: busY },
        { x: tx, y: ty },
      ],
      CORNER_RADIUS
    );
    return { path, labelX, labelY };
  }
}

/**
 * Pure SVG-path computation for a workflow graph edge. Contains all routing
 * decisions (fork-bus, merge-bus, dagre-waypoint trunk-stub, smooth-step
 * fallback). Returns `{ path, labelX, labelY }` with no React/DOM dependency.
 */
export const computeEdgePath = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  points: dagrePoints,
  branchType,
  isMerge,
}: ComputeEdgePathInput): { path: string; labelX: number; labelY: number } => {
  // Single-bus routing for all fork (fan-out) edges: switch case/default,
  // if-then, and if-else. All branch edges of one fork node share the same
  // sourceX/sourceY, so their trunks and bus line overlap into one visible
  // trunk + one continuous bus. Each edge then drops straight from the bus to
  // its own target. Labels sit at a fixed offset below the bus (TB) / right of
  // the bus (LR) so all branch labels align on one row/column regardless of
  // how deep each branch target sits.
  const isForkEdge = branchType === 'switch' || branchType === 'then' || branchType === 'else';
  const isLR = sourcePosition === Position.Right || sourcePosition === Position.Left;
  const forkGap = isLR ? targetX - sourceX : targetY - sourceY;
  const useFork = isForkEdge && forkGap > FORK_BUS_TRUNK;

  // Single-bus routing for tagged merge (fan-in) edges: edges that participate
  // in a fan-in that includes a synthetic placeholder lane. All such edges share
  // the same targetX/targetY, so their buses and trunks overlap into one visible
  // bus + one trunk — the symmetric inverse of the fork bus. Fork and merge are
  // disjoint: fork edges carry a branchType, merge edges don't.
  const isMergeEdge = isMerge === true;
  const mergeGap = isLR ? targetX - sourceX : targetY - sourceY;
  const useMerge = isMergeEdge && mergeGap > MERGE_BUS_TRUNK;

  if (useFork) {
    return buildForkBusPath({ sourceX, sourceY, targetX, targetY }, isLR, FORK_BUS_TRUNK);
  }

  if (useMerge) {
    return buildMergeBusPath({ sourceX, sourceY, targetX, targetY }, isLR, MERGE_BUS_TRUNK);
  }

  if (dagrePoints && dagrePoints.length >= 2) {
    let middle = dagrePoints.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));

    if (isLR) {
      // LR layout: trunks are horizontal stubs off the left/right handle.
      const trunkSourceX = sourceX + TRUNK_LENGTH_FROM_SOURCE;
      const trunkTargetX = targetX - TRUNK_LENGTH_TO_TARGET;
      // Find the FIRST vertical segment in the dagre middle and replace
      // everything before it with a horizontal stub at trunkSourceX.
      for (let i = 0; i < middle.length - 1; i++) {
        const dx = Math.abs(middle[i].x - middle[i + 1].x);
        const dy = Math.abs(middle[i].y - middle[i + 1].y);
        if (dx < EPS && dy > EPS) {
          middle = [
            { x: trunkSourceX, y: middle[i].y },
            { x: trunkSourceX, y: middle[i + 1].y },
            ...middle.slice(i + 2),
          ];
          break;
        }
      }
      // Find the LAST vertical segment and replace everything after it
      // with a horizontal stub at trunkTargetX.
      for (let i = middle.length - 2; i >= 0; i--) {
        const dx = Math.abs(middle[i].x - middle[i + 1].x);
        const dy = Math.abs(middle[i].y - middle[i + 1].y);
        if (dx < EPS && dy > EPS) {
          middle = [
            ...middle.slice(0, i),
            { x: trunkTargetX, y: middle[i].y },
            { x: trunkTargetX, y: middle[i + 1].y },
          ];
          break;
        }
      }
      const adjusted: Array<{ x: number; y: number }> = [
        // Source overshoot 2 px back into the node (hidden by opaque body),
        // target ends exactly on the border (no bleed through translucent
        // headers). Same reasoning as the TB branch below.
        { x: sourceX - 2, y: sourceY },
        { x: trunkSourceX, y: sourceY },
        ...middle,
        { x: trunkTargetX, y: targetY },
        { x: targetX, y: targetY },
      ];
      const built = buildRoundedOrthogonalPath(adjusted, CORNER_RADIUS);
      return { path: built.path, labelX: (sourceX + targetX) / 2, labelY: targetY };
    } else {
      // TB layout: trunks are vertical stubs off the top/bottom handle.
      const trunkSourceY = sourceY + TRUNK_LENGTH_FROM_SOURCE;
      const trunkTargetY = targetY - TRUNK_LENGTH_TO_TARGET;
      // "Effectively straight" detection: source, target, and every dagre
      // middle waypoint share an X within a generous tolerance. Without
      // this, dagre's per-rank positioning drift (especially between a
      // trigger node and the first regular step, or before/after a wide
      // foreach group) gets materialised by the trunk-stub elbow logic
      // as a small horizontal jog just below the source. A real branch
      // diverges far more than this (a whole node width plus separation),
      // so the threshold can safely sit well above any drift we observe.
      const allXs = [sourceX, targetX, ...middle.map((p) => p.x)];
      const xSpread = Math.max(...allXs) - Math.min(...allXs);
      if (xSpread < STRAIGHT_X_THRESHOLD) {
        const builtStraight = buildRoundedOrthogonalPath(
          [
            // Source: extend 2 px back into the node so the line meets the
            // bottom border with no visible gap. (Hidden by the opaque
            // source body.) Target: end exactly on the border so no
            // overshoot can bleed through a translucent container header.
            { x: sourceX, y: sourceY - 2 },
            { x: sourceX, y: trunkSourceY },
            { x: sourceX, y: trunkTargetY },
            { x: sourceX, y: targetY },
          ],
          CORNER_RADIUS
        );
        return {
          path: builtStraight.path,
          labelX: sourceX,
          labelY: sourceY + TB_LABEL_Y_OFFSET,
        };
      } else {
        // Find the FIRST horizontal segment in the dagre middle. Replace any
        // points before it with a single endpoint at trunk-Y so the bend
        // happens right after the source instead of at the mid-edge (where
        // labels sit). Works for any shape — single-bend or multi-bend.
        for (let i = 0; i < middle.length - 1; i++) {
          const dx = Math.abs(middle[i].x - middle[i + 1].x);
          const dy = Math.abs(middle[i].y - middle[i + 1].y);
          if (dy < EPS && dx > EPS) {
            middle = [
              { x: middle[i].x, y: trunkSourceY },
              { x: middle[i + 1].x, y: trunkSourceY },
              ...middle.slice(i + 2),
            ];
            break;
          }
        }
        // Find the LAST horizontal segment and pull it down to trunk-Y of
        // the target. Replace anything after it with a single endpoint so
        // multiple incoming edges share their final approach.
        for (let i = middle.length - 2; i >= 0; i--) {
          const dx = Math.abs(middle[i].x - middle[i + 1].x);
          const dy = Math.abs(middle[i].y - middle[i + 1].y);
          if (dy < EPS && dx > EPS) {
            middle = [
              ...middle.slice(0, i),
              { x: middle[i].x, y: trunkTargetY },
              { x: middle[i + 1].x, y: trunkTargetY },
            ];
            break;
          }
        }
        const adjusted: Array<{ x: number; y: number }> = [
          // Source: extend 2 px back into the node (hidden by the opaque
          // body) so the line meets the bottom border with no visible gap.
          // Target: end exactly on the border so no overshoot can bleed
          // through a translucent container header.
          { x: sourceX, y: sourceY - 2 },
          { x: sourceX, y: trunkSourceY },
          ...middle,
          { x: targetX, y: trunkTargetY },
          { x: targetX, y: targetY },
        ];
        const built = buildRoundedOrthogonalPath(adjusted, CORNER_RADIUS);
        return { path: built.path, labelX: targetX, labelY: sourceY + TB_LABEL_Y_OFFSET };
      }
    }
  }

  // Smooth-step fallback: no dagre waypoints, not fork/merge bus.
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: CORNER_RADIUS,
  });
  return { path, labelX, labelY };
};
