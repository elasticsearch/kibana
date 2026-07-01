/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IToasts } from '@kbn/core/public';
import { type AnyActorRef, createActor, type Snapshot, waitFor } from 'xstate';
import type { DataStreamDocsStat, NonAggregatableDatasets } from '../../../../common/api_types';
import type {
  DataStreamStat,
  DataStreamStatServiceResponse,
} from '../../../../common/data_streams_stats';
import type { Integration } from '../../../../common/data_streams_stats/integration';
import type { IDataStreamsStatsClient } from '../../../services/data_streams_stats';
import {
  createDatasetQualityControllerStateMachine,
  type DatasetQualityControllerStateMachineDependencies,
} from './state_machine';
import { DEFAULT_CONTEXT } from './defaults';
import { fetchTotalDocsFailedNotifier } from './notifications';

// Mock only the notification that has a known issue accessing meta._event.origin
// when called from the provided action with `{}` as meta.
jest.mock('./notifications', () => {
  const actual = jest.requireActual('./notifications');
  return {
    ...actual,
    fetchTotalDocsFailedNotifier: jest.fn(),
  };
});

const mockedFetchTotalDocsFailedNotifier = fetchTotalDocsFailedNotifier as jest.Mock;

/**
 * XState v5's strict TypeScript types don't accept dot-notation strings
 * in `.matches()`, but they work correctly at runtime. These helpers
 * bypass the strict typing for test assertions.
 */
const stateMatches = (snapshot: Snapshot<unknown>, path: string): boolean =>
  (snapshot as ReturnType<AnyActorRef['getSnapshot']>).matches(path);

const WAIT_FOR_TIMEOUT = 10_000;

const waitForState = async (actor: ReturnType<typeof createActor>, path: string) =>
  waitFor(actor as AnyActorRef, (state) => stateMatches(state, path), {
    timeout: WAIT_FOR_TIMEOUT,
  });

const waitForPredicate = async (
  actor: ReturnType<typeof createActor>,
  predicate: (snapshot: ReturnType<AnyActorRef['getSnapshot']>) => boolean
) =>
  waitFor(actor as AnyActorRef, predicate, {
    timeout: WAIT_FOR_TIMEOUT,
  });

const createMockToasts = (): jest.Mocked<IToasts> =>
  ({
    addDanger: jest.fn(),
    addSuccess: jest.fn(),
    addWarning: jest.fn(),
    addError: jest.fn(),
    addInfo: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
    get$: jest.fn(),
  } as unknown as jest.Mocked<IToasts>);

const createForbiddenError = () => {
  const error = new Error('Forbidden');
  (error as Error & { statusCode: number }).statusCode = 403;
  return error;
};

const createNotImplementedError = () => {
  const error = new Error('Not Implemented');
  (error as Error & { statusCode: number }).statusCode = 501;
  return error;
};

const createGenericError = () => new Error('Something went wrong');

const defaultTypesPrivilegesResponse = {
  datasetTypesPrivileges: {
    'logs-*-*': {
      canMonitor: true,
      canRead: true,
      canReadFailureStore: true,
      canManageFailureStore: true,
    },
    'metrics-*-*': {
      canMonitor: true,
      canRead: true,
      canReadFailureStore: true,
      canManageFailureStore: true,
    },
    'traces-*-*': {
      canMonitor: true,
      canRead: true,
      canReadFailureStore: true,
      canManageFailureStore: true,
    },
    'synthetics-*-*': {
      canMonitor: true,
      canRead: true,
      canReadFailureStore: true,
      canManageFailureStore: true,
    },
  },
};

const noPrivilegesResponse = {
  datasetTypesPrivileges: {
    'logs-*-*': {
      canMonitor: false,
      canRead: false,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
    'metrics-*-*': {
      canMonitor: false,
      canRead: false,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
    'traces-*-*': {
      canMonitor: false,
      canRead: false,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
    'synthetics-*-*': {
      canMonitor: false,
      canRead: false,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
  },
};

const partialPrivilegesResponse = {
  datasetTypesPrivileges: {
    // Wildcard check fails for logs (e.g. role with a negated/complement index
    // pattern), even though individual logs data streams are accessible.
    'logs-*-*': {
      canMonitor: false,
      canRead: false,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
    'metrics-*-*': {
      canMonitor: true,
      canRead: true,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
    'traces-*-*': {
      canMonitor: true,
      canRead: true,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
    'synthetics-*-*': {
      canMonitor: true,
      canRead: true,
      canReadFailureStore: false,
      canManageFailureStore: false,
    },
  },
};

const defaultDataStreamStatsResponse: DataStreamStatServiceResponse = {
  dataStreamsStats: [],
  datasetUserPrivileges: {
    datasetsPrivilages: {},
    canViewIntegrations: true,
  },
};

const defaultDegradedDocsResponse: DataStreamDocsStat[] = [];
const defaultFailedDocsResponse: DataStreamDocsStat[] = [];
const defaultTotalDocsResponse: DataStreamDocsStat[] = [];

const defaultNonAggregatableDatasetsResponse: NonAggregatableDatasets = {
  aggregatable: true,
  datasets: [],
};

const defaultIntegrationsResponse: Integration[] = [];

const createMockDataStreamStatsClient = (
  overrides: Partial<Record<keyof IDataStreamsStatsClient, jest.Mock>> = {}
) =>
  ({
    getDataStreamsTypesPrivileges: jest.fn().mockResolvedValue(defaultTypesPrivilegesResponse),
    getDataStreamsStats: jest.fn().mockResolvedValue(defaultDataStreamStatsResponse),
    getDataStreamsDegradedStats: jest.fn().mockResolvedValue(defaultDegradedDocsResponse),
    getDataStreamsFailedStats: jest.fn().mockResolvedValue(defaultFailedDocsResponse),
    getDataStreamsTotalDocs: jest.fn().mockResolvedValue(defaultTotalDocsResponse),
    getIntegrations: jest.fn().mockResolvedValue(defaultIntegrationsResponse),
    getNonAggregatableDatasets: jest.fn().mockResolvedValue(defaultNonAggregatableDatasetsResponse),
    updateFailureStore: jest.fn().mockResolvedValue({ headers: {} }),
    ...overrides,
  } as unknown as jest.Mocked<IDataStreamsStatsClient>);

const buildStateMachine = (
  overrides: Partial<DatasetQualityControllerStateMachineDependencies> = {}
) => {
  const toasts = createMockToasts();
  const dataStreamStatsClient =
    (overrides.dataStreamStatsClient as jest.Mocked<IDataStreamsStatsClient>) ??
    createMockDataStreamStatsClient();

  const deps: DatasetQualityControllerStateMachineDependencies = {
    initialContext: DEFAULT_CONTEXT,
    toasts,
    dataStreamStatsClient,
    isDatasetQualityAllSignalsAvailable: true,
    ...overrides,
  };

  const machine = createDatasetQualityControllerStateMachine(deps);
  return { machine, toasts, dataStreamStatsClient };
};

describe('DatasetQualityControllerStateMachine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start in the initializing state', () => {
      const { machine } = buildStateMachine();
      const actor = createActor(machine);
      actor.start();

      expect(actor.getSnapshot().value).toBe('initializing');

      actor.stop();
    });

    it('should transition to main state when types privileges are authorized', async () => {
      const { machine } = buildStateMachine();
      const actor = createActor(machine);
      actor.start();

      await waitForPredicate(
        actor,
        (state) => typeof state.value === 'object' && 'main' in state.value
      );

      const snapshot = actor.getSnapshot();
      expect(typeof snapshot.value === 'object' && 'main' in snapshot.value).toBe(true);

      actor.stop();
    });

    it('should transition to main and fallback to all known types when no types are authorized at wildcard level', async () => {
      const { machine } = buildStateMachine({
        dataStreamStatsClient: createMockDataStreamStatsClient({
          getDataStreamsTypesPrivileges: jest.fn().mockResolvedValue(noPrivilegesResponse),
        }),
      });
      const actor = createActor(machine);
      actor.start();

      await waitForPredicate(
        actor,
        (state) => typeof state.value === 'object' && 'main' in state.value
      );

      const snapshot = actor.getSnapshot();
      expect(typeof snapshot.value === 'object' && 'main' in snapshot.value).toBe(true);

      actor.stop();
    });

    it('should transition to initializationFailed on privileges fetch error', async () => {
      const { machine, toasts } = buildStateMachine({
        dataStreamStatsClient: createMockDataStreamStatsClient({
          getDataStreamsTypesPrivileges: jest.fn().mockRejectedValue(createGenericError()),
        }),
      });
      const actor = createActor(machine);
      actor.start();

      await waitForPredicate(actor, (state) => state.value === 'initializationFailed');

      expect(actor.getSnapshot().value).toBe('initializationFailed');
      expect(toasts.addDanger).toHaveBeenCalled();

      actor.stop();
    });

    it('should store authorized dataset types in context after initialization', async () => {
      const { machine } = buildStateMachine();
      const actor = createActor(machine);
      actor.start();

      await waitForPredicate(
        actor,
        (state) => typeof state.value === 'object' && 'main' in state.value
      );

      const { authorizedDatasetTypes } = actor.getSnapshot().context;
      expect(authorizedDatasetTypes).toEqual(
        expect.arrayContaining(['logs', 'metrics', 'traces', 'synthetics'])
      );

      actor.stop();
    });

    it('should still query a type whose wildcard privilege check fails (negated role) while excluding it from the types filter', async () => {
      const dataStreamStatsClient = createMockDataStreamStatsClient({
        getDataStreamsTypesPrivileges: jest.fn().mockResolvedValue(partialPrivilegesResponse),
      });
      const { machine } = buildStateMachine({ dataStreamStatsClient });
      const actor = createActor(machine);
      actor.start();

      await waitForState(actor, 'main.stats.datasets.loaded');

      // `logs` is excluded from the authorized types (the types filter UI) because its
      // wildcard `logs-*-*` privilege check fails for a negated/complement role.
      const { authorizedDatasetTypes } = actor.getSnapshot().context;
      expect(authorizedDatasetTypes).not.toContain('logs');
      expect(authorizedDatasetTypes).toEqual(
        expect.arrayContaining(['metrics', 'traces', 'synthetics'])
      );

      // `logs` is still queried so its accessible data streams are discovered and listed;
      // authorization is enforced per data stream server-side.
      expect(dataStreamStatsClient.getDataStreamsStats).toHaveBeenCalledWith(
        expect.objectContaining({ types: expect.arrayContaining(['logs']) })
      );

      actor.stop();
    });

    it('should still fetch total docs for a type whose wildcard privilege check fails (negated role)', async () => {
      const dataStreamStatsClient = createMockDataStreamStatsClient({
        getDataStreamsTypesPrivileges: jest.fn().mockResolvedValue(partialPrivilegesResponse),
      });

      const { machine } = buildStateMachine({
        initialContext: {
          ...DEFAULT_CONTEXT,
          filters: {
            ...DEFAULT_CONTEXT.filters,
            types: [], // empty means all authorized types are selected
          },
        },
        dataStreamStatsClient,
      });
      const actor = createActor(machine);
      actor.start();

      await waitForState(actor, 'main.stats.docsStats.loaded');

      // `logs` total docs must still be requested even though its `logs-*-*`
      // wildcard privilege is false; the server returns only accessible streams.
      expect(dataStreamStatsClient.getDataStreamsTotalDocs).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'logs' })
      );
      expect(dataStreamStatsClient.getDataStreamsTotalDocs).toHaveBeenCalledTimes(4);

      actor.stop();
    });
  });

  describe('main state - parallel fetching', () => {
    describe('datasets', () => {
      it('should fetch data stream stats on entering main state', async () => {
        const { machine, dataStreamStatsClient } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(dataStreamStatsClient.getDataStreamsStats).toHaveBeenCalled();

        actor.stop();
      });

      it('should not forward filters.query to stats/degraded/failed fetches', async () => {
        const { machine, dataStreamStatsClient } = buildStateMachine({
          initialContext: {
            ...DEFAULT_CONTEXT,
            filters: {
              ...DEFAULT_CONTEXT.filters,
              query: 'synth',
            },
          },
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(dataStreamStatsClient.getDataStreamsStats).toHaveBeenCalledWith(
          expect.not.objectContaining({ datasetQuery: expect.anything() })
        );
        expect(dataStreamStatsClient.getDataStreamsDegradedStats).toHaveBeenCalledWith(
          expect.not.objectContaining({ datasetQuery: expect.anything() })
        );
        expect(dataStreamStatsClient.getDataStreamsFailedStats).toHaveBeenCalledWith(
          expect.not.objectContaining({ datasetQuery: expect.anything() })
        );

        actor.stop();
      });

      it('should transition datasets to loaded on success', async () => {
        const { machine } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.datasets.loaded')).toBe(true);

        actor.stop();
      });

      it('should transition datasets to loaded and notify on fetch error', async () => {
        const { machine, toasts } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsStats: jest.fn().mockRejectedValue(createGenericError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.datasets.loaded')).toBe(true);
        expect(toasts.addDanger).toHaveBeenCalled();

        actor.stop();
      });

      it('should store data stream stats in context on success', async () => {
        const mockStats = [
          {
            name: 'logs-test-default',
            userPrivileges: {
              canMonitor: true,
              canReadFailureStore: true,
              canManageFailureStore: true,
            },
          },
        ];

        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsStats: jest.fn().mockResolvedValue({
              dataStreamsStats: mockStats,
              datasetUserPrivileges: { datasetsPrivilages: {}, canViewIntegrations: true },
            }),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(actor.getSnapshot().context.dataStreamStats).toEqual(mockStats);

        actor.stop();
      });
    });

    describe('degradedDocs', () => {
      it('should fetch degraded docs stats on entering main state', async () => {
        const { machine, dataStreamStatsClient } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.degradedDocs.loaded');

        expect(dataStreamStatsClient.getDataStreamsDegradedStats).toHaveBeenCalled();

        actor.stop();
      });

      it('should transition degradedDocs to loaded on success', async () => {
        const { machine } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.degradedDocs.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.degradedDocs.loaded')).toBe(true);

        actor.stop();
      });

      it('should transition degradedDocs to unauthorized on 403 error', async () => {
        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsDegradedStats: jest.fn().mockRejectedValue(createForbiddenError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.degradedDocs.unauthorized');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.degradedDocs.unauthorized')).toBe(
          true
        );

        actor.stop();
      });

      it('should transition degradedDocs to loaded and notify on non-403 error', async () => {
        const { machine, toasts } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsDegradedStats: jest.fn().mockRejectedValue(createGenericError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.degradedDocs.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.degradedDocs.loaded')).toBe(true);
        expect(toasts.addDanger).toHaveBeenCalled();

        actor.stop();
      });

      it('should store degraded doc stats in context on success', async () => {
        const mockDegradedDocs: DataStreamDocsStat[] = [
          { dataset: 'logs-test-default', count: 42 },
        ];

        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsDegradedStats: jest.fn().mockResolvedValue(mockDegradedDocs),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.degradedDocs.loaded');

        expect(actor.getSnapshot().context.degradedDocStats).toEqual(mockDegradedDocs);

        actor.stop();
      });
    });

    describe('failedDocs', () => {
      it('should fetch failed docs stats on entering main state', async () => {
        const { machine, dataStreamStatsClient } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.failedDocs.loaded');

        expect(dataStreamStatsClient.getDataStreamsFailedStats).toHaveBeenCalled();

        actor.stop();
      });

      it('should transition failedDocs to loaded on success', async () => {
        const { machine } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.failedDocs.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.failedDocs.loaded')).toBe(true);

        actor.stop();
      });

      it('should transition failedDocs to unauthorized on 403 error', async () => {
        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsFailedStats: jest.fn().mockRejectedValue(createForbiddenError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.failedDocs.unauthorized');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.failedDocs.unauthorized')).toBe(true);

        actor.stop();
      });

      it('should transition failedDocs to notImplemented on 501 error', async () => {
        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsFailedStats: jest.fn().mockRejectedValue(createNotImplementedError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.failedDocs.notImplemented');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.failedDocs.notImplemented')).toBe(
          true
        );

        actor.stop();
      });

      it('should transition failedDocs to loaded and notify on generic error', async () => {
        const { machine, toasts } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsFailedStats: jest.fn().mockRejectedValue(createGenericError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.failedDocs.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.failedDocs.loaded')).toBe(true);
        expect(toasts.addDanger).toHaveBeenCalled();

        actor.stop();
      });
    });

    describe('docsStats (total docs per type)', () => {
      it('should invoke loadDataStreamDocsStats for each known type on entering main state', async () => {
        const { machine, dataStreamStatsClient } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.docsStats.loaded');

        // The default context has types: ['logs'], so only 'logs' calls the actual client.
        // Other types skip the client call and resolve with [].
        expect(dataStreamStatsClient.getDataStreamsTotalDocs).toHaveBeenCalledTimes(1);
        expect(dataStreamStatsClient.getDataStreamsTotalDocs).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'logs' })
        );

        actor.stop();
      });

      it('should fetch total docs for all selected types when types filter is empty', async () => {
        const dataStreamStatsClient = createMockDataStreamStatsClient();

        const { machine } = buildStateMachine({
          initialContext: {
            ...DEFAULT_CONTEXT,
            filters: {
              ...DEFAULT_CONTEXT.filters,
              types: [], // empty means all authorized types are selected
            },
          },
          dataStreamStatsClient,
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.docsStats.loaded');

        // All 4 known types should be fetched
        expect(dataStreamStatsClient.getDataStreamsTotalDocs).toHaveBeenCalledTimes(4);

        actor.stop();
      });

      it('should transition docsStats to loaded when all types report success', async () => {
        const { machine } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.docsStats.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.docsStats.loaded')).toBe(true);

        actor.stop();
      });

      it('should store total docs stats per type in context', async () => {
        const logsDocs: DataStreamDocsStat[] = [{ dataset: 'logs-test-default', count: 100 }];
        const metricsDocs: DataStreamDocsStat[] = [{ dataset: 'metrics-test-default', count: 200 }];

        const { machine } = buildStateMachine({
          initialContext: {
            ...DEFAULT_CONTEXT,
            filters: {
              ...DEFAULT_CONTEXT.filters,
              types: [], // all types selected
            },
          },
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsTotalDocs: jest.fn().mockImplementation(({ type }) => {
              if (type === 'logs') return Promise.resolve(logsDocs);
              if (type === 'metrics') return Promise.resolve(metricsDocs);
              return Promise.resolve([]);
            }),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.docsStats.loaded');

        const { totalDocsStats } = actor.getSnapshot().context;
        expect(totalDocsStats.logs).toEqual(logsDocs);
        expect(totalDocsStats.metrics).toEqual(metricsDocs);

        actor.stop();
      });

      it('should treat per-type 403 as empty result and still reach loaded', async () => {
        // A negated-role user (e.g. access to everything except logs-apm*) passes
        // the wildcard check for no type, so all 4 types are fetched. metrics/
        // traces/synthetics 403, but logs succeeds.
        // 403s are absorbed as empty results so the machine reaches loaded state
        // and logs doc counts are preserved for correct quality scoring.
        const logsDocs: DataStreamDocsStat[] = [{ dataset: 'logs-test-default', count: 100 }];

        const { machine } = buildStateMachine({
          initialContext: {
            ...DEFAULT_CONTEXT,
            filters: { ...DEFAULT_CONTEXT.filters, types: [] },
          },
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsTotalDocs: jest.fn().mockImplementation(({ type }) => {
              if (type === 'logs') return Promise.resolve(logsDocs);
              // simulates a negated-role user: metrics/traces/synthetics are inaccessible
              return Promise.reject(createForbiddenError());
            }),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.docsStats.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.docsStats.loaded')).toBe(true);

        const { totalDocsStats } = actor.getSnapshot().context;
        // logs doc counts are preserved → quality percentage is computed correctly
        expect(totalDocsStats.logs).toEqual(logsDocs);
        // inaccessible types silently resolve as empty — not an error
        expect(totalDocsStats.metrics).toEqual([]);
        expect(totalDocsStats.traces).toEqual([]);
        expect(totalDocsStats.synthetics).toEqual([]);

        actor.stop();
      });

      it('should transition docsStats to loaded on non-403 error', async () => {
        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsTotalDocs: jest.fn().mockImplementation(({ type }) => {
              if (type === 'logs') return Promise.reject(createGenericError());
              return Promise.resolve([]);
            }),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.docsStats.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.docsStats.loaded')).toBe(true);
        expect(mockedFetchTotalDocsFailedNotifier).toHaveBeenCalled();

        actor.stop();
      });

      it('should not get stuck in fetching when a type fails', async () => {
        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getDataStreamsTotalDocs: jest.fn().mockRejectedValue(createGenericError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        // Should eventually reach loaded (not remain stuck in fetching)
        await waitForState(actor, 'main.stats.docsStats.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.docsStats.loaded')).toBe(true);

        actor.stop();
      });

      it('should reset loadedTotalDocsTypes on entering fetching state', async () => {
        const { machine } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.docsStats.loaded');

        expect(actor.getSnapshot().context.loadedTotalDocsTypes).toEqual(
          expect.arrayContaining(['logs', 'metrics', 'traces', 'synthetics'])
        );

        // Trigger a refresh to re-enter fetching
        actor.send({ type: 'REFRESH_DATA' });

        await waitForState(actor, 'main.stats.docsStats.loaded');

        expect(actor.getSnapshot().context.loadedTotalDocsTypes).toEqual(
          expect.arrayContaining(['logs', 'metrics', 'traces', 'synthetics'])
        );

        actor.stop();
      });
    });

    describe('nonAggregatableDatasets', () => {
      it('should fetch non-aggregatable datasets on entering main state', async () => {
        const { machine, dataStreamStatsClient } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.nonAggregatableDatasets.loaded');

        expect(dataStreamStatsClient.getNonAggregatableDatasets).toHaveBeenCalled();

        actor.stop();
      });

      it('should transition to loaded on success', async () => {
        const { machine } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.nonAggregatableDatasets.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.nonAggregatableDatasets.loaded')).toBe(
          true
        );

        actor.stop();
      });

      it('should transition to unauthorized on 403 error', async () => {
        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getNonAggregatableDatasets: jest.fn().mockRejectedValue(createForbiddenError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.nonAggregatableDatasets.unauthorized');

        expect(
          stateMatches(actor.getSnapshot(), 'main.stats.nonAggregatableDatasets.unauthorized')
        ).toBe(true);

        actor.stop();
      });

      it('should transition to loaded and notify on non-403 error', async () => {
        const { machine, toasts } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getNonAggregatableDatasets: jest.fn().mockRejectedValue(createGenericError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.nonAggregatableDatasets.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.stats.nonAggregatableDatasets.loaded')).toBe(
          true
        );
        expect(toasts.addDanger).toHaveBeenCalled();

        actor.stop();
      });

      it('should store non-aggregatable datasets in context', async () => {
        const mockDatasets: NonAggregatableDatasets = {
          aggregatable: false,
          datasets: ['logs-test-default'],
        };

        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getNonAggregatableDatasets: jest.fn().mockResolvedValue(mockDatasets),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.stats.nonAggregatableDatasets.loaded');

        expect(actor.getSnapshot().context.nonAggregatableDatasets).toEqual(mockDatasets.datasets);

        actor.stop();
      });
    });

    describe('integrations', () => {
      it('should fetch integrations on entering main state', async () => {
        const { machine, dataStreamStatsClient } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.integrations.loaded');

        expect(dataStreamStatsClient.getIntegrations).toHaveBeenCalled();

        actor.stop();
      });

      it('should transition integrations to loaded on success', async () => {
        const { machine } = buildStateMachine();
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.integrations.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.integrations.loaded')).toBe(true);

        actor.stop();
      });

      it('should transition integrations to loaded and notify on error', async () => {
        const { machine, toasts } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getIntegrations: jest.fn().mockRejectedValue(createGenericError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.integrations.loaded');

        expect(stateMatches(actor.getSnapshot(), 'main.integrations.loaded')).toBe(true);
        expect(toasts.addDanger).toHaveBeenCalled();

        actor.stop();
      });

      it('should store integrations in context on success', async () => {
        const mockIntegrations = [
          { name: 'nginx', datasets: { 'nginx.access': {} } },
        ] as unknown as Integration[];

        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getIntegrations: jest.fn().mockResolvedValue(mockIntegrations),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.integrations.loaded');

        expect(actor.getSnapshot().context.integrations).toEqual(mockIntegrations);

        actor.stop();
      });

      it('should set empty integrations on fetch error', async () => {
        const { machine } = buildStateMachine({
          dataStreamStatsClient: createMockDataStreamStatsClient({
            getIntegrations: jest.fn().mockRejectedValue(createGenericError()),
          }),
        });
        const actor = createActor(machine);
        actor.start();

        await waitForState(actor, 'main.integrations.loaded');

        expect(actor.getSnapshot().context.integrations).toEqual([]);

        actor.stop();
      });
    });
  });

  describe('events in main state', () => {
    const startInMainState = async (
      overrides: Partial<DatasetQualityControllerStateMachineDependencies> = {}
    ) => {
      const { machine, toasts, dataStreamStatsClient } = buildStateMachine(overrides);
      const actor = createActor(machine);
      actor.start();

      await waitForPredicate(
        actor,
        (state) =>
          stateMatches(state, 'main.stats.datasets.loaded') &&
          stateMatches(state, 'main.integrations.loaded')
      );

      return { actor, toasts, dataStreamStatsClient };
    };

    describe('UPDATE_TIME_RANGE', () => {
      it('should store the new time range and refetch all stats', async () => {
        const { actor, dataStreamStatsClient } = await startInMainState();

        const initialCallCount = dataStreamStatsClient.getDataStreamsStats.mock.calls.length;

        const newTimeRange = {
          from: 'now-7d',
          to: 'now',
          refresh: { pause: true, value: 60000 },
        };
        actor.send({ type: 'UPDATE_TIME_RANGE', timeRange: newTimeRange });

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(actor.getSnapshot().context.filters.timeRange).toEqual(newTimeRange);
        expect(dataStreamStatsClient.getDataStreamsStats.mock.calls.length).toBeGreaterThan(
          initialCallCount
        );

        actor.stop();
      });

      it('should re-enter fetching states for stat nodes', async () => {
        const { actor } = await startInMainState();

        const newTimeRange = {
          from: 'now-1h',
          to: 'now',
          refresh: { pause: true, value: 60000 },
        };
        actor.send({ type: 'UPDATE_TIME_RANGE', timeRange: newTimeRange });

        // Right after sending, datasets should be in fetching
        expect(stateMatches(actor.getSnapshot(), 'main.stats.datasets.fetching')).toBe(true);

        await waitForState(actor, 'main.stats.datasets.loaded');

        actor.stop();
      });
    });

    describe('REFRESH_DATA', () => {
      it('should re-fetch all data', async () => {
        const { actor, dataStreamStatsClient } = await startInMainState();

        const callCountBefore = dataStreamStatsClient.getDataStreamsStats.mock.calls.length;

        actor.send({ type: 'REFRESH_DATA' });

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(dataStreamStatsClient.getDataStreamsStats.mock.calls.length).toBeGreaterThan(
          callCountBefore
        );

        actor.stop();
      });
    });

    describe('UPDATE_TABLE_CRITERIA', () => {
      it('should update table options in context', async () => {
        const { actor } = await startInMainState();

        const newCriteria = {
          page: 1,
          rowsPerPage: 25,
          sort: { field: 'title' as const, direction: 'desc' as const },
        };

        actor.send({ type: 'UPDATE_TABLE_CRITERIA', dataset_criteria: newCriteria });

        expect(actor.getSnapshot().context.table).toEqual(newCriteria);

        actor.stop();
      });
    });

    describe('TOGGLE_INACTIVE_DATASETS', () => {
      it('should toggle inactive datasets visibility', async () => {
        const { actor } = await startInMainState();

        const initialInactive = actor.getSnapshot().context.filters.inactive;

        actor.send({ type: 'TOGGLE_INACTIVE_DATASETS' });

        expect(actor.getSnapshot().context.filters.inactive).toBe(!initialInactive);

        actor.stop();
      });

      it('should reset page to 0 when toggling inactive datasets', async () => {
        const { actor } = await startInMainState();

        actor.send({
          type: 'UPDATE_TABLE_CRITERIA',
          dataset_criteria: {
            page: 2,
            rowsPerPage: 10,
            sort: { field: 'title' as const, direction: 'asc' as const },
          },
        });

        actor.send({ type: 'TOGGLE_INACTIVE_DATASETS' });

        expect(actor.getSnapshot().context.table.page).toBe(0);

        actor.stop();
      });
    });

    describe('TOGGLE_FULL_DATASET_NAMES', () => {
      it('should toggle full dataset names visibility', async () => {
        const { actor } = await startInMainState();

        const initialFullNames = actor.getSnapshot().context.filters.fullNames;

        actor.send({ type: 'TOGGLE_FULL_DATASET_NAMES' });

        expect(actor.getSnapshot().context.filters.fullNames).toBe(!initialFullNames);

        actor.stop();
      });
    });

    describe('UPDATE_INTEGRATIONS', () => {
      it('should store integrations filter in context', async () => {
        const { actor } = await startInMainState();

        actor.send({ type: 'UPDATE_INTEGRATIONS', integrations: ['nginx', 'system'] });

        expect(actor.getSnapshot().context.filters.integrations).toEqual(['nginx', 'system']);

        actor.stop();
      });
    });

    describe('UPDATE_NAMESPACES', () => {
      it('should store namespaces filter in context', async () => {
        const { actor } = await startInMainState();

        actor.send({ type: 'UPDATE_NAMESPACES', namespaces: ['default', 'production'] });

        expect(actor.getSnapshot().context.filters.namespaces).toEqual(['default', 'production']);

        actor.stop();
      });
    });

    describe('UPDATE_QUALITIES', () => {
      it('should store qualities filter in context', async () => {
        const { actor } = await startInMainState();

        actor.send({ type: 'UPDATE_QUALITIES', qualities: ['good', 'poor'] });

        expect(actor.getSnapshot().context.filters.qualities).toEqual(['good', 'poor']);

        actor.stop();
      });
    });

    describe('UPDATE_QUERY', () => {
      it('should store query in context', async () => {
        const { actor } = await startInMainState();

        actor.send({ type: 'UPDATE_QUERY', query: 'nginx' });

        expect(actor.getSnapshot().context.filters.query).toBe('nginx');

        actor.stop();
      });
    });

    describe('UPDATE_TYPES', () => {
      it('should store types filter and re-fetch all stats', async () => {
        const { actor, dataStreamStatsClient } = await startInMainState();

        const callCountBefore = dataStreamStatsClient.getDataStreamsStats.mock.calls.length;

        actor.send({ type: 'UPDATE_TYPES', types: ['logs', 'metrics'] });

        await waitForState(actor, 'main.stats.datasets.loaded');

        expect(actor.getSnapshot().context.filters.types).toEqual(['logs', 'metrics']);
        expect(dataStreamStatsClient.getDataStreamsStats.mock.calls.length).toBeGreaterThan(
          callCountBefore
        );

        actor.stop();
      });
    });
  });

  describe('failure store update', () => {
    it('should call updateFailureStore and notify success', async () => {
      const dataStreamStatsClient = createMockDataStreamStatsClient();
      const toasts = createMockToasts();

      const machine = createDatasetQualityControllerStateMachine({
        initialContext: DEFAULT_CONTEXT,
        toasts,
        dataStreamStatsClient,
        isDatasetQualityAllSignalsAvailable: true,
      });

      const actor = createActor(machine);
      actor.start();

      await waitForPredicate(
        actor,
        (state) =>
          stateMatches(state, 'main.stats.datasets.loaded') &&
          stateMatches(state, 'main.integrations.loaded')
      );

      const statsCallsBefore = dataStreamStatsClient.getDataStreamsStats.mock.calls.length;

      const mockDataStream = {
        rawName: 'logs-test-default',
        hasFailureStore: true,
      } as unknown as DataStreamStat;

      actor.send({ type: 'UPDATE_FAILURE_STORE', dataStream: mockDataStream });

      // Wait for the datasets refetch triggered by successful failure store update
      await waitForPredicate(
        actor,
        (state) =>
          stateMatches(state, 'main.stats.datasets.loaded') &&
          dataStreamStatsClient.getDataStreamsStats.mock.calls.length > statsCallsBefore
      );

      expect(dataStreamStatsClient.updateFailureStore).toHaveBeenCalled();
      expect(toasts.addSuccess).toHaveBeenCalled();

      actor.stop();
    });

    it('should notify failure when updateFailureStore fails', async () => {
      const dataStreamStatsClient = createMockDataStreamStatsClient({
        updateFailureStore: jest.fn().mockRejectedValue(createGenericError()),
      });
      const toasts = createMockToasts();

      const machine = createDatasetQualityControllerStateMachine({
        initialContext: DEFAULT_CONTEXT,
        toasts,
        dataStreamStatsClient,
        isDatasetQualityAllSignalsAvailable: true,
      });

      const actor = createActor(machine);
      actor.start();

      await waitForPredicate(
        actor,
        (state) =>
          stateMatches(state, 'main.stats.datasets.loaded') &&
          stateMatches(state, 'main.integrations.loaded')
      );

      const mockDataStream = {
        rawName: 'logs-test-default',
        hasFailureStore: true,
      } as unknown as DataStreamStat;

      actor.send({ type: 'UPDATE_FAILURE_STORE', dataStream: mockDataStream });

      // Give the async operation time to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(toasts.addDanger).toHaveBeenCalled();

      actor.stop();
    });
  });

  describe('isDatasetQualityAllSignalsAvailable flag', () => {
    it('should only query the default dataset type when all signals flag is false', async () => {
      const dataStreamStatsClient = createMockDataStreamStatsClient();

      const machine = createDatasetQualityControllerStateMachine({
        initialContext: DEFAULT_CONTEXT,
        toasts: createMockToasts(),
        dataStreamStatsClient,
        isDatasetQualityAllSignalsAvailable: false,
      });

      const actor = createActor(machine);
      actor.start();

      await waitForState(actor, 'main.stats.datasets.loaded');

      const statsCall = dataStreamStatsClient.getDataStreamsStats.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(statsCall?.types).toEqual(['logs']);

      actor.stop();
    });

    it('should query all authorized types when all signals flag is true and no types filter', async () => {
      const dataStreamStatsClient = createMockDataStreamStatsClient();

      const machine = createDatasetQualityControllerStateMachine({
        initialContext: {
          ...DEFAULT_CONTEXT,
          filters: {
            ...DEFAULT_CONTEXT.filters,
            types: [], // empty means use all authorized types
          },
        },
        toasts: createMockToasts(),
        dataStreamStatsClient,
        isDatasetQualityAllSignalsAvailable: true,
      });

      const actor = createActor(machine);
      actor.start();

      await waitForState(actor, 'main.stats.datasets.loaded');

      const statsCall = dataStreamStatsClient.getDataStreamsStats.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(statsCall?.types).toEqual(
        expect.arrayContaining(['logs', 'metrics', 'traces', 'synthetics'])
      );

      actor.stop();
    });
  });
});
