/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { TestElasticsearchUtils, TestKibanaUtils } from '@kbn/core-test-helpers-kbn-server';
import type { CoreStart } from '@kbn/core/server';
import type { TaskManagerPluginsStart, TaskManagerStartContract } from '../plugin';
import { taskRunner } from '../invalidate_api_keys/invalidate_api_keys_task';
import { INVALIDATE_API_KEY_SO_NAME } from '../saved_objects';
import type { ApiKeyToInvalidate } from '../saved_objects/schemas/api_key_to_invalidate';
import { TaskStatus } from '../task';
import { injectTask, setupTestServers } from './lib';

const TASK_MANAGER_INDEX = '.kibana_task_manager';

describe('invalidate api keys task - in-use guard', () => {
  let esServer: TestElasticsearchUtils;
  let kibanaServer: TestKibanaUtils;

  beforeAll(async () => {
    // Silence server logging: the code under test uses its own (mock) logger, so real plugin logs
    // are irrelevant here. This avoids unrelated plugins (fleet, slo, streams) logging to the
    // console after teardown ("Cannot log after tests are done") when their async startup work
    // outlives this fast test.
    const setupResult = await setupTestServers({
      logging: { root: { level: 'off' }, loggers: [{ name: 'plugins.taskManager', level: 'off' }] },
    });
    esServer = setupResult.esServer;
    kibanaServer = setupResult.kibanaServer;
  });

  afterAll(async () => {
    if (kibanaServer) {
      await kibanaServer.stop();
    }
    if (esServer) {
      await esServer.stop();
    }
  });

  test('keeps a key referenced by a live task but invalidates an orphaned key', async () => {
    const coreStart = kibanaServer.coreStart;
    const esClient = coreStart.elasticsearch.client.asInternalUser;
    const soClient = coreStart.savedObjects.createInternalRepository([INVALIDATE_API_KEY_SO_NAME]);

    const sharedKeyId = `shared-${uuidV4()}`;
    const orphanKeyId = `orphan-${uuidV4()}`;

    // A single live task references `sharedKeyId` (the survivor of a bulk-scheduled batch after a
    // sibling was removed); `orphanKeyId` is referenced by no task.
    await injectTask(esClient, {
      id: uuidV4(),
      taskType: 'sampleTask',
      params: {},
      state: {},
      stateVersion: 1,
      runAt: new Date(),
      enabled: true,
      scheduledAt: new Date(),
      attempts: 0,
      status: TaskStatus.Idle,
      startedAt: null,
      retryAt: null,
      ownerId: null,
      userScope: { apiKeyId: sharedKeyId, apiKeyCreatedByUser: false, spaceId: 'default' },
    });

    // Both keys are queued for invalidation, created far enough in the past to clear removalDelay.
    const createdAt = new Date(Date.now() - 10_000).toISOString();
    await soClient.create(INVALIDATE_API_KEY_SO_NAME, { apiKeyId: sharedKeyId, createdAt });
    await soClient.create(INVALIDATE_API_KEY_SO_NAME, { apiKeyId: orphanKeyId, createdAt });
    await esClient.indices.refresh({ index: TASK_MANAGER_INDEX });

    const invalidatedIds: string[] = [];
    const invalidateApiKeyFn = jest.fn(async ({ ids }: { ids: string[] }) => {
      invalidatedIds.push(...ids);
      return { invalidated_api_keys: ids, previously_invalidated_api_keys: [], error_count: 0 };
    });

    const runner = taskRunner({
      logger: loggingSystemMock.createLogger(),
      configInterval: '5m',
      coreStartServices: async () => [
        coreStart as unknown as CoreStart,
        {} as unknown as TaskManagerPluginsStart,
        {} as unknown as TaskManagerStartContract,
      ],
      getEncryptedSavedObjectsClient: () => undefined,
      invalidateApiKeyFn,
      invalidateUiamApiKeyFn: () => undefined,
      removalDelay: '1s',
    })({ taskInstance: { state: {} } });

    await runner.run();

    // The orphaned key is invalidated; the key still referenced by a live task is left alone.
    expect(invalidatedIds).toContain(orphanKeyId);
    expect(invalidatedIds).not.toContain(sharedKeyId);

    // And its pending-invalidation record is retained (excluded), while the orphan's is deleted.
    const { saved_objects: remaining } = await soClient.find<ApiKeyToInvalidate>({
      type: INVALIDATE_API_KEY_SO_NAME,
      perPage: 100,
    });
    const remainingKeyIds = remaining.map((so) => so.attributes.apiKeyId);
    expect(remainingKeyIds).toContain(sharedKeyId);
    expect(remainingKeyIds).not.toContain(orphanKeyId);
  });
});
