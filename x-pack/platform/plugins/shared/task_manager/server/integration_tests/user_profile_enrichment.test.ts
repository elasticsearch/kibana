/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { TestElasticsearchUtils, TestKibanaUtils } from '@kbn/core-test-helpers-kbn-server';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import { TaskStatus, type RunContext } from '../task';
import type { TaskClaimingOpts } from '../queries/task_claiming';
import { TaskManagerPlugin, type TaskManagerStartContract } from '../plugin';
import { injectTask, setupTestServers, retry } from './lib';

interface CapturedRun {
  called: boolean;
  userFromTaskFakeRequest: AuthenticatedUser | null;
  enrichRequestWasProvided: boolean;
}

const mockCapturedRun: CapturedRun = {
  called: false,
  userFromTaskFakeRequest: null,
  enrichRequestWasProvided: false,
};

let mockKibanaServerRef: TestKibanaUtils | null = null;

jest.mock('../queries/task_claiming', () => {
  const actual = jest.requireActual('../queries/task_claiming');
  return {
    ...actual,
    TaskClaiming: jest.fn().mockImplementation((opts: TaskClaimingOpts) => {
      // Register before TaskClaiming construction so partitionIntoClaimingBatches sees them.
      opts.definitions.registerTaskDefinitions({
        profileResolvingTestTask: {
          title: 'Profile Resolving Test Task',
          description:
            'A task that captures the authenticated user resolved from its fake request, used to verify profile_uid enrichment in integration tests.',
          timeout: '1m',
          maxAttempts: 1,
          createTaskRunner: ({ fakeRequest, enrichRequest }: RunContext) => ({
            async run() {
              mockCapturedRun.called = true;
              mockCapturedRun.enrichRequestWasProvided = typeof enrichRequest === 'function';

              if (!fakeRequest || !mockKibanaServerRef) {
                return { state: {} };
              }

              const security = mockKibanaServerRef.coreStart.security;
              mockCapturedRun.userFromTaskFakeRequest = security.authc.getCurrentUser(fakeRequest);

              return { state: {} };
            },
          }),
        },
      });
      return new actual.TaskClaiming(opts);
    }),
  };
});

const taskManagerStartSpy = jest.spyOn(TaskManagerPlugin.prototype, 'start');

describe('Task Manager user profile enrichment (integration)', () => {
  const taskIdsToRemove: string[] = [];
  let esServer: TestElasticsearchUtils;
  let kibanaServer: TestKibanaUtils;
  let taskManagerPlugin: TaskManagerStartContract;

  beforeAll(async () => {
    const setupResult = await setupTestServers();
    esServer = setupResult.esServer;
    kibanaServer = setupResult.kibanaServer;
    mockKibanaServerRef = kibanaServer;

    expect(taskManagerStartSpy).toHaveBeenCalledTimes(1);
    taskManagerPlugin = taskManagerStartSpy.mock.results[0].value;
  });

  afterAll(async () => {
    mockKibanaServerRef = null;
    if (kibanaServer) {
      await kibanaServer.stop();
    }
    if (esServer) {
      await esServer.stop();
    }
  });

  beforeEach(() => {
    mockCapturedRun.called = false;
    mockCapturedRun.userFromTaskFakeRequest = null;
    mockCapturedRun.enrichRequestWasProvided = false;
  });

  afterEach(async () => {
    while (taskIdsToRemove.length > 0) {
      const id = taskIdsToRemove.pop();
      await taskManagerPlugin.removeIfExists(id!);
    }
  });

  it('enriches the task fake request with the stored userProfileId so core getCurrentUser resolves it', async () => {
    const testProfileUid = 'test-user-profile-uid-integration';
    const testUserName = 'integration-test-user';
    const id = uuidV4();

    await injectTask(kibanaServer.coreStart.elasticsearch.client.asInternalUser, {
      id,
      taskType: 'profileResolvingTestTask',
      params: {},
      state: {},
      runAt: new Date(),
      enabled: true,
      scheduledAt: new Date(),
      attempts: 0,
      status: TaskStatus.Idle,
      startedAt: null,
      retryAt: null,
      ownerId: null,
      // Non-empty so the runner builds a fake request; not used against ES here.
      apiKey: Buffer.from('integration-api-key-id:integration-api-key-value').toString('base64'),
      userScope: {
        apiKeyId: 'integration-api-key-id',
        spaceId: 'default',
        apiKeyCreatedByUser: false,
        userProfileId: testProfileUid,
        userName: testUserName,
      },
    });
    taskIdsToRemove.push(id);

    await retry(async () => {
      expect(mockCapturedRun.called).toBe(true);
    });

    expect(mockCapturedRun.userFromTaskFakeRequest).not.toBeNull();
    expect(mockCapturedRun.userFromTaskFakeRequest?.profile_uid).toBe(testProfileUid);
    expect(mockCapturedRun.userFromTaskFakeRequest?.username).toBe(testUserName);

    // Exposed whenever the task has a userProfileId so tasks can propagate it to
    // child fake requests. Propagation itself is covered by unit tests.
    expect(mockCapturedRun.enrichRequestWasProvided).toBe(true);
  });
});
