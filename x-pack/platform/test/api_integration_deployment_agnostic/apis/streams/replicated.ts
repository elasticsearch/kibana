/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { Client } from '@elastic/elasticsearch';
import { ClassicStream } from '@kbn/streams-schema';
import type { Streams } from '@kbn/streams-schema';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { StreamsSupertestRepositoryClient } from './helpers/repository_client';
import { createStreamsRepositoryAdminClient } from './helpers/repository_client';
import { deleteStream, getStream, putStream, putIngest } from './helpers/requests';

const REMOTE_CLUSTER_NAME = 'ftr-remote';
const LEADER_STREAM = 'my-ccr-logs-test';
const AUTO_FOLLOW_PATTERN_NAME = 'streams-ccr-test';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const esClient = getService('es');
  const remoteEs = getService('remoteEs' as 'es');

  let apiClient: StreamsSupertestRepositoryClient;

  describe('Replicated streams (CCR)', function () {
    this.tags(['skipMKI']);

    before(async () => {
      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
    });

    after(async () => {
      await cleanup(esClient, remoteEs);
    });

    it('sets up a replicated data stream via CCR auto-follow', async () => {
      // 1. Create the index template on the remote (leader) cluster
      await remoteEs.indices.putIndexTemplate({
        name: `${LEADER_STREAM}-template`,
        index_patterns: [LEADER_STREAM],
        data_stream: {},
        template: {
          settings: {
            number_of_replicas: 0,
            'soft_deletes.enabled': true,
          },
        },
      });

      // 2. Create an auto-follow pattern on the local cluster BEFORE the data stream exists.
      //    Auto-follow only applies to newly created indices, and leader_index_patterns must
      //    match the backing index names (`.ds-<name>-*`), not the data stream name.
      await esClient.ccr.putAutoFollowPattern({
        name: AUTO_FOLLOW_PATTERN_NAME,
        remote_cluster: REMOTE_CLUSTER_NAME,
        leader_index_patterns: [`.ds-${LEADER_STREAM}-*`],
        leader_index_exclusion_patterns: [],
        follow_index_pattern: '{{leader_index}}',
      });

      // 3. Now create the data stream by indexing a document on the remote cluster
      await remoteEs.index({
        index: LEADER_STREAM,
        document: {
          '@timestamp': new Date().toISOString(),
          message: 'leader document',
        },
        refresh: 'wait_for',
      });

      // 4. Wait for the follower data stream to appear
      await waitForReplicatedDataStream(esClient, LEADER_STREAM);
    });

    it('GET returns replicated: true for a replicated data stream', async () => {
      const response = await getStream(apiClient, LEADER_STREAM);
      expect(response.stream.name).to.be(LEADER_STREAM);
      // Public GET must match the same schema the stream detail UI validates (Zod / DeepStrict).
      expect(ClassicStream.GetResponse.is(response as Streams.all.GetResponse)).to.be(true);
      const classicResponse = response as ClassicStream.GetResponse;
      expect(classicResponse.replicated).to.be(true);
      if (classicResponse.elasticsearch_assets !== undefined) {
        expect(typeof classicResponse.elasticsearch_assets.indexTemplate).to.be('string');
      }
    });

    it('PUT allows updating description on a replicated data stream', async () => {
      // Description-only changes should succeed — attemptChanges detects no ES-level
      // diff and only writes to .kibana_streams.
      await putStream(apiClient, LEADER_STREAM, {
        dashboards: [],
        rules: [],
        stream: {
          type: 'classic',
          description: 'updated description on replicated stream',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            classic: {},
            failure_store: { inherit: {} },
          },
        },
      });

      // Verify the description was persisted
      const updated = await getStream(apiClient, LEADER_STREAM);
      expect(updated.stream.description).to.be('updated description on replicated stream');
    });

    it('PUT _ingest returns 422 for a replicated data stream', async () => {
      const body = await putIngest(
        apiClient,
        LEADER_STREAM,
        {
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            classic: {},
            failure_store: { inherit: {} },
          },
        },
        422
      );

      expect((body as unknown as Record<string, unknown>).message).to.contain('replicated');
    });

    it('DELETE returns 422 for a replicated data stream', async () => {
      const body = await deleteStream(apiClient, LEADER_STREAM, 422);
      expect((body as unknown as Record<string, unknown>).message).to.contain('replicated');
    });
  });
}

async function waitForReplicatedDataStream(
  esClient: Client,
  name: string,
  maxRetries = 30,
  delayMs = 1000
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await esClient.indices.getDataStream({ name });
      if (response.data_streams.length > 0 && response.data_streams[0].replicated === true) {
        return;
      }
    } catch {
      // Data stream doesn't exist yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Timed out waiting for replicated data stream '${name}' to appear`);
}

async function cleanup(esClient: Client, remoteEs: Client) {
  // Delete auto-follow pattern
  try {
    await esClient.ccr.deleteAutoFollowPattern({ name: AUTO_FOLLOW_PATTERN_NAME });
  } catch {
    // ignore
  }

  // Pause and unfollow the replicated data stream's backing indices
  try {
    const dataStreamResponse = await esClient.indices.getDataStream({ name: LEADER_STREAM });
    if (dataStreamResponse.data_streams.length > 0) {
      for (const index of dataStreamResponse.data_streams[0].indices) {
        try {
          await esClient.ccr.pauseFollow({ index: index.index_name });
        } catch {
          // may already be paused
        }
        try {
          await esClient.indices.close({ index: index.index_name });
          await esClient.ccr.unfollow({ index: index.index_name });
          await esClient.indices.open({ index: index.index_name });
        } catch {
          // ignore
        }
      }
      await esClient.indices.deleteDataStream({ name: LEADER_STREAM });
    }
  } catch {
    // ignore
  }

  // Cleanup the leader data stream and template on the remote cluster
  try {
    await remoteEs.indices.deleteDataStream({ name: LEADER_STREAM });
  } catch {
    // ignore
  }
  try {
    await remoteEs.indices.deleteIndexTemplate({ name: `${LEADER_STREAM}-template` });
  } catch {
    // ignore
  }
}
