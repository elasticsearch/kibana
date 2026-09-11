/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout';

// Remote clusters are cluster-global persistent settings. The default addresses point at
// unreachable local hosts on purpose — ES accepts them without a live remote, which is all the
// UI needs. Pass a reachable seed when the test asserts on the connection status.

interface SniffClusterOptions {
  seeds?: string[];
  nodeConnections?: number;
  skipUnavailable?: boolean;
}

export const seedSniffCluster = (
  esClient: EsClient,
  name: string,
  { seeds = ['127.0.0.1:9301'], nodeConnections, skipUnavailable }: SniffClusterOptions = {}
) =>
  esClient.cluster.putSettings({
    persistent: {
      cluster: {
        remote: {
          [name]: {
            mode: 'sniff',
            seeds,
            node_connections: nodeConnections,
            skip_unavailable: skipUnavailable,
          },
        },
      },
    },
  });

export const seedProxyCluster = (esClient: EsClient, name: string) =>
  esClient.cluster.putSettings({
    persistent: {
      cluster: {
        remote: {
          [name]: { mode: 'proxy', proxy_address: '127.0.0.1:9302', server_name: 'test_server' },
        },
      },
    },
  });

// Nulling every field removes the remote; safe to call for a cluster that was
// never registered (ES treats it as a no-op).
export const removeCluster = (esClient: EsClient, name: string) =>
  esClient.cluster.putSettings({
    persistent: {
      cluster: {
        remote: {
          [name]: {
            mode: null,
            seeds: null,
            proxy_address: null,
            proxy_socket_connections: null,
            server_name: null,
            node_connections: null,
            skip_unavailable: null,
          },
        },
      },
    },
  });

/**
 * Resolve the transport address of the cluster's own node, so a remote cluster can be seeded
 * with a reachable address and actually report as connected. Scout does not pin the ES
 * transport port, so it has to be discovered at runtime.
 */
export const getOwnTransportAddress = async (esClient: EsClient): Promise<string> => {
  const { nodes } = await esClient.nodes.info({ metric: 'transport' });
  const [node] = Object.values(nodes);
  const address = node?.transport?.publish_address;

  if (!address) {
    throw new Error('Could not resolve the transport publish address of the local ES node');
  }

  // ES may report `hostname/ip:port`; the seed only accepts `host:port`.
  return address.includes('/') ? address.split('/')[1] : address;
};
