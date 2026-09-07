/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { WorkflowGraphCanvasWithoutProvider } from './workflow_graph_canvas';

// Mutable state driving the mocked React Flow store.
let mockStoreWidth = 0;
let mockStoreHeight = 0;
let mockCapturedOnInit: ((instance: unknown) => void) | undefined;
let mockCapturedOnMoveEnd:
  | ((event: MouseEvent | TouchEvent | null, viewport: unknown) => void)
  | undefined;
// DOM layout stubs — controlled independently from store dimensions so tests
// can exercise the store-vs-DOM mismatch.
let mockDomWidth = 0;
let mockDomHeight = 0;
let widthSpy: jest.SpyInstance;
let heightSpy: jest.SpyInstance;

// A minimal two-node layout (trigger + one step). graphBounds derived from this:
// minX=0, minY=0, maxX=200, maxY=214 => centerX=100, centerY=107.
const mockNodes = [
  { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, width: 200, height: 64, data: {} },
  { id: 'step1', type: 'step', position: { x: 0, y: 150 }, width: 200, height: 64, data: {} },
];

jest.mock('./use_workflow_layout', () => ({
  useWorkflowLayout: () => ({ nodes: mockNodes, edges: [] }),
}));

// Replace React Flow with light stand-ins: `ReactFlow` captures the `onInit`
// and `onMoveEnd` callbacks; the store hooks return our controllable dimensions.
jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  ReactFlow: ({
    onInit,
    onMoveEnd,
    children,
  }: {
    onInit?: (i: unknown) => void;
    onMoveEnd?: (event: MouseEvent | TouchEvent | null, viewport: unknown) => void;
    children?: React.ReactNode;
  }) => {
    mockCapturedOnInit = onInit;
    mockCapturedOnMoveEnd = onMoveEnd;
    return <div data-test-subj="reactflow-mock">{children}</div>;
  },
  Background: () => null,
  MiniMap: () => null,
  Panel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Handle: () => null,
  useReactFlow: () => ({ zoomIn: jest.fn(), zoomOut: jest.fn() }),
  useStore: (selector: (s: { width: number; height: number }) => unknown) =>
    selector({ width: mockStoreWidth, height: mockStoreHeight }),
}));

// Simulate the React Flow store transforms so assertions can check the
// *resulting screen position* rather than raw call arguments. This is the
// coverage that was missing before: assertions that pass with store=500 and
// dom=610 are actually testing the fix.
const makeInstance = () => {
  let viewport = { x: 0, y: 0, zoom: 1 };
  return {
    // Mirrors store.setCenter (index.js:3605): divides by STORE dims.
    setCenter: jest.fn((x: number, y: number, o?: { zoom?: number }) => {
      const z = o?.zoom ?? 2;
      viewport = { x: mockStoreWidth / 2 - x * z, y: mockStoreHeight / 2 - y * z, zoom: z };
    }),
    // Mirrors panZoom.setViewport: applied verbatim, no store-dim division.
    setViewport: jest.fn((v: { x: number; y: number; zoom: number }) => {
      viewport = { ...v };
    }),
    fitView: jest.fn(),
    fitBounds: jest.fn(),
    getViewport: () => ({ ...viewport }),
  };
};

// Convert a flow-space coordinate to screen-space given the current viewport.
const toScreen = (
  instance: ReturnType<typeof makeInstance>,
  flowX: number,
  flowY: number
): { x: number; y: number } => {
  const v = instance.getViewport();
  return { x: flowX * v.zoom + v.x, y: flowY * v.zoom + v.y };
};

const baseProps = {
  workflow: undefined,
  isYamlValid: true,
  onStepSelect: jest.fn(),
} as const;

// Set the React Flow store dimensions (simulates the ResizeObserver firing).
const measureStore = (w = 1200, h = 900) => {
  mockStoreWidth = w;
  mockStoreHeight = h;
};

// Set the wrapper's DOM dimensions as seen by clientWidth/clientHeight.
const layoutDom = (w: number, h: number) => {
  mockDomWidth = w;
  mockDomHeight = h;
};

beforeEach(() => {
  mockStoreWidth = 0;
  mockStoreHeight = 0;
  mockDomWidth = 0;
  mockDomHeight = 0;
  mockCapturedOnInit = undefined;
  mockCapturedOnMoveEnd = undefined;

  widthSpy = jest
    .spyOn(window.HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(() => mockDomWidth);
  heightSpy = jest
    .spyOn(window.HTMLElement.prototype, 'clientHeight', 'get')
    .mockImplementation(() => mockDomHeight);
});

afterEach(() => {
  widthSpy.mockRestore();
  heightSpy.mockRestore();
});

describe('WorkflowGraphCanvas initial centering', () => {
  it('does not center the viewport until the canvas has been measured', () => {
    const instance = makeInstance();
    const { rerender } = render(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);

    // React Flow fires onInit before its ResizeObserver measures the container.
    act(() => mockCapturedOnInit!(instance));
    expect(instance.setViewport).not.toHaveBeenCalled();

    // Once the store reports real dimensions AND the DOM is laid out, centering runs.
    measureStore();
    layoutDom(1200, 900);
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    expect(toScreen(instance, 100, 0).x).toBeCloseTo(600); // dom.w/2
  });

  it('centers exactly once even as dimensions keep updating', () => {
    const instance = makeInstance();
    const { rerender } = render(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    act(() => mockCapturedOnInit!(instance));

    measureStore();
    layoutDom(1200, 900);
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    expect(instance.setViewport).toHaveBeenCalledTimes(1);

    // A later resize must not re-center over the user.
    mockStoreWidth = 1600;
    mockStoreHeight = 1000;
    layoutDom(1600, 1000);
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    expect(instance.setViewport).toHaveBeenCalledTimes(1);
  });

  it('centers once under React StrictMode', () => {
    const instance = makeInstance();
    measureStore();
    layoutDom(1200, 900);
    const { rerender } = render(
      <React.StrictMode>
        <WorkflowGraphCanvasWithoutProvider {...baseProps} />
      </React.StrictMode>
    );
    act(() => mockCapturedOnInit!(instance));
    rerender(
      <React.StrictMode>
        <WorkflowGraphCanvasWithoutProvider {...baseProps} />
      </React.StrictMode>
    );

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
  });

  it('signals ready without manual centering when fitView is set', () => {
    const onReady = jest.fn();
    const instance = makeInstance();
    measureStore();
    layoutDom(1200, 900);
    render(<WorkflowGraphCanvasWithoutProvider {...baseProps} fitView onReady={onReady} />);

    act(() => mockCapturedOnInit!(instance));

    expect(instance.setViewport).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not re-center over a restored defaultViewport', () => {
    const onReady = jest.fn();
    const instance = makeInstance();
    measureStore();
    layoutDom(1200, 900);
    render(
      <WorkflowGraphCanvasWithoutProvider
        {...baseProps}
        defaultViewport={{ x: 10, y: 20, zoom: 1.5 }}
        onReady={onReady}
      />
    );

    act(() => mockCapturedOnInit!(instance));

    expect(instance.setViewport).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not latch while the DOM wrapper is unmeasured even if the store has the 500 fallback', () => {
    const instance = makeInstance();
    layoutDom(0, 0); // DOM has no size yet
    measureStore(500, 500); // store has the || 500 fallback — old code latched here
    const { rerender } = render(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    act(() => mockCapturedOnInit!(instance));
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    expect(instance.setViewport).not.toHaveBeenCalled();

    // Once the DOM is laid out AND the store updates, centering fires exactly once.
    layoutDom(1510, 610);
    mockStoreHeight = 610; // ResizeObserver fires with real value → re-triggers effect
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    expect(toScreen(instance, 0, 0).y).toBe(80);
  });
});

// ─── Regression: store-vs-DOM mismatch ───────────────────────────────────────
//
// Before the fix, `applyHomeViewport` read container dims from the DOM but
// applied the result via `setCenter`, which divides by React Flow's store dims.
// When the store held the `|| 500` fallback, every axis landed off by
// `(store.dim − dom.dim) / 2`.
//
// graphBounds: minX=0 minY=0 maxX=200 maxY=214, centerX=100, centerY=107.
// INITIAL_ZOOM=1, TOP_PADDING=80.
//
// TB anchored formula (dimension-free): screen_y(minY) = minY*z + (80−minY*z) = 80 ✓
// LR anchored formula (dimension-free): screen_x(minX) = minX*z + (80−minX*z) = 80 ✓
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkflowGraphCanvas store-vs-DOM mismatch regression', () => {
  it('TB: anchors trigger 80px below the top when store height disagrees with the DOM', () => {
    const instance = makeInstance();
    layoutDom(1510, 610); // real container
    measureStore(1510, 500); // React Flow store.height is the || 500 fallback

    const { rerender } = render(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    act(() => mockCapturedOnInit!(instance));
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);

    expect(toScreen(instance, 0, 0).y).toBe(80); // was (500/2 − 610/2 + 80) = 25 before fix
    expect(toScreen(instance, 100, 0).x).toBeCloseTo(755); // dom.w/2, not store.w/2
  });

  it('LR: anchors trigger 80px from left and centres vertically on DOM height', () => {
    const instance = makeInstance();
    layoutDom(1510, 610);
    measureStore(1510, 500);

    const { rerender } = render(
      <WorkflowGraphCanvasWithoutProvider {...baseProps} direction="LR" />
    );
    act(() => mockCapturedOnInit!(instance));
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} direction="LR" />);

    expect(toScreen(instance, 0, 0).x).toBe(80); // was flush-left before fix
    expect(toScreen(instance, 0, 107).y).toBeCloseTo(305); // dom.h/2, was 250 ("500px height")
  });

  it('setCenter is never called for framing (regression guard)', () => {
    const instance = makeInstance();
    layoutDom(1510, 610);
    measureStore(1510, 610);
    const { rerender } = render(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    act(() => mockCapturedOnInit!(instance));
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    expect(instance.setCenter).not.toHaveBeenCalled();
  });
});

// ─── Regression: nodesInitialized gate removed ───────────────────────────────
//
// RF's s.nodesInitialized flag is only updated by setNodes(), which fires when
// the user's `nodes` prop changes. For a memoized, static graph the flag stays
// false permanently after initial mount, permanently blocking centering.
// The fix: remove the guard — applyHomeViewport reads graphBounds from the
// dagre-computed node positions, not from RF's internal measured dimensions.
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkflowGraphCanvas nodesInitialized gate removed', () => {
  it('centers the viewport even though RF nodesInitialized stays false for a static graph', () => {
    const instance = makeInstance();
    // Deliberately set store dims directly (not via measureStore) so the reader
    // can see that nodesInitialized is irrelevant — it is not set here.
    mockStoreWidth = 1200;
    mockStoreHeight = 900;
    layoutDom(1200, 900);
    const { rerender } = render(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    act(() => mockCapturedOnInit!(instance));
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} />);
    expect(instance.setViewport).toHaveBeenCalledTimes(1);
  });
});

// ─── Regression: programmatic onMoveEnd must not update graphViewportRef ─────
//
// React Flow fires onMoveEnd(null, viewport) for its own initial viewport set
// (via setViewportConstrained → d3 zoom end event). If we forward that to
// onViewportChange, graphViewportRef gets polluted and is passed back as
// defaultViewport on the next re-render, which causes handleInit to set
// hasCenteredInitialViewRef=true and skip all centering forever.
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkflowGraphCanvas handleMoveEnd event gate', () => {
  it('does not call onViewportChange when event is null (programmatic viewport)', () => {
    const onViewportChange = jest.fn();
    render(
      <WorkflowGraphCanvasWithoutProvider {...baseProps} onViewportChange={onViewportChange} />
    );
    act(() => mockCapturedOnMoveEnd?.(null, { x: 0, y: 0, zoom: 1 }));
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it('calls onViewportChange when event is a real MouseEvent (user gesture)', () => {
    const onViewportChange = jest.fn();
    render(
      <WorkflowGraphCanvasWithoutProvider {...baseProps} onViewportChange={onViewportChange} />
    );
    act(() => mockCapturedOnMoveEnd?.(new MouseEvent('mouseup'), { x: 10, y: 20, zoom: 1.5 }));
    expect(onViewportChange).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 1.5 });
  });
});

// ─── Reset zoom equivalence ───────────────────────────────────────────────────
//
// The first open and clicking "Reset zoom" must land on exactly the same
// screen position. Only the animation duration differs (0ms vs 200ms).
//
// With layoutDom(1200, 900) and fixture bounds (centerX=100, centerY=107):
//   TB: viewport = { x: 1200/2 − 100 = 500, y: 80 − 0 = 80, zoom: 1 }
//   LR: viewport = { x: 80 − 0 = 80,        y: 900/2 − 107 = 343, zoom: 1 }
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkflowGraphCanvas initial centering and Reset zoom are equivalent', () => {
  it('TB layout: first open and Reset zoom call setViewport with the same viewport', () => {
    const instance = makeInstance();
    measureStore();
    layoutDom(1200, 900);
    const { rerender } = render(
      <WorkflowGraphCanvasWithoutProvider {...baseProps} showZoomControls />
    );
    act(() => mockCapturedOnInit!(instance));
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} showZoomControls />);

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    const initialVp = instance.setViewport.mock.calls[0][0];

    instance.setViewport.mockClear();

    fireEvent.click(screen.getByTestId('workflowCanvas-reset-zoom'));

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    const resetVp = instance.setViewport.mock.calls[0][0];

    expect(resetVp.x).toBe(initialVp.x);
    expect(resetVp.y).toBe(initialVp.y);
    expect(resetVp.zoom).toBe(initialVp.zoom);
  });

  it('LR layout: first open and Reset zoom call setViewport with the same viewport', () => {
    const instance = makeInstance();
    measureStore();
    layoutDom(1200, 900);
    const { rerender } = render(
      <WorkflowGraphCanvasWithoutProvider {...baseProps} showZoomControls direction="LR" />
    );
    act(() => mockCapturedOnInit!(instance));
    rerender(<WorkflowGraphCanvasWithoutProvider {...baseProps} showZoomControls direction="LR" />);

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    const initialVp = instance.setViewport.mock.calls[0][0];

    instance.setViewport.mockClear();

    fireEvent.click(screen.getByTestId('workflowCanvas-reset-zoom'));

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    const resetVp = instance.setViewport.mock.calls[0][0];

    expect(resetVp.x).toBe(initialVp.x);
    expect(resetVp.y).toBe(initialVp.y);
    expect(resetVp.zoom).toBe(initialVp.zoom);
  });
});

describe('WorkflowGraphCanvas Reset zoom button', () => {
  // DOM dims stay at 0 so the initial-centering effect (gated on clientWidth/clientHeight > 0)
  // stays dormant — the only setViewport call is from the click.

  it('resets to trigger-near-top for TB (vertical) layout', () => {
    const instance = makeInstance();
    layoutDom(1200, 900);
    render(<WorkflowGraphCanvasWithoutProvider {...baseProps} showZoomControls />);
    act(() => mockCapturedOnInit!(instance));

    fireEvent.click(screen.getByTestId('workflowCanvas-reset-zoom'));

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    // TB: x = dom.w/2 − centerX = 600 − 100 = 500; y = TOP_PADDING − minY = 80 − 0 = 80
    expect(instance.setViewport).toHaveBeenCalledWith(
      { x: 500, y: 80, zoom: 1 },
      { duration: 200 }
    );
  });

  it('resets to trigger-near-left for LR (horizontal) layout', () => {
    const instance = makeInstance();
    layoutDom(1200, 900);
    render(<WorkflowGraphCanvasWithoutProvider {...baseProps} showZoomControls direction="LR" />);
    act(() => mockCapturedOnInit!(instance));

    fireEvent.click(screen.getByTestId('workflowCanvas-reset-zoom'));

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    // LR: x = TOP_PADDING − minX = 80 − 0 = 80; y = dom.h/2 − centerY = 450 − 107 = 343
    expect(instance.setViewport).toHaveBeenCalledWith(
      { x: 80, y: 343, zoom: 1 },
      { duration: 200 }
    );
  });
});

describe('WorkflowGraphCanvas Fit to view button', () => {
  it('calls fitBounds with graph bounds when the fit-to-view button is clicked', () => {
    const instance = makeInstance();
    render(<WorkflowGraphCanvasWithoutProvider {...baseProps} showZoomControls />);
    act(() => mockCapturedOnInit!(instance));

    fireEvent.click(screen.getByTestId('workflowCanvas-fit-view'));

    expect(instance.fitBounds).toHaveBeenCalledTimes(1);
    expect(instance.fitBounds).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 200, height: 214 },
      { duration: 200, padding: 0.08 }
    );
  });
});
