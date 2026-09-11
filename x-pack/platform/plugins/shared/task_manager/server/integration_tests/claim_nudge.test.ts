/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import { schema } from '@kbn/config-schema';
import type { TestElasticsearchUtils, TestKibanaUtils } from '@kbn/core-test-helpers-kbn-server';
import type { TaskClaimingOpts } from '../queries/task_claiming';
import { TaskStatus } from '../task';
import { TaskManagerPlugin, type TaskManagerStartContract } from '../plugin';
import { injectTask, setupTestServers, retry } from './lib';
import { setupKibanaServer } from './lib/setup_test_servers';

// Long enough that a nudged claim is clearly distinguishable from one that waited for the next
// poll cycle, even with CI jitter.
const POLLING_INTERVAL = 20000;
// Derived from POLLING_INTERVAL so the retry budget stays inside the `elapsedMs` assertion below
// (half the poll interval) if that interval is ever retuned.
const NUDGE_RETRY_INTERVAL_MS = 100;
const NUDGE_RETRY_OPTS = {
  times: POLLING_INTERVAL / 4 / NUDGE_RETRY_INTERVAL_MS,
  intervalMs: NUDGE_RETRY_INTERVAL_MS,
};

const mockTaskTypeRunFn = jest.fn();
const mockCreateTaskRunner = jest.fn();
const mockTaskType = {
  title: '',
  description: '',
  stateSchemaByVersion: {
    1: {
      up: (state: Record<string, unknown>) => ({ foo: state.foo || '' }),
      schema: schema.object({
        foo: schema.string(),
      }),
    },
  },
  createTaskRunner: mockCreateTaskRunner.mockImplementation(() => ({
    run: mockTaskTypeRunFn,
  })),
};

jest.mock('../queries/task_claiming', () => {
  const actual = jest.requireActual('../queries/task_claiming');
  return {
    ...actual,
    TaskClaiming: jest.fn().mockImplementation((opts: TaskClaimingOpts) => {
      // We need to register here because once the class is instantiated, adding
      // definitions won't get claimed because of "partitionIntoClaimingBatches".
      opts.definitions.registerTaskDefinitions({
        _claimNudgeTestType: mockTaskType,
      });
      return new actual.TaskClaiming(opts);
    }),
  };
});

const taskManagerStartSpy = jest.spyOn(TaskManagerPlugin.prototype, 'start');

function injectFutureTask(esClient: Parameters<typeof injectTask>[0], id: string) {
  return injectTask(esClient, {
    id,
    taskType: '_claimNudgeTestType',
    params: {},
    state: { foo: 'test' },
    stateVersion: 1,
    // an hour out so regular polling can never claim it; only a `runSoon` can make it eligible
    runAt: new Date(Date.now() + 60 * 60 * 1000),
    enabled: true,
    scheduledAt: new Date(),
    attempts: 0,
    status: TaskStatus.Idle,
    startedAt: null,
    retryAt: null,
    ownerId: null,
  });
}

function latestStartContract(): TaskManagerStartContract {
  const lastResult = taskManagerStartSpy.mock.results[taskManagerStartSpy.mock.results.length - 1];
  return lastResult.value as TaskManagerStartContract;
}

// One-off tasks self-clean when they run, but a failing assertion can leave the doc behind where
// the next scenario (same ES cluster) would claim it.
async function cleanupTask(taskManagerPlugin: TaskManagerStartContract, id: string) {
  try {
    await taskManagerPlugin.removeIfExists(id);
  } catch (e) {
    // best-effort cleanup only
  }
}

// One ES server is shared across all scenarios (as in `task_manager_switch_task_claimers.test.ts`)
// so the suite pays the slow ES startup cost once while still using fresh plugin configs.
describe('claim nudge', () => {
  let esServer: TestElasticsearchUtils;
  let kibanaServer: TestKibanaUtils;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Whichever scenario runs first brings up ES too, so the suite stays runnable with `-t` rather
   * than only in declaration order.
   */
  async function startKibanaWith(taskManager: Record<string, unknown>) {
    const settings = { xpack: { task_manager: taskManager } };

    if (kibanaServer) {
      await kibanaServer.stop();
      ({ kibanaServer } = await setupKibanaServer(settings));
    } else {
      ({ esServer, kibanaServer } = await setupTestServers(settings));
    }

    // `beforeEach` clears the spy, so this counts only the Kibana root created above.
    expect(taskManagerStartSpy).toHaveBeenCalledTimes(1);
    return latestStartContract();
  }

  afterAll(async () => {
    if (kibanaServer) {
      await kibanaServer.stop();
    }
    if (esServer) {
      await esServer.stop();
    }
  });

  it('claims a runSoon task almost immediately instead of waiting for the next poll interval', async () => {
    const taskManagerPlugin = await startKibanaWith({
      claim_strategy: 'mget',
      poll_interval: POLLING_INTERVAL,
      unsafe: {
        exclude_task_types: ['[A-Za-z]*'],
      },
    });

    mockTaskTypeRunFn.mockImplementation(() => ({ state: {} }));

    const id = uuidV4();
    await injectFutureTask(kibanaServer.coreStart.elasticsearch.client.asInternalUser, id);

    const before = Date.now();
    await taskManagerPlugin.runSoon(id);

    try {
      await retry(async () => {
        expect(mockTaskTypeRunFn).toHaveBeenCalledTimes(1);
      }, NUDGE_RETRY_OPTS);
      const elapsedMs = Date.now() - before;

      expect(elapsedMs).toBeLessThan(POLLING_INTERVAL / 2);
    } finally {
      await cleanupTask(taskManagerPlugin, id);
    }
  });

  it('claims a scheduled task almost immediately when requestImmediateClaim is set', async () => {
    const taskManagerPlugin = await startKibanaWith({
      claim_strategy: 'mget',
      poll_interval: POLLING_INTERVAL,
      unsafe: {
        exclude_task_types: ['[A-Za-z]*'],
      },
    });

    mockTaskTypeRunFn.mockImplementation(() => ({ state: {} }));

    const id = uuidV4();
    const before = Date.now();
    await taskManagerPlugin.schedule(
      {
        id,
        taskType: '_claimNudgeTestType',
        params: {},
        state: { foo: 'test' },
      },
      { requestImmediateClaim: true }
    );

    try {
      await retry(async () => {
        expect(mockTaskTypeRunFn).toHaveBeenCalledTimes(1);
      }, NUDGE_RETRY_OPTS);
      const elapsedMs = Date.now() - before;

      expect(elapsedMs).toBeLessThan(POLLING_INTERVAL / 2);
    } finally {
      await cleanupTask(taskManagerPlugin, id);
    }
  });

  // Only that the task still runs. That no nudge was sent is pinned by the unit test
  // 'does not notify the claim nudge when requestImmediateClaim is not set'.
  it('still runs a schedule() task without requestImmediateClaim', async () => {
    const taskManagerPlugin = await startKibanaWith({
      claim_strategy: 'mget',
      poll_interval: 1000,
      unsafe: {
        exclude_task_types: ['[A-Za-z]*'],
      },
    });

    mockTaskTypeRunFn.mockImplementation(() => ({ state: {} }));

    const id = uuidV4();
    await taskManagerPlugin.schedule({
      id,
      taskType: '_claimNudgeTestType',
      params: {},
      state: { foo: 'test' },
    });

    try {
      await retry(async () => {
        expect(mockTaskTypeRunFn).toHaveBeenCalledTimes(1);
      });
    } finally {
      await cleanupTask(taskManagerPlugin, id);
    }
  });

  it('still claims a runSoon task (via regular polling) when claim_nudge.enabled is false', async () => {
    const taskManagerPlugin = await startKibanaWith({
      claim_strategy: 'mget',
      poll_interval: 1000,
      claim_nudge: {
        enabled: false,
      },
      unsafe: {
        exclude_task_types: ['[A-Za-z]*'],
      },
    });

    mockTaskTypeRunFn.mockImplementation(() => ({ state: {} }));

    const id = uuidV4();
    await injectFutureTask(kibanaServer.coreStart.elasticsearch.client.asInternalUser, id);

    await taskManagerPlugin.runSoon(id);

    try {
      await retry(async () => {
        expect(mockTaskTypeRunFn).toHaveBeenCalledTimes(1);
      });
    } finally {
      await cleanupTask(taskManagerPlugin, id);
    }
  });
});
