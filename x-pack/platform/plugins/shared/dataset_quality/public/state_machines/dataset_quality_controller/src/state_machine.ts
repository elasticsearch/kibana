/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IToasts } from '@kbn/core/public';
import { getDateISORange } from '@kbn/timerange';
import { getPlaceholderFor } from '@kbn/xstate-utils';
import type { ActorRefFrom } from 'xstate';
import { assign, fromCallback, fromPromise, setup } from 'xstate';
import type {
  DatasetTypesPrivileges,
  DataStreamDocsStat,
  DataStreamStat,
  NonAggregatableDatasets,
} from '../../../../common/api_types';
import { DEFAULT_DATASET_TYPE, KNOWN_TYPES } from '../../../../common/constants';
import type {
  DataStreamStatServiceResponse,
  GetDataStreamsTypesPrivilegesResponse,
} from '../../../../common/data_streams_stats';
import type { Integration } from '../../../../common/data_streams_stats/integration';
import type { DataStreamType } from '../../../../common/types';
import type { IDataStreamsStatsClient } from '../../../services/data_streams_stats';
import { generateDatasets } from '../../../utils';
import { fetchNonAggregatableDatasetsFailedNotifier } from '../../common/notifications';
import { DEFAULT_CONTEXT } from './defaults';
import {
  fetchDatasetStatsFailedNotifier,
  fetchDatasetTypesPrivilegesFailedNotifier,
  fetchDegradedStatsFailedNotifier,
  fetchFailedStatsFailedNotifier,
  fetchIntegrationsFailedNotifier,
  fetchTotalDocsFailedNotifier,
  updateFailureStoreFailedNotifier,
  updateFailureStoreSuccessNotifier,
} from './notifications';
import type { DatasetQualityControllerContext, DatasetQualityControllerEvent } from './types';

const createPureDatasetQualityControllerStateMachine = (
  initialContext: DatasetQualityControllerContext
) =>
  setup({
    types: {
      context: {} as DatasetQualityControllerContext,
      events: {} as DatasetQualityControllerEvent,
    },
    actions: {
      storeTableOptions: assign(({ event }) => {
        return 'dataset_criteria' in event
          ? {
              table: event.dataset_criteria,
            }
          : {};
      }),
      resetPage: assign(({ context }) => ({
        table: {
          ...context.table,
          page: 0,
        },
      })),
      storeInactiveDatasetsVisibility: assign(({ context }) => {
        return {
          filters: {
            ...context.filters,
            inactive: !context.filters.inactive,
          },
        };
      }),
      storeFullDatasetNamesVisibility: assign(({ context }) => {
        return {
          filters: {
            ...context.filters,
            fullNames: !context.filters.fullNames,
          },
        };
      }),
      storeTimeRange: assign(({ context, event }) => {
        return 'timeRange' in event
          ? {
              filters: {
                ...context.filters,
                timeRange: event.timeRange,
              },
            }
          : {};
      }),
      storeIntegrationsFilter: assign(({ context, event }) => {
        return 'integrations' in event
          ? {
              filters: {
                ...context.filters,
                integrations: event.integrations,
              },
            }
          : {};
      }),
      storeNamespaces: assign(({ context, event }) => {
        return 'namespaces' in event
          ? {
              filters: {
                ...context.filters,
                namespaces: event.namespaces,
              },
            }
          : {};
      }),
      storeQualities: assign(({ context, event }) => {
        return 'qualities' in event
          ? {
              filters: {
                ...context.filters,
                qualities: event.qualities,
              },
            }
          : {};
      }),
      storeTypes: assign(({ context, event }) => {
        return 'types' in event
          ? {
              filters: {
                ...context.filters,
                types: event.types,
              },
            }
          : {};
      }),
      storeQuery: assign(({ context, event }) => {
        return 'query' in event
          ? {
              filters: {
                ...context.filters,
                query: event.query,
              },
            }
          : {};
      }),
      storeDatasets: assign(({ context }) => {
        return context.integrations
          ? {
              datasets: generateDatasets(
                context.dataStreamStats,
                context.degradedDocStats,
                context.failedDocStats,
                context.integrations,
                context.totalDocsStats
              ),
            }
          : {};
      }),
      storeEmptyIntegrations: assign(() => {
        return {
          integrations: [],
        };
      }),
      // Placeholder actions that get overridden in provide()
      storeAuthorizedDatasetTypes: assign(() => ({})),
      storeDataStreamStats: assign(() => ({})),
      storeTotalDocStats: assign(() => ({})),
      storeDegradedDocStats: assign(() => ({})),
      storeFailedDocStats: assign(() => ({})),
      storeNonAggregatableDatasets: assign(() => ({})),
      storeIntegrations: assign(() => ({})),
      resetLoadedTotalDocsTypes: assign(() => ({ loadedTotalDocsTypes: [] })),
      notifyFetchDatasetTypesPrivilegesFailed: () => {},
      notifyFetchDatasetStatsFailed: () => {},
      notifyFetchDegradedStatsFailed: () => {},
      notifyFetchNonAggregatableDatasetsFailed: () => {},
      notifyFetchIntegrationsFailed: () => {},
      notifyFetchTotalDocsFailed: () => {},
      notifyFetchFailedStatsFailed: () => {},
      notifyUpdateFailureStoreSuccess: () => {},
      notifyUpdateFailureStoreFailed: () => {},
    },
    actors: {
      loadDatasetTypesPrivileges: getPlaceholderFor(createLoadDatasetTypesPrivilegesActor),
      loadDataStreamStats: getPlaceholderFor(createLoadDataStreamStatsActor),
      loadDataStreamDocsStats: getPlaceholderFor(createLoadDataStreamDocsStatsActor),
      loadDegradedDocs: getPlaceholderFor(createLoadDegradedDocsActor),
      loadFailedDocs: getPlaceholderFor(createLoadFailedDocsActor),
      loadNonAggregatableDatasets: getPlaceholderFor(createLoadNonAggregatableDatasetsActor),
      loadIntegrations: getPlaceholderFor(createLoadIntegrationsActor),
      updateFailureStore: getPlaceholderFor(createUpdateFailureStoreActor),
    },
    guards: {
      checkIfActionForbidden: ({ event }) => {
        if (!('error' in event) || typeof event.error !== 'object' || event.error === null) {
          return false;
        }

        return (event.error as { statusCode?: number }).statusCode === 403;
      },
      checkIfNotImplemented: ({ event }) => {
        if (!('error' in event) || typeof event.error !== 'object' || event.error === null) {
          return false;
        }

        return (event.error as { statusCode?: number }).statusCode === 501;
      },
      allTotalDocsTypesLoaded: ({ context, event }) => {
        if (!('dataStreamType' in event)) return false;

        const loadedTypes = [...context.loadedTotalDocsTypes, event.dataStreamType];

        return KNOWN_TYPES.every((type) => loadedTypes.includes(type));
      },
    },
  }).createMachine({
    context: initialContext,
    id: 'DatasetQualityController',
    initial: 'initializing',
    states: {
      initializing: {
        invoke: {
          src: 'loadDatasetTypesPrivileges',
          onDone: {
            target: 'main',
            actions: ['storeAuthorizedDatasetTypes'],
          },
          onError: {
            target: 'initializationFailed',
            actions: ['notifyFetchDatasetTypesPrivilegesFailed'],
          },
        },
      },
      initializationFailed: {},
      main: {
        type: 'parallel',
        states: {
          stats: {
            type: 'parallel',
            states: {
              datasets: {
                initial: 'fetching',
                states: {
                  fetching: {
                    invoke: {
                      src: 'loadDataStreamStats',
                      input: ({ context }) => context,
                      onDone: {
                        target: 'loaded',
                        actions: ['storeDataStreamStats', 'storeDatasets'],
                      },
                      onError: {
                        target: 'loaded',
                        actions: ['notifyFetchDatasetStatsFailed'],
                      },
                    },
                  },
                  loaded: {},
                },
                on: {
                  UPDATE_TIME_RANGE: {
                    target: '.fetching',
                    actions: ['storeTimeRange'],
                  },
                  REFRESH_DATA: {
                    target: '.fetching',
                  },
                },
              },
              degradedDocs: {
                initial: 'fetching',
                states: {
                  fetching: {
                    invoke: {
                      src: 'loadDegradedDocs',
                      input: ({ context }) => context,
                      onDone: {
                        target: 'loaded',
                        actions: ['storeDegradedDocStats', 'storeDatasets'],
                      },
                      onError: [
                        {
                          target: 'unauthorized',
                          guard: 'checkIfActionForbidden',
                        },
                        {
                          target: 'loaded',
                          actions: ['notifyFetchDegradedStatsFailed'],
                        },
                      ],
                    },
                  },
                  loaded: {},
                  unauthorized: { type: 'final' },
                },
                on: {
                  UPDATE_TIME_RANGE: {
                    target: '.fetching',
                    actions: ['storeTimeRange'],
                  },
                  REFRESH_DATA: {
                    target: '.fetching',
                  },
                },
              },
              failedDocs: {
                initial: 'fetching',
                states: {
                  fetching: {
                    invoke: {
                      src: 'loadFailedDocs',
                      input: ({ context }) => context,
                      onDone: {
                        target: 'loaded',
                        actions: ['storeFailedDocStats', 'storeDatasets'],
                      },
                      onError: [
                        {
                          target: 'notImplemented',
                          guard: 'checkIfNotImplemented',
                        },
                        {
                          target: 'unauthorized',
                          guard: 'checkIfActionForbidden',
                        },
                        {
                          target: 'loaded',
                          actions: ['notifyFetchFailedStatsFailed'],
                        },
                      ],
                    },
                  },
                  loaded: {},
                  notImplemented: {},
                  unauthorized: { type: 'final' },
                },
                on: {
                  UPDATE_TIME_RANGE: {
                    target: '.fetching',
                    actions: ['storeTimeRange'],
                  },
                  REFRESH_DATA: {
                    target: '.fetching',
                  },
                },
              },
              docsStats: {
                initial: 'fetching',
                states: {
                  fetching: {
                    entry: ['resetLoadedTotalDocsTypes'],
                    ...generateInvokePerType(),
                  },
                  loaded: {},
                  unauthorized: { type: 'final' },
                },
                on: {
                  SAVE_TOTAL_DOCS_STATS: [
                    {
                      target: '.loaded',
                      actions: ['storeTotalDocStats', 'storeDatasets'],
                      guard: 'allTotalDocsTypesLoaded',
                    },
                    {
                      actions: ['storeTotalDocStats', 'storeDatasets'],
                    },
                  ],
                  NOTIFY_TOTAL_DOCS_STATS_FAILED: [
                    {
                      target: '.unauthorized',
                      guard: 'checkIfActionForbidden',
                    },
                    {
                      target: '.loaded',
                      actions: ['notifyFetchTotalDocsFailed'],
                    },
                  ],
                  UPDATE_TIME_RANGE: {
                    target: '.fetching',
                    actions: ['storeTimeRange'],
                  },
                  REFRESH_DATA: {
                    target: '.fetching',
                  },
                },
              },
              nonAggregatableDatasets: {
                initial: 'fetching',
                states: {
                  fetching: {
                    invoke: {
                      src: 'loadNonAggregatableDatasets',
                      input: ({ context }) => context,
                      onDone: {
                        target: 'loaded',
                        actions: ['storeNonAggregatableDatasets'],
                      },
                      onError: [
                        {
                          target: 'unauthorized',
                          guard: 'checkIfActionForbidden',
                        },
                        {
                          target: 'loaded',
                          actions: ['notifyFetchNonAggregatableDatasetsFailed'],
                        },
                      ],
                    },
                  },
                  loaded: {},
                  unauthorized: { type: 'final' },
                },
                on: {
                  UPDATE_TIME_RANGE: {
                    target: '.fetching',
                  },
                  REFRESH_DATA: {
                    target: '.fetching',
                  },
                },
              },
            },
          },
          integrations: {
            initial: 'fetching',
            states: {
              fetching: {
                invoke: {
                  src: 'loadIntegrations',
                  onDone: {
                    target: 'loaded',
                    actions: ['storeIntegrations', 'storeDatasets'],
                  },
                  onError: {
                    target: 'loaded',
                    actions: [
                      'notifyFetchIntegrationsFailed',
                      'storeEmptyIntegrations',
                      'storeDatasets',
                    ],
                  },
                },
              },
              loaded: {
                on: {
                  UPDATE_TABLE_CRITERIA: {
                    target: 'loaded',
                    actions: ['storeTableOptions'],
                  },
                  TOGGLE_INACTIVE_DATASETS: {
                    target: 'loaded',
                    actions: ['storeInactiveDatasetsVisibility', 'resetPage'],
                  },
                  TOGGLE_FULL_DATASET_NAMES: {
                    target: 'loaded',
                    actions: ['storeFullDatasetNamesVisibility'],
                  },
                },
              },
            },
            on: {
              UPDATE_TIME_RANGE: {
                target: '.fetching',
                actions: ['storeTimeRange'],
              },
              REFRESH_DATA: {
                target: '.fetching',
              },
              UPDATE_INTEGRATIONS: {
                target: '.loaded',
                actions: ['storeIntegrationsFilter'],
              },
              UPDATE_NAMESPACES: {
                target: '.loaded',
                actions: ['storeNamespaces'],
              },
              UPDATE_QUALITIES: {
                target: '.loaded',
                actions: ['storeQualities'],
              },
              UPDATE_TYPES: {
                target: '#DatasetQualityController.main.stats',
                actions: ['storeTypes'],
              },
              UPDATE_QUERY: {
                actions: ['storeQuery'],
              },
            },
          },
          failureStoreUpdate: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  UPDATE_FAILURE_STORE: {
                    target: 'updating',
                  },
                },
              },
              updating: {
                invoke: {
                  src: 'updateFailureStore',
                  input: ({ context, event }) => ({ context, event }),
                  onDone: {
                    target: '#DatasetQualityController.main.stats.datasets.fetching',
                    actions: ['notifyUpdateFailureStoreSuccess'],
                  },
                  onError: {
                    target: 'idle',
                    actions: ['notifyUpdateFailureStoreFailed'],
                  },
                },
              },
            },
          },
        },
      },
    },
  });

export interface DatasetQualityControllerStateMachineDependencies {
  initialContext?: DatasetQualityControllerContext;
  toasts: IToasts;
  dataStreamStatsClient: IDataStreamsStatsClient;
  isDatasetQualityAllSignalsAvailable: boolean;
}

export const createDatasetQualityControllerStateMachine = ({
  initialContext = DEFAULT_CONTEXT,
  toasts,
  dataStreamStatsClient,
  isDatasetQualityAllSignalsAvailable,
}: DatasetQualityControllerStateMachineDependencies) => {
  const actorDeps: ActorDeps = { dataStreamStatsClient, isDatasetQualityAllSignalsAvailable };

  return createPureDatasetQualityControllerStateMachine(initialContext).provide({
    actions: {
      storeAuthorizedDatasetTypes: assign(({ context, event }) => {
        if (!('output' in event)) return {};

        const output = event.output as GetDataStreamsTypesPrivilegesResponse;

        // `authorizedDatasetTypes` only drives the types filter UI, so it reflects the
        // wildcard privilege check (a type whose `${type}-*-*` check passes). Roles built
        // with ES negated/complement patterns fail the wildcard check for the negated type
        // even though individual data streams of that type are readable; those streams are
        // still discovered because stats are queried for all known types (see
        // `getValidDatasetTypes`), so the page lists them regardless of this list.
        const authorizedDatasetTypes = extractAuthorizedDatasetTypes(output.datasetTypesPrivileges);

        const filterTypes = context.filters.types as DataStreamType[];

        const validTypes = filterTypes.filter(
          (type) => authorizedDatasetTypes.includes(type) && KNOWN_TYPES.includes(type)
        );

        return {
          filters: {
            ...context.filters,
            types: validTypes,
          },
          authorizedDatasetTypes,
        };
      }),

      storeDataStreamStats: assign(({ event }) => {
        if (!('output' in event)) return {};

        const output = event.output as DataStreamStatServiceResponse;

        return {
          dataStreamStats: output.dataStreamsStats as DataStreamStat[],
          datasetUserPrivileges: output.datasetUserPrivileges,
        };
      }),

      storeTotalDocStats: assign(({ context, event }) => {
        if (!('data' in event) || !('dataStreamType' in event)) {
          return {};
        }

        return {
          totalDocsStats: {
            ...context.totalDocsStats,
            [event.dataStreamType]: event.data,
          },
          loadedTotalDocsTypes: context.loadedTotalDocsTypes.includes(event.dataStreamType)
            ? context.loadedTotalDocsTypes
            : [...context.loadedTotalDocsTypes, event.dataStreamType],
        };
      }),

      storeDegradedDocStats: assign(({ event }) => {
        if (!('output' in event)) {
          return {};
        }

        return { degradedDocStats: event.output as DataStreamDocsStat[] };
      }),

      storeFailedDocStats: assign(({ event }) => {
        if (!('output' in event)) {
          return {};
        }

        return { failedDocStats: event.output as DataStreamDocsStat[] };
      }),

      storeNonAggregatableDatasets: assign(({ event }) => {
        if (!('output' in event)) {
          return {};
        }

        const output = event.output as NonAggregatableDatasets;

        return { nonAggregatableDatasets: output.datasets };
      }),

      storeIntegrations: assign(({ event }) => {
        if (!('output' in event)) {
          return {};
        }

        return { integrations: event.output as Integration[] };
      }),

      notifyFetchDatasetTypesPrivilegesFailed: ({ event }) => {
        if ('error' in event) {
          fetchDatasetTypesPrivilegesFailedNotifier(toasts, event.error as Error);
        }
      },

      notifyFetchDatasetStatsFailed: ({ event }) => {
        if ('error' in event) {
          fetchDatasetStatsFailedNotifier(toasts, event.error as Error);
        }
      },

      notifyFetchDegradedStatsFailed: ({ event }) => {
        if ('error' in event) {
          fetchDegradedStatsFailedNotifier(toasts, event.error as Error);
        }
      },

      notifyFetchNonAggregatableDatasetsFailed: ({ event }) => {
        if ('error' in event) {
          fetchNonAggregatableDatasetsFailedNotifier(toasts, event.error as Error);
        }
      },

      notifyFetchIntegrationsFailed: ({ event }) => {
        if ('error' in event) {
          fetchIntegrationsFailedNotifier(toasts, event.error as Error);
        }
      },

      notifyFetchFailedStatsFailed: ({ event }) => {
        if ('error' in event) {
          fetchFailedStatsFailedNotifier(toasts, event.error as Error);
        }
      },

      notifyFetchTotalDocsFailed: ({ event }) => {
        if ('error' in event) {
          fetchTotalDocsFailedNotifier(toasts, event.error as Error, {});
        }
      },
      notifyUpdateFailureStoreSuccess: () => updateFailureStoreSuccessNotifier(toasts),

      notifyUpdateFailureStoreFailed: ({ event }) => {
        if ('error' in event) {
          updateFailureStoreFailedNotifier(toasts, event.error as Error);
        }
      },
    },
    actors: {
      loadDatasetTypesPrivileges: createLoadDatasetTypesPrivilegesActor(actorDeps),
      loadDataStreamStats: createLoadDataStreamStatsActor(actorDeps),
      loadDataStreamDocsStats: createLoadDataStreamDocsStatsActor(actorDeps),
      loadDegradedDocs: createLoadDegradedDocsActor(actorDeps),
      loadFailedDocs: createLoadFailedDocsActor(actorDeps),
      loadNonAggregatableDatasets: createLoadNonAggregatableDatasetsActor(actorDeps),
      loadIntegrations: createLoadIntegrationsActor(actorDeps),
      updateFailureStore: createUpdateFailureStoreActor(actorDeps),
    },
  });
};

export type DatasetQualityControllerStateService = ActorRefFrom<
  ReturnType<typeof createDatasetQualityControllerStateMachine>
>;

// When no explicit type filter is set we query all known types rather than only the
// wildcard-authorized ones. This ensures data streams of a type whose `${type}-*-*`
// privilege check fails (ES negated/complement roles) are still discovered; the server
// enforces per-data-stream authorization and returns only the accessible ones.
const getValidDatasetTypes = (
  context: DatasetQualityControllerContext,
  isDatasetQualityAllSignalsAvailable: boolean
) =>
  (isDatasetQualityAllSignalsAvailable
    ? context.filters.types.length
      ? context.filters.types
      : KNOWN_TYPES
    : [DEFAULT_DATASET_TYPE]) as DataStreamType[];

const isTypeSelected = (type: DataStreamType, context: DatasetQualityControllerContext) =>
  (context.filters.types.length === 0 && KNOWN_TYPES.includes(type)) ||
  context.filters.types.includes(type);

const extractAuthorizedDatasetTypes = (datasetTypesPrivileges: DatasetTypesPrivileges) =>
  Object.entries(datasetTypesPrivileges)
    .filter(([_type, priv]) => priv.canMonitor || priv.canRead)
    .map(([type, _priv]) => type.replace(/-\*-\*$/, '')) as DataStreamType[];

interface ActorDeps {
  dataStreamStatsClient: IDataStreamsStatsClient;
  isDatasetQualityAllSignalsAvailable: boolean;
}

const createLoadDatasetTypesPrivilegesActor = ({ dataStreamStatsClient }: ActorDeps) =>
  fromPromise(async () =>
    dataStreamStatsClient.getDataStreamsTypesPrivileges({
      types: KNOWN_TYPES,
    })
  );

const createLoadDataStreamStatsActor = ({
  dataStreamStatsClient,
  isDatasetQualityAllSignalsAvailable,
}: ActorDeps) =>
  fromPromise(async ({ input }: { input: DatasetQualityControllerContext }) =>
    dataStreamStatsClient.getDataStreamsStats({
      types: getValidDatasetTypes(input, isDatasetQualityAllSignalsAvailable),
    })
  );

const createLoadDataStreamDocsStatsActor = ({ dataStreamStatsClient }: ActorDeps) =>
  fromCallback<
    DatasetQualityControllerEvent,
    { context: DatasetQualityControllerContext; type: DataStreamType }
  >(({ sendBack, input }) => {
    const { context, type } = input;

    const fetchDocs = async () => {
      try {
        const { startDate: start, endDate: end } = getDateISORange(context.filters.timeRange);

        const totalDocsStats = await (isTypeSelected(type, context)
          ? dataStreamStatsClient.getDataStreamsTotalDocs({ type, start, end })
          : Promise.resolve([]));

        sendBack({ type: 'SAVE_TOTAL_DOCS_STATS', data: totalDocsStats, dataStreamType: type });
      } catch (e) {
        const error = e as Error & { statusCode?: number };
        if (error.statusCode === 403) {
          // The user has no access to this type (e.g. a logs-only user requesting metrics).
          // Treat as an empty result so the page remains functional for accessible types.
          sendBack({ type: 'SAVE_TOTAL_DOCS_STATS', data: [], dataStreamType: type });
        } else {
          sendBack({ type: 'NOTIFY_TOTAL_DOCS_STATS_FAILED', error });
        }
      }
    };
    fetchDocs();
  });

const createLoadDegradedDocsActor = ({
  dataStreamStatsClient,
  isDatasetQualityAllSignalsAvailable,
}: ActorDeps) =>
  fromPromise(async ({ input }: { input: DatasetQualityControllerContext }) => {
    const { startDate: start, endDate: end } = getDateISORange(input.filters.timeRange);

    return dataStreamStatsClient.getDataStreamsDegradedStats({
      types: getValidDatasetTypes(input, isDatasetQualityAllSignalsAvailable),
      start,
      end,
    });
  });

const createLoadFailedDocsActor = ({
  dataStreamStatsClient,
  isDatasetQualityAllSignalsAvailable,
}: ActorDeps) =>
  fromPromise(async ({ input }: { input: DatasetQualityControllerContext }) => {
    const { startDate: start, endDate: end } = getDateISORange(input.filters.timeRange);

    return dataStreamStatsClient.getDataStreamsFailedStats({
      types: getValidDatasetTypes(input, isDatasetQualityAllSignalsAvailable),
      start,
      end,
    });
  });

const createLoadNonAggregatableDatasetsActor = ({
  dataStreamStatsClient,
  isDatasetQualityAllSignalsAvailable,
}: ActorDeps) =>
  fromPromise(async ({ input }: { input: DatasetQualityControllerContext }) => {
    const { startDate: start, endDate: end } = getDateISORange(input.filters.timeRange);

    return dataStreamStatsClient.getNonAggregatableDatasets({
      types: getValidDatasetTypes(input, isDatasetQualityAllSignalsAvailable),
      start,
      end,
    });
  });

const createLoadIntegrationsActor = ({ dataStreamStatsClient }: ActorDeps) =>
  fromPromise(async () => dataStreamStatsClient.getIntegrations());

const createUpdateFailureStoreActor = ({ dataStreamStatsClient }: ActorDeps) =>
  fromPromise(
    async ({
      input,
    }: {
      input: { context: DatasetQualityControllerContext; event: DatasetQualityControllerEvent };
    }): Promise<void> => {
      const { event } = input;

      if (
        'dataStream' in event &&
        event.dataStream &&
        event.dataStream.hasFailureStore !== undefined
      ) {
        await dataStreamStatsClient.updateFailureStore({
          dataStream: event.dataStream.rawName,
          failureStoreEnabled: event.dataStream.hasFailureStore,
          customRetentionPeriod: event.dataStream.customRetentionPeriod,
        });
      }
    }
  );

const generateInvokePerType = () => ({
  invoke: KNOWN_TYPES.map((type) => ({
    id: `${type}`,
    src: 'loadDataStreamDocsStats' as const,
    input: ({ context }: { context: DatasetQualityControllerContext }) => ({ context, type }),
  })),
});
