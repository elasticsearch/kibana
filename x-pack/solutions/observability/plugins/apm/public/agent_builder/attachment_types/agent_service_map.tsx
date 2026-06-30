/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  type ColorMode,
} from '@xyflow/react';
import { useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import '@xyflow/react/dist/style.css';
import type { ServiceMapAttachmentData } from '../../../common/agent_builder/attachments';
import { ServiceNode } from '../../components/shared/service_map/service_node';
import { DependencyNode } from '../../components/shared/service_map/dependency_node';
import { GroupedResourcesNode } from '../../components/shared/service_map/grouped_resources_node';
import { applyDagreLayout } from '../../components/shared/service_map/layout';

const nodeTypes: NodeTypes = {
  service: ServiceNode,
  dependency: DependencyNode,
  groupedResources: GroupedResourcesNode,
};

export interface AgentServiceMapProps {
  connections: ServiceMapAttachmentData['connections'];
  nodeMetadata?: ServiceMapAttachmentData['nodeMetadata'];
}

type TopologyNode =
  | { 'service.name': string; 'agent.name'?: string }
  | {
      'span.destination.service.resource': string;
      'span.type'?: string;
      'span.subtype'?: string;
    };

function isServiceNode(
  node: TopologyNode
): node is { 'service.name': string; 'agent.name'?: string } {
  return 'service.name' in node;
}

function getNodeId(node: TopologyNode): string {
  if (isServiceNode(node)) {
    return node['service.name'];
  }
  return `>${node['span.destination.service.resource']}`;
}

function getNodeLabel(node: TopologyNode): string {
  if (isServiceNode(node)) {
    return node['service.name'];
  }
  return node['span.destination.service.resource'];
}

export function formatEdgeLabel(
  metrics: ServiceMapAttachmentData['connections'][0]['metrics']
): string | undefined {
  if (!metrics) return undefined;
  const parts: string[] = [];
  if (metrics.latencyMs !== undefined) {
    if (metrics.latencyMs >= 1000) {
      parts.push(`${(metrics.latencyMs / 1000).toFixed(1)} s`);
    } else {
      parts.push(`${Math.round(metrics.latencyMs)} ms`);
    }
  }
  if (metrics.throughputPerMin !== undefined) {
    parts.push(`${metrics.throughputPerMin.toFixed(1)} tpm`);
  }
  if (metrics.errorRate !== undefined && metrics.errorRate > 0) {
    parts.push(`${(metrics.errorRate * 100).toFixed(1)}% err`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function transformConnections(
  connections: ServiceMapAttachmentData['connections'],
  nodeMetadata?: ServiceMapAttachmentData['nodeMetadata']
): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodesMap = new Map<string, Node>();
  const edges: Edge[] = [];

  for (const connection of connections) {
    for (const node of [connection.source, connection.target]) {
      const id = getNodeId(node);
      if (!nodesMap.has(id)) {
        if (isServiceNode(node)) {
          const meta = nodeMetadata?.[node['service.name']];
          nodesMap.set(id, {
            id,
            type: 'service',
            position: { x: 0, y: 0 },
            data: {
              id,
              label: getNodeLabel(node),
              isService: true,
              agentName: node['agent.name'],
              alertsCount: meta?.alertsCount,
              sloStatus: meta?.sloStatus,
              sloCount: meta?.sloCount,
            },
          });
        } else {
          nodesMap.set(id, {
            id,
            type: 'dependency',
            position: { x: 0, y: 0 },
            data: {
              id,
              label: getNodeLabel(node),
              isService: false,
              spanType: node['span.type'],
              spanSubtype: node['span.subtype'],
            },
          });
        }
      }
    }

    const sourceId = getNodeId(connection.source);
    const targetId = getNodeId(connection.target);

    edges.push({
      id: `${sourceId}~${targetId}`,
      source: sourceId,
      target: targetId,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      label: formatEdgeLabel(connection.metrics),
      style: { strokeWidth: 1 },
    });
  }

  return { nodes: [...nodesMap.values()], edges };
}

export function AgentServiceMap({ connections, nodeMetadata }: AgentServiceMapProps) {
  const { euiTheme, colorMode } = useEuiTheme();

  const { nodes, edges } = useMemo(() => {
    const { nodes: rawNodes, edges: rawEdges } = transformConnections(connections, nodeMetadata);
    const layoutedNodes = applyDagreLayout(rawNodes, rawEdges);
    return { nodes: layoutedNodes, edges: rawEdges };
  }, [connections, nodeMetadata]);

  return (
    <ReactFlowProvider>
      <div
        css={css`
          width: 100%;
          height: 100%;

          .react-flow__node,
          .react-flow__node * {
            cursor: grab !important;
          }
        `}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={3}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          colorMode={colorMode.toLowerCase() as ColorMode}
        >
          <Background gap={24} size={1} color={euiTheme.colors.borderBaseSubdued} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
