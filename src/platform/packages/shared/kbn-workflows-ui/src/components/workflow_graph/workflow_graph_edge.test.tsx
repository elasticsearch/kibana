/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Component-level tests for WorkflowGraphEdge gate logic.
 *
 * Strategy: render WorkflowGraphEdge directly inside a minimal SVG container,
 * with EdgeLabelRenderer mocked to render children inline (instead of
 * portalling — jsdom has no real viewport so React Flow's portal container
 * never receives content).  getSmoothStepPath is also mocked to a deterministic
 * midpoint so fallback-path tests are reliable.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { Position } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — registered before any import of the module under test.
// ---------------------------------------------------------------------------
jest.mock('@xyflow/react', () => {
  const actual = jest.requireActual('@xyflow/react');
  return {
    ...actual,
    // Render labels inline so they appear in the normal DOM tree.
    // Use data-test-subj because Kibana's RTL setup configures testIdAttribute
    // to 'data-test-subj' (see kbn-test/src/jest/setup/react_testing_library.js).
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
      <div data-test-subj="edge-label-renderer">{children}</div>
    ),
    // Return a deterministic midpoint so smooth-step fallback tests are precise.
    getSmoothStepPath: (opts: {
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
      [key: string]: unknown;
    }): [string, number, number] => {
      const midX = (opts.sourceX + opts.targetX) / 2;
      const midY = (opts.sourceY + opts.targetY) / 2;
      return [`M ${opts.sourceX} ${opts.sourceY} L ${opts.targetX} ${opts.targetY}`, midX, midY];
    },
  };
});

// ---------------------------------------------------------------------------
// Import after mock is registered.
// ---------------------------------------------------------------------------
import { WorkflowGraphEdge } from './workflow_graph_edge';

// ---------------------------------------------------------------------------
// Constants that mirror the implementation's FORK_BUS_TRUNK / FORK_BUS_LABEL_OFFSET.
// ---------------------------------------------------------------------------
const FORK_BUS_TRUNK = 20;
const FORK_BUS_LABEL_OFFSET = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEdgeProps(overrides: Partial<EdgeProps>): EdgeProps {
  return {
    id: 'test-edge',
    source: 'src',
    target: 'tgt',
    sourceX: 200,
    sourceY: 100,
    targetX: 300,
    targetY: 220,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    selected: false,
    animated: false,
    interactionWidth: 20,
    data: {},
    style: {},
    markerEnd: undefined,
    markerStart: undefined,
    ...overrides,
  } as EdgeProps;
}

function renderSingleEdge(props: EdgeProps): void {
  render(
    <svg>
      <g>
        <WorkflowGraphEdge {...props} />
      </g>
    </svg>
  );
}

/**
 * Extract the Y translation from the latest label div's transform style.
 * Expected style: "…transform: translate(-50%, -50%) translate(Xpx, Ypx);…"
 */
function getLabelY(): number {
  const containers = screen.getAllByTestId('edge-label-renderer');
  const container = containers[containers.length - 1];
  const labelDiv = container.querySelector<HTMLElement>('div[style*="translate"]');
  if (!labelDiv) throw new Error('No label div with translate style found');
  const style = labelDiv.getAttribute('style') ?? '';
  const match = style.match(/translate\(-50%,\s*-50%\)\s*translate\([^,]+,\s*([\d.]+)px\)/);
  if (!match) throw new Error(`Could not parse labelY from style: "${style}"`);
  return parseFloat(match[1]);
}

function getLabelX(): number {
  const containers = screen.getAllByTestId('edge-label-renderer');
  const container = containers[containers.length - 1];
  const labelDiv = container.querySelector<HTMLElement>('div[style*="translate"]');
  if (!labelDiv) throw new Error('No label div with translate style found');
  const style = labelDiv.getAttribute('style') ?? '';
  const match = style.match(/translate\(-50%,\s*-50%\)\s*translate\(([\d.]+)px,/);
  if (!match) throw new Error(`Could not parse labelX from style: "${style}"`);
  return parseFloat(match[1]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

describe('WorkflowGraphEdge — fork bus routing gate', () => {
  describe('if/else branch labels (TB) — core regression for unbalanced if/else', () => {
    /**
     * Both branch edges share the same source (the `if` node).
     * true branch → shallow target;  false branch → deep target.
     *
     * Pre-fix: labels land at path midpoints → different Y values.
     * Post-fix: both edges use the bus fixed-offset anchor → same Y.
     */
    it('aligns true-branch and false-branch labels on the same Y row regardless of target depth', () => {
      const sharedSource = { sourceX: 200, sourceY: 100, sourcePosition: Position.Bottom };

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-then',
          ...sharedSource,
          targetX: 100,
          targetY: 220, // shallow target
          targetPosition: Position.Top,
          data: { branchType: 'then', label: 'true' },
        })
      );
      const thenY = getLabelY();

      cleanup();

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-else',
          ...sharedSource,
          targetX: 300,
          targetY: 380, // deep target — different depth, same source
          targetPosition: Position.Top,
          data: { branchType: 'else', label: 'false' },
        })
      );
      const elseY = getLabelY();

      // Labels must land on the same row (identical Y within 1px tolerance).
      // This is the direct regression assertion for the bug.
      expect(Math.abs(thenY - elseY)).toBeLessThanOrEqual(1);
    });

    it('aligns true-branch and false-branch labels in LR layout', () => {
      const sharedSource = { sourceX: 100, sourceY: 200, sourcePosition: Position.Right };

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-then-lr',
          ...sharedSource,
          targetX: 320,
          targetY: 100, // shallow
          targetPosition: Position.Left,
          data: { branchType: 'then', label: 'true' },
        })
      );
      const thenX = getLabelX();

      cleanup();

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-else-lr',
          ...sharedSource,
          targetX: 480,
          targetY: 300, // deep
          targetPosition: Position.Left,
          data: { branchType: 'else', label: 'false' },
        })
      );
      const elseX = getLabelX();

      expect(Math.abs(thenX - elseX)).toBeLessThanOrEqual(1);
    });
  });

  describe('switch case labels remain aligned after the generalization', () => {
    it('aligns switch case labels on the same Y row (regression guard — TB)', () => {
      const sharedSource = { sourceX: 200, sourceY: 100, sourcePosition: Position.Bottom };

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-caseA',
          ...sharedSource,
          targetX: 100,
          targetY: 220,
          targetPosition: Position.Top,
          data: { branchType: 'switch', label: 'caseA' },
        })
      );
      const yA = getLabelY();

      cleanup();

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-caseB',
          ...sharedSource,
          targetX: 300,
          targetY: 380,
          targetPosition: Position.Top,
          data: { branchType: 'switch', label: 'caseB' },
        })
      );
      const yB = getLabelY();

      expect(Math.abs(yA - yB)).toBeLessThanOrEqual(1);
    });
  });

  describe('fallback guard — sub-trunk gap uses smooth-step', () => {
    it('falls back to smooth-step when the fork gap is below FORK_BUS_TRUNK (TB)', () => {
      // Target is only 10px below source — less than FORK_BUS_TRUNK=20.
      // The bus would be degenerate; smooth-step is correct.
      // Our getSmoothStepPath mock returns midpoint Y = (100+110)/2 = 105.
      // The bus would produce: sourceY + FORK_BUS_TRUNK + FORK_BUS_LABEL_OFFSET = 100 + 20 + 20 = 140.
      renderSingleEdge(
        makeEdgeProps({
          id: 'e-small-gap',
          sourceX: 200,
          sourceY: 100,
          sourcePosition: Position.Bottom,
          targetX: 200,
          targetY: 110, // gap = 10, below FORK_BUS_TRUNK (20)
          targetPosition: Position.Top,
          data: { branchType: 'then', label: 'true' },
        })
      );
      const y = getLabelY();

      const expectedSmoothStepY = (100 + 110) / 2; // 105
      const busY = 100 + FORK_BUS_TRUNK + FORK_BUS_LABEL_OFFSET; // 140

      // Should use smooth-step midpoint, not bus anchor.
      expect(y).toBeCloseTo(expectedSmoothStepY, 0);
      expect(y).toBeLessThan(busY);
    });
  });

  describe('merge edges (no branchType) remain on smooth-step', () => {
    it('uses smooth-step (midpoint label) when branchType and isMerge are both absent', () => {
      // An untagged edge (no branchType, no isMerge) must stay on smooth-step.
      // If it accidentally hit the fork bus or merge bus, the label would land
      // far from the smooth-step midpoint.
      renderSingleEdge(
        makeEdgeProps({
          id: 'e-merge',
          sourceX: 100,
          sourceY: 300,
          sourcePosition: Position.Bottom,
          targetX: 200,
          targetY: 500,
          targetPosition: Position.Top,
          data: { label: 'irrelevant' }, // no branchType, no isMerge
        })
      );
      const y = getLabelY();

      // Smooth-step midpoint: (300 + 500) / 2 = 400
      expect(y).toBeCloseTo((300 + 500) / 2, 0);
    });
  });
});

describe('WorkflowGraphEdge — merge bus routing (isMerge flag)', () => {
  // Coordinates from the offline layout probe of the real if_only topology:
  // placeholder at centerX=200, centerY=300; switch top at y=402.
  // busY = targetY_top − MERGE_BUS_TRUNK = 402 − 20 = 382.
  const MERGE_BUS_TRUNK = 20;

  describe('TB — isMerge edge routes via merge bus', () => {
    it('routes an isMerge edge above gap threshold via merge bus, not smooth-step', () => {
      // placeholder → switch: sourceY=300, targetY=402, gap=102 > MERGE_BUS_TRUNK(20).
      // Merge bus busY = 402 − 20 = 382.  smooth-step midY = (300+402)/2 = 351.
      // The rendered path should NOT land at the smooth-step midpoint.
      renderSingleEdge(
        makeEdgeProps({
          id: 'e-placeholder-merge',
          sourceX: 200,
          sourceY: 300,
          sourcePosition: Position.Bottom,
          targetX: 100,
          targetY: 402,
          targetPosition: Position.Top,
          data: { isMerge: true }, // no branchType — this is the merge flag
        })
      );
      // The path element should contain the busY (382), not the smooth-step midpoint (351).
      const path = document.querySelector('path.react-flow__edge-path');
      expect(path).not.toBeNull();
      const d = path?.getAttribute('d') ?? '';
      expect(d).toContain('382');
      expect(d).not.toContain('351');
    });

    it('falls back to smooth-step when isMerge gap is below MERGE_BUS_TRUNK', () => {
      // Gap = 10 < MERGE_BUS_TRUNK (20) → smooth-step.
      renderSingleEdge(
        makeEdgeProps({
          id: 'e-small-merge',
          sourceX: 100,
          sourceY: 300,
          sourcePosition: Position.Bottom,
          targetX: 100,
          targetY: 310, // gap = 10
          targetPosition: Position.Top,
          data: { isMerge: true, label: 'x' },
        })
      );
      const y = getLabelY();
      // smooth-step midpoint = (300 + 310) / 2 = 305
      expect(y).toBeCloseTo((300 + 310) / 2, 0);
    });

    it('two isMerge edges sharing a target produce the same busY in their paths', () => {
      const target = { targetX: 100, targetY: 402, targetPosition: Position.Top };

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-bye-merge',
          sourceX: 0,
          sourceY: 300,
          sourcePosition: Position.Bottom,
          ...target,
          data: { isMerge: true },
        })
      );
      const byePath = document.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';

      cleanup();

      renderSingleEdge(
        makeEdgeProps({
          id: 'e-placeholder-merge',
          sourceX: 200,
          sourceY: 300,
          sourcePosition: Position.Bottom,
          ...target,
          data: { isMerge: true },
        })
      );
      const placeholderPath =
        document.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';

      // Both paths must contain busY = 402 − 20 = 382
      const busY = 402 - MERGE_BUS_TRUNK;
      expect(byePath).toContain(String(busY));
      expect(placeholderPath).toContain(String(busY));
    });
  });

  describe('hideEndMarker suppresses the arrowhead', () => {
    it('omits markerEnd when hideEndMarker is true', () => {
      renderSingleEdge(
        makeEdgeProps({
          id: 'e-hidden-arrow',
          data: { branchType: 'else', label: 'false', hideEndMarker: true },
        })
      );
      const path = document.querySelector('path.react-flow__edge-path');
      expect(path?.getAttribute('marker-end')).toBeFalsy();
    });

    it('renders markerEnd when hideEndMarker is absent', () => {
      renderSingleEdge(
        makeEdgeProps({
          id: 'e-visible-arrow',
          data: { branchType: 'then', label: 'true' },
        })
      );
      const path = document.querySelector('path.react-flow__edge-path');
      expect(path?.getAttribute('marker-end')).toMatch(/url\(#arrow-/);
    });
  });
});
