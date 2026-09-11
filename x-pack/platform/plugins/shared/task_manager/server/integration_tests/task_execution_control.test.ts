/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import type { Client } from '@elastic/elasticsearch';
import {
  elasticsearchServiceMock,
  savedObjectsRepositoryMock,
  coreMock,
} from '@kbn/core/server/mocks';
import type { SavedObject } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import type { TaskManagerStartContract } from '../plugin';
import { TaskManagerPlugin } from '../plugin';
import { ApiKeyType, type TaskManagerConfig } from '../config';
import { TASK_EXECUTION_CONTROL_SO_ID } from '../constants';
import { TASK_EXECUTION_CONTROL_SO_NAME } from '../saved_objects';
import type { TaskExecutionControl } from '../saved_objects/schemas/task_execution_control';

const POLL_INTERVAL = 3000;
const EXECUTION_CONTROL_POLL_INTERVAL = 1000;

const config: TaskManagerConfig = {
  discovery: {
    active_nodes_lookback: '30s',
    interval: 10000,
  },
  execution_control: {
    poll_interval: EXECUTION_CONTROL_POLL_INTERVAL,
  },
  kibanas_per_partition: 2,
  capacity: 10,
  max_attempts: 9,
  invalidate_api_key_task: {
    interval: '5m',
    removalDelay: '1h',
  },
  poll_interval: POLL_INTERVAL,
  allow_reading_invalid_state: false,
  version_conflict_threshold: 80,
  monitored_aggregated_stats_refresh_rate: 60000,
  monitored_stats_health_verbose_log: {
    enabled: false,
    level: 'debug' as const,
    warn_delayed_task_start_in_seconds: 60,
  },
  monitored_stats_required_freshness: 4000,
  monitored_stats_running_average_window: 50,
  request_capacity: 1000,
  monitored_task_execution_thresholds: {
    default: { error_threshold: 90, warn_threshold: 80 },
    custom: {},
  },
  unsafe: {
    exclude_task_types: [],
    authenticate_background_task_utilization: true,
  },
  event_loop_delay: { monitor: true, warn_threshold: 5000 },
  worker_utilization_running_average_window: 5,
  metrics_reset_interval: 3000,
  claim_strategy: 'update_by_query',
  request_timeouts: { update_by_query: 1000 },
  auto_calculate_default_ech_capacity: false,
  api_key_type: ApiKeyType.ES,
  grant_uiam_api_keys: false,
  claim_nudge: {
    enabled: true,
  },
};

describe('task execution control (in-process integration)', () => {
  let taskManagerStart: TaskManagerStartContract;
  let clock: sinon.SinonFakeTimers;
  const savedObjectsClient = savedObjectsRepositoryMock.create();
  const esStart = elasticsearchServiceMock.createStart();

  // Mutable control-document state the polling service reads each cycle.
  let controlDoc: SavedObject<TaskExecutionControl> | undefined;

  const notFound = () =>
    SavedObjectsErrorHelpers.createGenericNotFoundError(
      TASK_EXECUTION_CONTROL_SO_NAME,
      TASK_EXECUTION_CONTROL_SO_ID
    );

  const setControlState = (attributes?: TaskExecutionControl) => {
    controlDoc = attributes
      ? {
          id: TASK_EXECUTION_CONTROL_SO_ID,
          type: TASK_EXECUTION_CONTROL_SO_NAME,
          references: [],
          attributes,
          version: 'v1',
        }
      : undefined;
  };

  async function runSetTimeout0() {
    const promiseResult = new Promise((resolve) => setTimeout(resolve, 0));
    clock.tick(0);
    await promiseResult;
  }

  async function advance(ms: number) {
    clock.tick(ms);
    await runSetTimeout0();
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    clock = sinon.useFakeTimers();
    setControlState(undefined);

    savedObjectsClient.get.mockImplementation(async (type: string) => {
      if (type === TASK_EXECUTION_CONTROL_SO_NAME) {
        if (!controlDoc) {
          throw notFound();
        }
        return controlDoc as SavedObject<unknown>;
      }
      throw notFound();
    });

    esStart.client.asInternalUser.child.mockReturnValue(
      esStart.client.asInternalUser as unknown as Client
    );

    const context = coreMock.createPluginInitializerContext<TaskManagerConfig>(config);
    const taskManager = new TaskManagerPlugin(context);
    (
      await taskManager.setup(coreMock.createSetup(), { usageCollection: undefined })
    ).registerTaskDefinitions({
      foo: { title: 'Foo', createTaskRunner: jest.fn() },
    });

    const coreStart = coreMock.createStart();
    coreStart.elasticsearch = esStart;
    coreStart.savedObjects.createInternalRepository.mockReturnValue(savedObjectsClient);
    taskManagerStart = await taskManager.start(coreStart, {
      licensing: licensingMock.createStart(),
    });

    // Let startup (availability, execution-control ready(), poller start) settle.
    await runSetTimeout0();
    await runSetTimeout0();
  });

  afterEach(() => clock.restore());

  const controlSoReadCount = () =>
    savedObjectsClient.get.mock.calls.filter(([type]) => type === TASK_EXECUTION_CONTROL_SO_NAME)
      .length;

  it('polls the execution control saved object on startup and on an interval', async () => {
    const readsAtStartup = controlSoReadCount();
    expect(readsAtStartup).toBeGreaterThan(0);

    await advance(EXECUTION_CONTROL_POLL_INTERVAL + 100);
    expect(controlSoReadCount()).toBeGreaterThan(readsAtStartup);
  });

  it('keeps task CRUD working while paused', async () => {
    setControlState({ paused: true, paused_task_types: [], updated_at: 'x' });
    await advance(EXECUTION_CONTROL_POLL_INTERVAL + 100);

    savedObjectsClient.create.mockResolvedValueOnce({
      id: 'task-1',
      type: 'task',
      references: [],
      attributes: {},
    } as SavedObject<unknown>);

    // Pausing execution must not block scheduling/CRUD of tasks.
    await expect(
      taskManagerStart.schedule({ taskType: 'foo', state: {}, params: {} })
    ).resolves.toBeDefined();
  });
});
