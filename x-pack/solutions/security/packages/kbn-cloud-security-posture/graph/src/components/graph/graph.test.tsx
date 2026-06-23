/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, waitFor } from '@testing-library/react';
import React, { type RefAttributes } from 'react';
import { Graph, type GraphProps } from './graph';
import { TestProviders } from '../mock/test_providers';
import type { NodeViewModel, EdgeViewModel } from '../types';
import type { Edge, Node, ReactFlowInstance, ReactFlowProps } from '@xyflow/react';

// Turn off the optimization that hides elements that are not visible in the viewport
jest.mock('../constants', () => ({
  ...jest.requireActual('../constants'),
  ONLY_RENDER_VISIBLE_ELEMENTS: false,
}));

// Mock ReactFlow's fitView function
let mockFitView = jest.fn();

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  ReactFlow: (props: ReactFlowProps & RefAttributes<HTMLDivElement>) => {
    const OriginalReactFlow = jest.requireActual('@xyflow/react').ReactFlow;
    const OriginalReact = jest.requireActual('react');

    function onInitMocked(xyflow: ReactFlowInstance<Node<NodeViewModel>, Edge<EdgeViewModel>>) {
      // Store the original fitView function
      const mockOriginalFitView = xyflow.fitView;

      // Create a wrapper that tracks calls but still calls the original
      xyflow.fitView = (options?) => {
        // Only track calls with specific options (from our centering logic)
        if (options && typeof options === 'object' && options !== null) {
          const opts = options as Record<string, unknown>;
          if (opts.nodes || opts.duration === 200) {
            mockFitView(options);
          }
        }
        // Always call the original for actual ReactFlow functionality
        return mockOriginalFitView(options);
      };

      // @ts-ignore
      props.onInit?.(xyflow);
    }

    return OriginalReact.createElement(OriginalReactFlow, { ...props, onInit: onInitMocked });
  },
}));

const renderGraphPreview = (props: GraphProps) =>
  render(
    <TestProviders>
      <Graph {...props} />
    </TestProviders>
  );

describe('<Graph />', () => {
  describe('basic rendering', () => {
    it('should render empty graph', async () => {
      const { container } = renderGraphPreview({
        nodes: [],
        edges: [],
        interactive: false,
      });

      expect(container).not.toBeNull();

      await waitFor(() => {
        const nodes = container.querySelectorAll('.react-flow__nodes .react-flow__node');
        expect(nodes).toHaveLength(0);
      });
    });

    it('should render hexagon node', async () => {
      const { container } = renderGraphPreview({
        nodes: [
          {
            id: '1',
            label: 'Node 1',
            color: 'primary',
            shape: 'hexagon',
          },
        ],
        edges: [],
        interactive: false,
      });

      await waitFor(() => {
        const nodeEl = container.querySelector('[data-id="1"]');
        expect(nodeEl).not.toBeNull();
        expect(nodeEl).toHaveTextContent('Node 1');
      });
    });

    it('should render label node', async () => {
      const { container } = renderGraphPreview({
        nodes: [
          {
            id: '2',
            label: 'Node 2',
            color: 'primary',
            shape: 'label',
          },
        ],
        edges: [],
        interactive: false,
      });

      await waitFor(() => {
        const nodeEl = container.querySelector('[data-id="2"]');
        expect(nodeEl).not.toBeNull();
        expect(nodeEl).toHaveTextContent('Node 2');
      });
    });

    it('should render relationship node', async () => {
      const { container } = renderGraphPreview({
        nodes: [
          {
            id: 'rel1',
            label: 'Owns',
            shape: 'relationship',
          },
        ],
        edges: [],
        interactive: false,
      });

      await waitFor(() => {
        const nodeEl = container.querySelector('[data-id="rel1"]');
        expect(nodeEl).not.toBeNull();
        expect(nodeEl).toHaveTextContent('Owns');
      });
    });

    it('should render 2 nodes connected', async () => {
      const { container } = renderGraphPreview({
        nodes: [
          {
            id: '1',
            label: 'Node 1',
            color: 'primary',
            shape: 'hexagon',
          },
          {
            id: '2',
            label: 'Node 2',
            color: 'primary',
            shape: 'label',
          },
        ],
        edges: [
          {
            id: 'a(1)-b(2)',
            color: 'primary',
            source: '1',
            target: '2',
          },
        ],
        interactive: false,
      });

      await waitFor(() => {
        const srcNodeEl = container.querySelector('[data-id="1"]');
        expect(srcNodeEl).not.toBeNull();
        expect(srcNodeEl).toHaveTextContent('Node 1');

        const targetNodeEl = container.querySelector('[data-id="2"]');
        expect(targetNodeEl).not.toBeNull();
        expect(targetNodeEl).toHaveTextContent('Node 2');
      });

      // TODO: Fix this test (currently it is not rendered in xyflow version 12) https://github.com/xyflow/xyflow/issues/716#issuecomment-2414721074
      // const edgeEl = container.querySelector('[data-id="a(1)-b(2)"]');
      // expect(edgeEl).not.toBeNull();
    });
  });

  describe('centering after refresh', () => {
    const fitViewOptions = { duration: 200 };

    const initialNodes: NodeViewModel[] = [
      {
        id: 'entity1',
        label: 'Entity Node 1',
        color: 'primary',
        shape: 'hexagon',
      },
      {
        id: 'label1',
        label: 'Label Node',
        color: 'primary',
        shape: 'label',
      },
      {
        id: 'entity2',
        label: 'Entity Node 2',
        color: 'primary',
        shape: 'ellipse',
      },
    ];

    const initialEdges: EdgeViewModel[] = [
      {
        id: 'edge1',
        color: 'primary',
        source: 'entity1',
        target: 'label1',
      },
      {
        id: 'edge2',
        color: 'primary',
        source: 'label1',
        target: 'entity2',
      },
    ];

    beforeEach(() => {
      mockFitView = jest.fn();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should not center graph when no new nodes are added', async () => {
      const onCenterGraphAfterRefresh = jest.fn();

      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        onCenterGraphAfterRefresh,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      // Re-render with the same nodes (no new nodes)
      rerender(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      await waitFor(() => {
        // Should not trigger callback or fitView
        expect(onCenterGraphAfterRefresh).not.toHaveBeenCalled();
        expect(mockFitView).not.toHaveBeenCalled();
      });
    });

    it('should center on new nodes when onCenterGraphAfterRefresh is undefined', async () => {
      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        // onCenterGraphAfterRefresh is undefined
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      // Add new nodes
      const newNodes: NodeViewModel[] = [
        {
          id: 'newEntity1',
          label: 'New Entity 1',
          color: 'danger',
          shape: 'pentagon',
        },
      ];

      const updatedNodes = [...initialNodes, ...newNodes];

      rerender(
        <TestProviders>
          <Graph
            {...props}
            nodes={updatedNodes}
            // onCenterGraphAfterRefresh is still undefined
          />
        </TestProviders>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          updatedNodes.length
        );
      });

      await waitFor(() => {
        // Should center graph on the new nodes (default behavior)
        expect(mockFitView).toHaveBeenCalledWith({
          ...fitViewOptions,
          nodes: [{ id: newNodes[0].id }], // newNodes id
        });
      });
    });

    it('should center on new nodes when callback returns undefined', async () => {
      const onCenterGraphAfterRefresh = jest.fn().mockReturnValue(undefined);

      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        onCenterGraphAfterRefresh,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      const newNodes: NodeViewModel[] = [
        {
          id: 'newEntity1',
          label: 'New Entity 1',
          color: 'danger',
          shape: 'pentagon',
        },
      ];

      // Add new nodes
      const updatedNodes = [...initialNodes, ...newNodes];

      rerender(
        <TestProviders>
          <Graph {...props} nodes={updatedNodes} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          updatedNodes.length
        );
      });

      await waitFor(() => {
        // Should center graph on new nodes (default behavior)
        expect(onCenterGraphAfterRefresh).toHaveBeenCalledWith(newNodes);
        expect(mockFitView).toHaveBeenCalledWith({
          duration: 200,
          nodes: [{ id: newNodes[0].id }],
        });
      });
    });

    it('should fit entire graph into view when callback returns "fit-view"', async () => {
      const onCenterGraphAfterRefresh = jest.fn().mockReturnValue('fit-view');

      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        onCenterGraphAfterRefresh,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      // Add new nodes
      const newNodes: NodeViewModel[] = [
        {
          id: 'newEntity1',
          label: 'New Entity 1',
          color: 'danger',
          shape: 'pentagon',
        },
      ];

      const updatedNodes = [...initialNodes, ...newNodes];

      rerender(
        <TestProviders>
          <Graph {...props} nodes={updatedNodes} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          updatedNodes.length
        );
      });

      // Should call callback and then fit entire view
      await waitFor(() => {
        expect(onCenterGraphAfterRefresh).toHaveBeenCalledWith(newNodes);

        // no "nodes" key -> fit entire graph into view
        expect(mockFitView).toHaveBeenCalledWith({ duration: 200 });
      });
    });

    it('should do nothing when callback returns empty array', async () => {
      const onCenterGraphAfterRefresh = jest.fn().mockReturnValue([]);

      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        onCenterGraphAfterRefresh,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      // Add new nodes
      const newNodes: NodeViewModel[] = [
        {
          id: 'newEntity1',
          label: 'New Entity 1',
          color: 'danger',
          shape: 'pentagon',
        },
      ];

      const updatedNodes = [...initialNodes, ...newNodes];

      rerender(
        <TestProviders>
          <Graph {...props} nodes={updatedNodes} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          updatedNodes.length
        );
      });

      // Should call callback but not center on any nodes
      await waitFor(() => {
        expect(onCenterGraphAfterRefresh).toHaveBeenCalledWith(newNodes);
        expect(mockFitView).not.toHaveBeenCalled();
      });
    });

    it('should center on specified nodes when callback returns valid node IDs', async () => {
      const onCenterGraphAfterRefresh = jest.fn().mockReturnValue(['entity1', 'entity2']);

      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        onCenterGraphAfterRefresh,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      // Add new nodes
      const newNodes: NodeViewModel[] = [
        {
          id: 'newEntity1',
          label: 'New Entity 1',
          color: 'danger',
          shape: 'pentagon',
        },
      ];

      const updatedNodes = [...initialNodes, ...newNodes];

      rerender(
        <TestProviders>
          <Graph {...props} nodes={updatedNodes} />
        </TestProviders>
      );

      // Should center on the specified existing nodes, not the new ones
      await waitFor(() => {
        expect(onCenterGraphAfterRefresh).toHaveBeenCalledWith(newNodes);
        expect(mockFitView).toHaveBeenCalledWith({
          duration: 200,
          nodes: [{ id: 'entity1' }, { id: 'entity2' }],
        });
      });
    });

    it('should handle invalid/non-existent node IDs gracefully', async () => {
      const onCenterGraphAfterRefresh = jest.fn().mockReturnValue(['non-existent-id', '', '   ']);

      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        onCenterGraphAfterRefresh,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      // Add new nodes
      const newNodes: NodeViewModel[] = [
        {
          id: 'newEntity1',
          label: 'New Entity 1',
          color: 'danger',
          shape: 'pentagon',
        },
      ];

      const updatedNodes = [...initialNodes, ...newNodes];

      rerender(
        <TestProviders>
          <Graph {...props} nodes={updatedNodes} />
        </TestProviders>
      );

      // Should call callback and attempt to center, but with filtered valid strings
      await waitFor(() => {
        expect(onCenterGraphAfterRefresh).toHaveBeenCalledWith(newNodes);
        expect(mockFitView).not.toHaveBeenCalled();
      });
    });

    it('should center on origin relationship nodes for entity origin scenario', async () => {
      const props = {
        nodes: [
          { id: 'originEntity', label: 'Origin Entity', color: 'primary', shape: 'ellipse' },
          { id: 'target1', label: 'Target 1', color: 'primary', shape: 'hexagon' },
          { id: 'target2', label: 'Target 2', color: 'primary', shape: 'rectangle' },
          { id: 'rel-owns', label: 'Owns', shape: 'relationship', isOrigin: true },
          {
            id: 'rel-communicates',
            label: 'Communicates with',
            shape: 'relationship',
            isOrigin: true,
          },
          { id: 'rel-depends', label: 'Depends on', shape: 'relationship' },
        ] as NodeViewModel[],
        edges: [
          { id: 'e1', source: 'originEntity', target: 'rel-owns', color: 'primary' },
          { id: 'e2', source: 'originEntity', target: 'rel-communicates', color: 'primary' },
          { id: 'e3', source: 'rel-owns', target: 'target1', color: 'primary' },
          { id: 'e4', source: 'rel-communicates', target: 'target2', color: 'primary' },
          { id: 'e5', source: 'target1', target: 'rel-depends', color: 'primary' },
        ] as EdgeViewModel[],
        interactive: true,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(6);
      });

      const newNodes: NodeViewModel[] = [
        { id: 'target1a', label: 'Target 1a', color: 'primary', shape: 'diamond' },
      ];

      rerender(
        <TestProviders>
          <Graph {...props} nodes={[...props.nodes, ...newNodes]} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(7);
      });

      await waitFor(() => {
        expect(mockFitView).toHaveBeenCalledWith({
          ...fitViewOptions,
          nodes: [{ id: newNodes[0].id }],
        });
      });
    });

    it('should handle mixed valid and invalid node IDs', async () => {
      const onCenterGraphAfterRefresh = jest
        .fn()
        .mockReturnValue(['entity1', 'non-existent-id', '', '   ']);

      const props = {
        nodes: initialNodes,
        edges: initialEdges,
        interactive: true,
        onCenterGraphAfterRefresh,
      };

      const { container, rerender } = render(
        <TestProviders>
          <Graph {...props} />
        </TestProviders>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__nodes .react-flow__node')).toHaveLength(
          initialNodes.length
        );
      });

      // Add new nodes
      const newNodes: NodeViewModel[] = [
        {
          id: 'newEntity1',
          label: 'New Entity 1',
          color: 'danger',
          shape: 'pentagon',
        },
      ];

      const updatedNodes = [...initialNodes, ...newNodes];

      rerender(
        <TestProviders>
          <Graph {...props} nodes={updatedNodes} />
        </TestProviders>
      );

      // Should call callback and attempt to center, but with filtered valid strings
      await waitFor(() => {
        expect(onCenterGraphAfterRefresh).toHaveBeenCalledWith(newNodes);
        expect(mockFitView).toHaveBeenCalledWith({
          ...fitViewOptions,
          nodes: [{ id: 'entity1' }],
        });
      });
    });
  });

  describe('interactive class', () => {
    const testNodes: NodeViewModel[] = [
      {
        id: 'entity1',
        label: 'Entity Node',
        color: 'primary',
        shape: 'hexagon',
      },
      {
        id: 'label1',
        label: 'Label Node',
        color: 'primary',
        shape: 'label',
      },
    ];

    it('should add non-interactive class to nodes when interactive is false', async () => {
      const { container } = renderGraphPreview({
        nodes: testNodes,
        edges: [],
        interactive: false,
      });

      await waitFor(() => {
        const nodes = container.querySelectorAll('.react-flow__node');
        expect(nodes.length).toBeGreaterThan(0);

        nodes.forEach((node) => {
          expect(node).toHaveClass('non-interactive');
        });
      });
    });

    it('should not add non-interactive class to nodes when interactive is true', async () => {
      const { container } = renderGraphPreview({
        nodes: testNodes,
        edges: [],
        interactive: true,
      });

      await waitFor(() => {
        const nodes = container.querySelectorAll('.react-flow__node');
        expect(nodes.length).toBeGreaterThan(0);

        nodes.forEach((node) => {
          expect(node).not.toHaveClass('non-interactive');
        });
      });
    });

    it('should disable selection and focus on nodes when interactive is false', async () => {
      const { container } = renderGraphPreview({
        nodes: testNodes,
        edges: [],
        interactive: false,
      });

      await waitFor(() => {
        const nodes = container.querySelectorAll('.react-flow__node');
        expect(nodes.length).toBeGreaterThan(0);

        nodes.forEach((node) => {
          // React Flow only adds the `selectable` class when `elementsSelectable` is enabled
          expect(node).not.toHaveClass('selectable');
          // and only makes nodes focusable (tabbable) when `nodesFocusable` is enabled
          expect(node).not.toHaveAttribute('tabindex');
        });
      });
    });

    it('should enable selection and focus on nodes when interactive is true', async () => {
      const { container } = renderGraphPreview({
        nodes: testNodes,
        edges: [],
        interactive: true,
      });

      await waitFor(() => {
        const nodes = container.querySelectorAll('.react-flow__node');
        expect(nodes.length).toBeGreaterThan(0);

        nodes.forEach((node) => {
          expect(node).toHaveClass('selectable');
          expect(node).toHaveAttribute('tabindex', '0');
        });
      });
    });

    it('should add non-interactive class to relationship nodes when interactive is false', async () => {
      const nodesWithRelationship: NodeViewModel[] = [
        ...testNodes,
        {
          id: 'rel1',
          label: 'Owns',
          shape: 'relationship',
        },
      ];

      const { container } = renderGraphPreview({
        nodes: nodesWithRelationship,
        edges: [],
        interactive: false,
      });

      await waitFor(() => {
        const relationshipNode = container.querySelector('[data-id="rel1"]');
        expect(relationshipNode).not.toBeNull();
        expect(relationshipNode).toHaveClass('non-interactive');
      });
    });
  });
});
