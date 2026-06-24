/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type StreamsCanvasNodeType = 'source' | 'pipeline' | 'route' | 'destination';

interface StreamsCanvasNodeData extends Record<string, unknown> {
  label: string;
  type: StreamsCanvasNodeType;
  description: string;
  status: string;
}

type StreamsCanvasNode = Node<StreamsCanvasNodeData>;
type StreamsCanvasEdge = Edge;

interface StreamDetailCanvasProps {
  streamName: string;
}

const nodeTypeLabels: Record<StreamsCanvasNodeType, string> = {
  source: i18n.translate('xpack.streams.canvas.nodeType.source', {
    defaultMessage: 'Source',
  }),
  pipeline: i18n.translate('xpack.streams.canvas.nodeType.pipeline', {
    defaultMessage: 'Pipeline',
  }),
  route: i18n.translate('xpack.streams.canvas.nodeType.route', {
    defaultMessage: 'Route',
  }),
  destination: i18n.translate('xpack.streams.canvas.nodeType.destination', {
    defaultMessage: 'Destination',
  }),
};

export function StreamDetailCanvas({ streamName }: StreamDetailCanvasProps) {
  const { euiTheme } = useEuiTheme();
  const [selectedNode, setSelectedNode] = useState<StreamsCanvasNode | null>(null);

  const nodes = useMemo<StreamsCanvasNode[]>(
    () => [
      {
        id: 'source-default',
        position: { x: 0, y: 120 },
        data: {
          label: 'Default source',
          type: 'source',
          description: i18n.translate('xpack.streams.canvas.mockSourceDescription', {
            defaultMessage: 'Managed input endpoint where data enters the topology.',
          }),
          status: i18n.translate('xpack.streams.canvas.mockStatus.live', {
            defaultMessage: 'Live',
          }),
        },
      },
      {
        id: 'pipeline-default',
        position: { x: 280, y: 120 },
        data: {
          label: 'Processing',
          type: 'pipeline',
          description: i18n.translate('xpack.streams.canvas.mockPipelineDescription', {
            defaultMessage:
              'Streamlang processing placement for this stream. This will house what used to be the Processing tab.',
          }),
          status: i18n.translate('xpack.streams.canvas.mockStatus.mocked', {
            defaultMessage: 'Mocked',
          }),
        },
      },
      {
        id: 'route-default',
        position: { x: 560, y: 120 },
        data: {
          label: 'Routing',
          type: 'route',
          description: i18n.translate('xpack.streams.canvas.mockRouteDescription', {
            defaultMessage:
              'Conditional path selection or fan-out rules. This will house what used to be the Partitioning tab.',
          }),
          status: i18n.translate('xpack.streams.canvas.mockStatus.mocked', {
            defaultMessage: 'Mocked',
          }),
        },
      },
      {
        id: 'destination-default',
        position: { x: 840, y: 120 },
        data: {
          label: streamName,
          type: 'destination',
          description: i18n.translate('xpack.streams.canvas.mockDestinationDescription', {
            defaultMessage: 'Elasticsearch destination (v0) for indexed data.',
          }),
          status: i18n.translate('xpack.streams.canvas.mockStatus.active', {
            defaultMessage: 'Active',
          }),
        },
      },
    ],
    [streamName]
  );

  const edges = useMemo<StreamsCanvasEdge[]>(
    () => [
      { id: 'source-pipeline', source: 'source-default', target: 'pipeline-default' },
      { id: 'pipeline-route', source: 'pipeline-default', target: 'route-default' },
      { id: 'route-destination', source: 'route-default', target: 'destination-default' },
    ],
    []
  );

  const handleNodeClick = useCallback<NodeMouseHandler<StreamsCanvasNode>>((_event, node) => {
    setSelectedNode(node);
  }, []);

  return (
    <ReactFlowProvider>
      <EuiPanel
        hasShadow={false}
        hasBorder={false}
        paddingSize="none"
        css={css`
          height: calc(100vh - 230px);
          min-height: 520px;
          background: ${euiTheme.colors.backgroundBaseSubdued};
        `}
        data-test-subj="streamsCanvasTab"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          onNodeClick={handleNodeClick}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </EuiPanel>
      {selectedNode && (
        <EuiFlyout
          onClose={() => setSelectedNode(null)}
          size="s"
          data-test-subj="streamsCanvasNodeFlyout"
          aria-labelledby="streamsCanvasNodeFlyoutTitle"
        >
          <EuiFlyoutHeader hasBorder>
            <EuiFlexGroup alignItems="center" gutterSize="s">
              <EuiFlexItem>
                <EuiTitle size="m">
                  <h2 id="streamsCanvasNodeFlyoutTitle">{selectedNode.data.label}</h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">{nodeTypeLabels[selectedNode.data.type]}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiText size="s">
              <p>{selectedNode.data.description}</p>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiDescriptionList
              type="column"
              listItems={[
                {
                  title: i18n.translate('xpack.streams.canvas.nodeFlyout.typeLabel', {
                    defaultMessage: 'Type',
                  }),
                  description: nodeTypeLabels[selectedNode.data.type],
                },
                {
                  title: i18n.translate('xpack.streams.canvas.nodeFlyout.statusLabel', {
                    defaultMessage: 'Status',
                  }),
                  description: selectedNode.data.status,
                },
              ]}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </ReactFlowProvider>
  );
}
