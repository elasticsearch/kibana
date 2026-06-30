/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { BaseFeature, Streams } from '@kbn/streams-schema';
import { emptyAssets } from '@kbn/streams-schema';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS } from '@kbn/management-settings-ids';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { StreamsSupertestRepositoryClient } from './helpers/repository_client';
import { createStreamsRepositoryAdminClient } from './helpers/repository_client';
import {
  deleteStream,
  disableStreams,
  enableStreams,
  upsertFeature,
  listFeatures,
  bulkFeatures,
  deleteFeature,
  putStream,
} from './helpers/requests';

const STREAM_NAME = 'logs.otel';
const SECOND_STREAM_NAME = 'logs.otel.features-cross-stream-test';

const secondStreamDefinition: Streams.WiredStream.UpsertRequest['stream'] = {
  type: 'wired',
  description: '',
  ingest: {
    lifecycle: { inherit: {} },
    processing: { steps: [] },
    settings: {},
    wired: {
      routing: [],
      fields: {},
    },
    failure_store: { inherit: {} },
  },
};

const testFeature: BaseFeature = {
  id: 'test-feature',
  stream_name: STREAM_NAME,
  type: 'entity',
  subtype: 'service',
  title: 'Test Service',
  description: 'A test service for FTR tests',
  properties: { name: 'test-service' },
  confidence: 90,
  evidence: ['service.name=test-service'],
  tags: ['entity', 'service'],
};

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const kibanaServer = getService('kibanaServer');
  let apiClient: StreamsSupertestRepositoryClient;

  describe('Features', function () {
    before(async () => {
      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
      await enableStreams(apiClient);
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: true,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    after(async () => {
      await disableStreams(apiClient);
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: false,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    describe('Exclude and restore', () => {
      it('creates a feature and lists it', async () => {
        const { id, uuid } = await upsertFeature(apiClient, STREAM_NAME, testFeature);
        expect(id).to.be.a('string');

        const { features } = await listFeatures(apiClient, STREAM_NAME);
        const found = features.find((f) => f.id === testFeature.id);
        expect(found).to.be.ok();
        expect(found!.id).to.eql(id);

        // Cleanup
        await deleteFeature(apiClient, STREAM_NAME, uuid);
      });

      it('excludes a feature via bulk and hides it from default list', async () => {
        const { id, uuid } = await upsertFeature(apiClient, STREAM_NAME, testFeature);

        // Exclude it (mutations are keyed by uuid)
        await bulkFeatures(apiClient, STREAM_NAME, [{ exclude: { id: uuid } }]);

        // Should NOT appear in default list
        const { features } = await listFeatures(apiClient, STREAM_NAME);
        const found = features.find((f) => f.id === id);
        expect(found).to.be(undefined);

        // Cleanup
        await deleteFeature(apiClient, STREAM_NAME, uuid);
      });

      it('returns excluded features when include_excluded=true', async () => {
        const { id, uuid } = await upsertFeature(apiClient, STREAM_NAME, testFeature);

        await bulkFeatures(apiClient, STREAM_NAME, [{ exclude: { id: uuid } }]);

        // Should appear with include_excluded
        const { features } = await listFeatures(apiClient, STREAM_NAME, {
          includeExcluded: true,
        });
        const found = features.find((f) => f.id === id);
        expect(found).to.be.ok();
        expect(found!.excluded).to.be(true);

        // Cleanup
        await deleteFeature(apiClient, STREAM_NAME, uuid);
      });

      it('restores an excluded feature with fresh timestamps', async () => {
        const { id, uuid } = await upsertFeature(apiClient, STREAM_NAME, testFeature);

        await bulkFeatures(apiClient, STREAM_NAME, [{ exclude: { id: uuid } }]);

        // Restore it
        await bulkFeatures(apiClient, STREAM_NAME, [{ restore: { id: uuid } }]);

        // Should appear in default list again
        const { features } = await listFeatures(apiClient, STREAM_NAME);
        const found = features.find((f) => f.id === id);
        expect(found).to.be.ok();
        expect(found!.excluded).to.be(undefined);
        expect(found!.updated_at).to.be.a('string');

        // Cleanup
        await deleteFeature(apiClient, STREAM_NAME, uuid);
      });

      it('bulk excludes multiple features and restores some', async () => {
        const feature1: BaseFeature = { ...testFeature, id: 'bulk-test-1' };
        const feature2: BaseFeature = { ...testFeature, id: 'bulk-test-2' };
        const feature3: BaseFeature = { ...testFeature, id: 'bulk-test-3' };

        const { id: id1, uuid: uuid1 } = await upsertFeature(apiClient, STREAM_NAME, feature1);
        const { id: id2, uuid: uuid2 } = await upsertFeature(apiClient, STREAM_NAME, feature2);
        const { id: id3, uuid: uuid3 } = await upsertFeature(apiClient, STREAM_NAME, feature3);

        // Exclude all 3
        await bulkFeatures(apiClient, STREAM_NAME, [
          { exclude: { id: uuid1 } },
          { exclude: { id: uuid2 } },
          { exclude: { id: uuid3 } },
        ]);

        // Default list should have none of the 3
        const { features: afterExclude } = await listFeatures(apiClient, STREAM_NAME);
        expect(afterExclude.find((f) => f.id === id1)).to.be(undefined);
        expect(afterExclude.find((f) => f.id === id2)).to.be(undefined);
        expect(afterExclude.find((f) => f.id === id3)).to.be(undefined);

        // Restore 2 of them
        await bulkFeatures(apiClient, STREAM_NAME, [
          { restore: { id: uuid1 } },
          { restore: { id: uuid2 } },
        ]);

        const { features: afterRestore } = await listFeatures(apiClient, STREAM_NAME);
        expect(afterRestore.find((f) => f.id === id1)).to.be.ok();
        expect(afterRestore.find((f) => f.id === id2)).to.be.ok();
        expect(afterRestore.find((f) => f.id === id3)).to.be(undefined);

        // Cleanup
        await bulkFeatures(apiClient, STREAM_NAME, [
          { delete: { id: uuid1 } },
          { delete: { id: uuid2 } },
          { delete: { id: uuid3 } },
        ]);
      });

      it('hard deletes an excluded feature', async () => {
        const { id, uuid } = await upsertFeature(apiClient, STREAM_NAME, testFeature);

        await bulkFeatures(apiClient, STREAM_NAME, [{ exclude: { id: uuid } }]);

        // Hard delete
        await deleteFeature(apiClient, STREAM_NAME, uuid);

        // Should be gone entirely, even with include_excluded
        const { features } = await listFeatures(apiClient, STREAM_NAME, {
          includeExcluded: true,
        });
        const found = features.find((f) => f.id === id);
        expect(found).to.be(undefined);
      });
    });

    describe('POST /internal/streams/features/_bulk', () => {
      beforeEach(async () => {
        await putStream(apiClient, SECOND_STREAM_NAME, {
          stream: secondStreamDefinition,
          ...emptyAssets,
        });
      });

      afterEach(async () => {
        await deleteStream(apiClient, SECOND_STREAM_NAME);
      });

      it('deletes features across multiple streams in one request', async () => {
        const featureA: BaseFeature = { ...testFeature, id: 'cross-stream-delete-a' };
        const featureB: BaseFeature = {
          ...testFeature,
          id: 'cross-stream-delete-b',
          stream_name: SECOND_STREAM_NAME,
        };

        const { id: idA, uuid: uuidA } = await upsertFeature(apiClient, STREAM_NAME, featureA);
        const { id: idB, uuid: uuidB } = await upsertFeature(
          apiClient,
          SECOND_STREAM_NAME,
          featureB
        );

        const response = await apiClient
          .fetch('POST /internal/streams/features/_bulk', {
            params: {
              body: {
                operations: [{ delete: { id: uuidA } }, { delete: { id: uuidB } }],
              },
            },
          })
          .expect(200)
          .then((res) => res.body);

        expect(response).to.eql({ succeeded: 2, failed: 0, skipped: 0 });

        const { features: streamAFeatures } = await listFeatures(apiClient, STREAM_NAME, {
          includeExcluded: true,
        });
        const { features: streamBFeatures } = await listFeatures(apiClient, SECOND_STREAM_NAME, {
          includeExcluded: true,
        });
        expect(streamAFeatures.find((f) => f.id === idA)).to.be(undefined);
        expect(streamBFeatures.find((f) => f.id === idB)).to.be(undefined);
      });

      it('deletes multiple features in one request and returns the right counts', async () => {
        const feature1: BaseFeature = { ...testFeature, id: 'bulk-delete-1' };
        const feature2: BaseFeature = { ...testFeature, id: 'bulk-delete-2' };

        const { id: id1, uuid: uuid1 } = await upsertFeature(apiClient, STREAM_NAME, feature1);
        const { id: id2, uuid: uuid2 } = await upsertFeature(apiClient, STREAM_NAME, feature2);

        const response = await apiClient
          .fetch('POST /internal/streams/features/_bulk', {
            params: {
              body: {
                operations: [{ delete: { id: uuid1 } }, { delete: { id: uuid2 } }],
              },
            },
          })
          .expect(200)
          .then((res) => res.body);

        expect(response).to.eql({ succeeded: 2, failed: 0, skipped: 0 });

        const { features } = await listFeatures(apiClient, STREAM_NAME, {
          includeExcluded: true,
        });
        expect(features.find((f) => f.id === id1)).to.be(undefined);
        expect(features.find((f) => f.id === id2)).to.be(undefined);
      });

      it('excludes and restores features across streams in one request', async () => {
        const feature1: BaseFeature = { ...testFeature, id: 'bulk-exclude-1' };
        const feature2: BaseFeature = { ...testFeature, id: 'bulk-exclude-2' };

        const { uuid: uuid1 } = await upsertFeature(apiClient, STREAM_NAME, feature1);
        const { uuid: uuid2 } = await upsertFeature(apiClient, STREAM_NAME, feature2);

        // Exclude both in one request
        const excludeResponse = await apiClient
          .fetch('POST /internal/streams/features/_bulk', {
            params: {
              body: {
                operations: [{ exclude: { id: uuid1 } }, { exclude: { id: uuid2 } }],
              },
            },
          })
          .expect(200)
          .then((res) => res.body);

        expect(excludeResponse).to.eql({ succeeded: 2, failed: 0, skipped: 0 });

        // Restore both in one request
        const restoreResponse = await apiClient
          .fetch('POST /internal/streams/features/_bulk', {
            params: {
              body: {
                operations: [{ restore: { id: uuid1 } }, { restore: { id: uuid2 } }],
              },
            },
          })
          .expect(200)
          .then((res) => res.body);

        expect(restoreResponse).to.eql({ succeeded: 2, failed: 0, skipped: 0 });

        // Cleanup
        await bulkFeatures(apiClient, STREAM_NAME, [
          { delete: { id: uuid1 } },
          { delete: { id: uuid2 } },
        ]);
      });

      it('treats stale/unknown UUIDs as idempotent no-ops (succeeded=0, failed=0, skipped=1)', async () => {
        const response = await apiClient
          .fetch('POST /internal/streams/features/_bulk', {
            params: {
              body: {
                operations: [{ delete: { id: 'non-existent-uuid' } }],
              },
            },
          })
          .expect(200)
          .then((res) => res.body);

        expect(response).to.eql({ succeeded: 0, failed: 0, skipped: 1 });
      });
    });
  });
}
