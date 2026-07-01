/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { toBooleanRt } from '@kbn/io-ts-utils';
import type {
  CheckAndLoadIntegrationResponse,
  DataStreamDetails,
  DataStreamDocsStat,
  DataStreamRolloverResponse,
  DataStreamSettings,
  DataStreamStat,
  DatasetTypesPrivileges,
  DatasetUserPrivileges,
  DegradedFieldAnalysis,
  DegradedFieldResponse,
  DegradedFieldValues,
  NonAggregatableDatasets,
  UpdateFailureStoreResponse,
  UpdateFieldLimitResponse,
} from '../../../common/api_types';
import { datasetQualityPrivileges, dataStreamService } from '../../services';
import { rangeRt, typeRt, typesRt } from '../../types/default_api_types';
import { createDatasetQualityESClient } from '../../utils';
import { createDatasetQualityServerRoute } from '../create_datasets_quality_server_route';
import { checkAndLoadIntegration } from './check_and_load_integration';
import { failedDocsRouteRepository } from './failed_docs/routes';
import { getDataStreamDetails } from './get_data_stream_details';
import { getDataStreams, getDatasetTypesPrivileges } from './get_data_streams';
import { getDataStreamsMeteringStats } from './get_data_streams_metering_stats';
import { getDataStreamsStats } from './get_data_streams_stats';
import { getAggregatedDatasetPaginatedResults } from './get_dataset_aggregated_paginated_results';
import { getDataStreamSettings } from './get_datastream_settings';
import { getDegradedDocsPaginated } from './get_degraded_docs';
import { analyzeDegradedField } from './get_degraded_field_analysis';
import { getDegradedFieldValues } from './get_degraded_field_values';
import { getDegradedFields } from './get_degraded_fields';
import { getNonAggregatableDataStreams } from './get_non_aggregatable_data_streams';
import { updateFieldLimit } from './update_field_limit';
import { getDataStreamsCreationDate } from './get_data_streams_creation_date';
import { updateFailureStore } from './update_failure_store';
import { getDataStreamDefaultRetentionPeriod } from './get_data_streams_default_retention_period';

const datasetTypesPrivilegesRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/types_privileges',
  params: t.type({
    query: t.type({ types: typesRt }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<{
    datasetTypesPrivileges: DatasetTypesPrivileges;
  }> {
    const { context, params, getIsSecurityEnabled } = resources;
    const coreContext = await context.core;
    const isSecurityEnabled = await getIsSecurityEnabled();

    // Query datastreams as the current user as the Kibana internal user may not have all the required permissions
    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    const { datasetsPrivilages } = await getDatasetTypesPrivileges({
      esClient,
      ...params.query,
      isSecurityEnabled,
    });

    return {
      datasetTypesPrivileges: datasetsPrivilages,
    };
  },
});

const statsRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/stats',
  params: t.type({
    // Each branch declares both keys so strict excess-key validation accepts
    // requests that carry `types` and `datasetQuery` together.
    query: t.intersection([
      t.union([
        t.intersection([t.type({ types: typesRt }), t.partial({ datasetQuery: t.string })]),
        t.intersection([t.type({ datasetQuery: t.string }), t.partial({ types: typesRt })]),
      ]),
      t.partial({ includeCreationDate: toBooleanRt }),
    ]),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<{
    datasetUserPrivileges: DatasetUserPrivileges;
    dataStreamsStats: DataStreamStat[];
  }> {
    const { context, params, getEsCapabilities, getIsSecurityEnabled } = resources;
    const coreContext = await context.core;
    const [isServerless, isSecurityEnabled] = await Promise.all([
      getEsCapabilities().then((c) => c.serverless),
      getIsSecurityEnabled(),
    ]);

    // Query datastreams as the current user as the Kibana internal user may not have all the required permissions
    const esClient = coreContext.elasticsearch.client.asCurrentUser;
    const esClientAsSecondaryAuthUser = isSecurityEnabled
      ? coreContext.elasticsearch.client.asSecondaryAuthUser
      : esClient;

    const { dataStreams, datasetUserPrivileges } = await getDataStreams({
      esClient,
      ...params.query,
      uncategorisedOnly: false,
      isSecurityEnabled,
    });

    const privilegedDataStreams = dataStreams.filter((dataStream) => {
      return dataStream.userPrivileges.canMonitor;
    });

    const dataStreamsNames = privilegedDataStreams.map((stream) => stream.name);
    const [dataStreamsStats, dataStreamsCreationDate] = await Promise.all([
      isServerless
        ? getDataStreamsMeteringStats({
            esClient: esClientAsSecondaryAuthUser,
            dataStreams: dataStreamsNames,
          })
        : getDataStreamsStats({
            esClient,
            dataStreams: dataStreamsNames,
          }),

      params.query.includeCreationDate
        ? getDataStreamsCreationDate({
            esClient: esClientAsSecondaryAuthUser,
            dataStreams: dataStreamsNames,
          })
        : ({} as Record<string, number | undefined>),
    ]);

    const clusterDefaultRetentionPeriod = isServerless
      ? undefined
      : await getDataStreamDefaultRetentionPeriod({
          esClient,
        });
    return {
      datasetUserPrivileges,
      dataStreamsStats: dataStreams.map((dataStream: DataStreamStat) => {
        dataStream.size = dataStreamsStats[dataStream.name]?.size;
        dataStream.sizeBytes = dataStreamsStats[dataStream.name]?.sizeBytes;
        dataStream.totalDocs = dataStreamsStats[dataStream.name]?.totalDocs;
        dataStream.creationDate = dataStreamsCreationDate[dataStream.name];
        dataStream.defaultRetentionPeriod =
          dataStream.defaultRetentionPeriod || clusterDefaultRetentionPeriod;

        return dataStream;
      }),
    };
  },
});

const degradedDocsRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/degraded_docs',
  params: t.type({
    query: t.intersection([
      rangeRt,
      t.type({ types: typesRt }),
      t.partial({
        datasetQuery: t.string,
      }),
    ]),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<{
    degradedDocs: DataStreamDocsStat[];
  }> {
    const { context, params } = resources;
    const coreContext = await context.core;

    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    const degradedDocs = await getDegradedDocsPaginated({
      esClient,
      ...params.query,
    });

    return {
      degradedDocs,
    };
  },
});

const totalDocsRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/total_docs',
  params: t.type({
    query: t.intersection([rangeRt, typeRt]),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<{
    totalDocs: DataStreamDocsStat[];
  }> {
    const { context, params, getIsSecurityEnabled } = resources;
    const coreContext = await context.core;
    const isSecurityEnabled = await getIsSecurityEnabled();

    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    const { type, start, end } = params.query;
    const indexPattern = `${type}-*-*`;

    // Authorization is enforced per data stream by Elasticsearch. The wildcard
    // `_has_privileges` read check (e.g. `logs-*-*`) returns `false` for roles built
    // with negated/complement index patterns, even when individual data streams of
    // that type are readable. We therefore resolve the data streams the user can
    // actually access; only when none are accessible AND the wildcard read privilege
    // is denied do we treat the user as unauthorized. Otherwise the aggregation runs
    // and Elasticsearch returns counts for just the accessible data streams.
    const accessibleDataStreams = await dataStreamService.getMatchingDataStreams(
      esClient,
      indexPattern
    );

    if (accessibleDataStreams.length === 0) {
      await datasetQualityPrivileges.throwIfCannotReadDataset(esClient, isSecurityEnabled, type);

      return {
        totalDocs: [],
      };
    }

    // Use the wildcard; ES enforces per-stream auth and only counts accessible docs.
    const totalDocs = await getAggregatedDatasetPaginatedResults({
      esClient,
      start,
      end,
      index: indexPattern,
    });

    return {
      totalDocs,
    };
  },
});

const nonAggregatableDatasetsRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/non_aggregatable',
  params: t.type({
    query: t.intersection([
      rangeRt,
      t.type({ types: typesRt }),
      t.partial({
        dataStream: t.string,
      }),
    ]),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<NonAggregatableDatasets> {
    const { context, params } = resources;
    const coreContext = await context.core;

    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    return await getNonAggregatableDataStreams({
      esClient,
      ...params.query,
    });
  },
});

const nonAggregatableDatasetRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/{dataStream}/non_aggregatable',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
    query: rangeRt,
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<NonAggregatableDatasets> {
    const { context, params } = resources;
    const coreContext = await context.core;

    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    return await getNonAggregatableDataStreams({
      esClient,
      dataStream: params.path.dataStream,
      ...params.query,
    });
  },
});

const degradedFieldsRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/{dataStream}/degraded_fields',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
    query: rangeRt,
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<DegradedFieldResponse> {
    const { context, params } = resources;
    const { dataStream } = params.path;
    const coreContext = await context.core;

    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    try {
      return await getDegradedFields({
        esClient,
        dataStream,
        ...params.query,
      });
    } catch (e) {
      if (e.body?.error?.type === 'index_closed_exception') {
        return {
          degradedFields: [],
        };
      }

      throw e;
    }
  },
});

const degradedFieldValuesRoute = createDatasetQualityServerRoute({
  endpoint:
    'GET /internal/dataset_quality/data_streams/{dataStream}/degraded_field/{degradedField}/values',
  params: t.type({
    path: t.type({
      dataStream: t.string,
      degradedField: t.string,
    }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<DegradedFieldValues> {
    const { context, params } = resources;
    const { dataStream, degradedField } = params.path;
    const coreContext = await context.core;

    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    return await getDegradedFieldValues({
      esClient,
      dataStream,
      degradedField,
    });
  },
});

const dataStreamSettingsRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/{dataStream}/settings',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<DataStreamSettings> {
    const { context, params, getIsSecurityEnabled } = resources;
    const { dataStream } = params.path;
    const coreContext = await context.core;
    const isSecurityEnabled = await getIsSecurityEnabled();

    // Query datastreams as the current user as the Kibana internal user may not have all the required permissions
    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    const dataStreamSettings = await getDataStreamSettings({
      esClient,
      dataStream,
      isSecurityEnabled,
    });

    return dataStreamSettings;
  },
});

const checkAndLoadIntegrationRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/{dataStream}/integration/check',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<CheckAndLoadIntegrationResponse> {
    const { context, params, plugins, logger, request } = resources;
    const { dataStream } = params.path;
    const coreContext = await context.core;

    // Query dataStreams as the current user as the Kibana internal user may not have all the required permissions
    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    const fleetPluginStart = await plugins.fleet.start();
    const packageClient = fleetPluginStart.packageService.asScoped(request);

    const integration = await checkAndLoadIntegration({
      esClient,
      packageClient,
      logger,
      dataStream,
    });

    return integration;
  },
});

const dataStreamDetailsRoute = createDatasetQualityServerRoute({
  endpoint: 'GET /internal/dataset_quality/data_streams/{dataStream}/details',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
    query: rangeRt,
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<DataStreamDetails> {
    const { context, params, getEsCapabilities, getIsSecurityEnabled } = resources;
    const { dataStream } = params.path;
    const { start, end } = params.query;
    const coreContext = await context.core;

    const esClient = coreContext.elasticsearch.client;

    const [isServerless, isSecurityEnabled] = await Promise.all([
      getEsCapabilities().then((c) => c.serverless),
      getIsSecurityEnabled(),
    ]);

    const dataStreamDetails = await getDataStreamDetails({
      esClient,
      dataStream,
      start,
      end,
      isServerless,
      isSecurityEnabled,
    });

    // If dataStreamDetails is empty, return empty object, otherwise append defaultRetentionPeriod
    if (!dataStreamDetails || Object.keys(dataStreamDetails).length === 0) {
      return {} as DataStreamDetails;
    }
    const details = { ...dataStreamDetails, isServerless };

    if (!isServerless && details.defaultRetentionPeriod === undefined) {
      details.defaultRetentionPeriod = await getDataStreamDefaultRetentionPeriod({
        esClient: esClient.asCurrentUser,
      });
    }

    return details;
  },
});

const analyzeDegradedFieldRoute = createDatasetQualityServerRoute({
  endpoint:
    'GET /internal/dataset_quality/data_streams/{dataStream}/degraded_field/{degradedField}/analyze',
  params: t.type({
    path: t.type({
      dataStream: t.string,
      degradedField: t.string,
    }),
    query: t.type({
      lastBackingIndex: t.string,
    }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<DegradedFieldAnalysis> {
    const { context, params } = resources;
    const coreContext = await context.core;
    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    const degradedFieldAnalysis = await analyzeDegradedField({
      esClient,
      dataStream: params.path.dataStream,
      degradedField: params.path.degradedField,
      lastBackingIndex: params.query.lastBackingIndex,
    });

    return degradedFieldAnalysis;
  },
});

const updateFieldLimitRoute = createDatasetQualityServerRoute({
  endpoint: 'PUT /internal/dataset_quality/data_streams/{dataStream}/update_field_limit',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
    body: t.type({
      newFieldLimit: t.number,
    }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<UpdateFieldLimitResponse> {
    const { context, params, getIsSecurityEnabled } = resources;
    const coreContext = await context.core;
    const isSecurityEnabled = await getIsSecurityEnabled();
    const esClient = coreContext.elasticsearch.client.asCurrentUser;

    const updatedLimitResponse = await updateFieldLimit({
      esClient,
      newFieldLimit: params.body.newFieldLimit,
      dataStream: params.path.dataStream,
      isSecurityEnabled,
    });

    return updatedLimitResponse;
  },
});

const rolloverDataStream = createDatasetQualityServerRoute({
  endpoint: 'POST /internal/dataset_quality/data_streams/{dataStream}/rollover',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<DataStreamRolloverResponse> {
    const { context, params } = resources;
    const coreContext = await context.core;
    const esClient = coreContext.elasticsearch.client.asCurrentUser;
    const datasetQualityESClient = createDatasetQualityESClient(esClient);

    const { acknowledged } = await datasetQualityESClient.rollover({
      alias: params.path.dataStream,
    });

    return { acknowledged };
  },
});

const updateFailureStoreRoute = createDatasetQualityServerRoute({
  endpoint: 'PUT /internal/dataset_quality/data_streams/{dataStream}/update_failure_store',
  params: t.type({
    path: t.type({
      dataStream: t.string,
    }),
    body: t.type({
      failureStoreEnabled: t.boolean,
      customRetentionPeriod: t.union([t.string, t.undefined]),
    }),
  }),
  options: {
    tags: [],
  },
  security: {
    authz: {
      enabled: false,
      reason:
        'This API delegates security to the currently logged in user and their Elasticsearch permissions.',
    },
  },
  async handler(resources): Promise<UpdateFailureStoreResponse> {
    const { context, params, getEsCapabilities } = resources;
    const coreContext = await context.core;
    const esClient = coreContext.elasticsearch.client.asCurrentUser;
    const isServerless = (await getEsCapabilities()).serverless;

    const updatedLimitResponse = await updateFailureStore({
      esClient,
      dataStream: params.path.dataStream,
      failureStoreEnabled: params.body.failureStoreEnabled,
      customRetentionPeriod: params.body.customRetentionPeriod,
      isServerless,
    });

    return updatedLimitResponse;
  },
});

export const dataStreamsRouteRepository = {
  ...datasetTypesPrivilegesRoute,
  ...statsRoute,
  ...degradedDocsRoute,
  ...totalDocsRoute,
  ...nonAggregatableDatasetsRoute,
  ...nonAggregatableDatasetRoute,
  ...degradedFieldsRoute,
  ...degradedFieldValuesRoute,
  ...dataStreamDetailsRoute,
  ...dataStreamSettingsRoute,
  ...checkAndLoadIntegrationRoute,
  ...analyzeDegradedFieldRoute,
  ...updateFieldLimitRoute,
  ...rolloverDataStream,
  ...failedDocsRouteRepository,
  ...updateFailureStoreRoute,
};
