/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type {
  IngestStreamLifecycle,
  IngestStreamLifecycleDSL,
  IngestStreamLifecycleDisabled,
  IngestStreamLifecycleILM,
} from '@kbn/streams-schema';
import type { Streams } from '@kbn/streams-schema';
import type {
  IndicesDataStreamFailureStore,
  IndicesDataStreamLifecycle,
  IndicesDataStreamOptions,
  IndicesDataStreamOptionsTemplate,
  IndicesPutDataLifecycleRequest,
  IndicesSimulateTemplateTemplate,
} from '@elastic/elasticsearch/lib/api/types';
import type { StreamsMappingProperties } from '@kbn/streams-schema/src/fields';
import { isDslLifecycle, isIlmLifecycle, isInheritLifecycle } from '@kbn/streams-schema';
import type { FailureStore } from '@kbn/streams-schema/src/models/ingest/failure_store';
import {
  isDisabledFailureStore,
  isDisabledLifecycleFailureStore,
  isEnabledLifecycleFailureStore,
  isInheritFailureStore,
} from '@kbn/streams-schema/src/models/ingest/failure_store';
import { getErrorMessage, parseError } from '../errors/parse_error';
import { StatusError } from '../errors/status_error';
import { retryTransientEsErrors } from '../helpers/retry';

interface DataStreamManagementOptions {
  esClient: ElasticsearchClient;
  name: string;
  logger: Logger;
}

interface DeleteDataStreamOptions {
  esClient: ElasticsearchClient;
  name: string;
  logger: Logger;
}

interface UpdateOrRolloverDataStreamOptions {
  esClient: ElasticsearchClient;
  name: string;
  logger: Logger;
}

interface UpdateDataStreamsMappingsOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
  name: string;
  mappings: StreamsMappingProperties;
}

interface UpdateDefaultIngestPipelineOptions {
  esClient: ElasticsearchClient;
  name: string;
  pipeline: string | undefined;
}

export async function upsertDataStream({ esClient, name, logger }: DataStreamManagementOptions) {
  const dataStreamExists = await esClient.indices.exists({ index: name });
  if (dataStreamExists) {
    return;
  }
  try {
    await retryTransientEsErrors(() => esClient.indices.createDataStream({ name }), { logger });
    logger.debug(() => `Installed data stream: ${name}`);
  } catch (error) {
    const { type, message } = parseError(error);
    if (type !== 'resource_already_exists_exception') {
      logger.error(`Error creating data stream: ${message}`);
      throw error;
    }
  }
}

export async function deleteDataStream({ esClient, name, logger }: DeleteDataStreamOptions) {
  try {
    await retryTransientEsErrors(
      () => esClient.indices.deleteDataStream({ name }, { ignore: [404] }),
      { logger }
    );
  } catch (error) {
    logger.error(`Error deleting data stream: ${getErrorMessage(error)}`);
    throw error;
  }
}

export async function rolloverDataStream({
  esClient,
  name,
  logger,
}: UpdateOrRolloverDataStreamOptions) {
  await retryTransientEsErrors(() => esClient.indices.rollover({ alias: name, lazy: true }), {
    logger,
  });
}

export async function updateDefaultIngestPipeline({
  esClient,
  name,
  pipeline,
}: UpdateDefaultIngestPipelineOptions) {
  const dataStreams = await esClient.indices.getDataStream({ name });
  for (const dataStream of dataStreams.data_streams) {
    const writeIndex = dataStream.indices.at(-1);
    if (!writeIndex) {
      continue;
    }
    await esClient.indices.putSettings({
      index: writeIndex.index_name,
      settings: {
        'index.default_pipeline': pipeline,
      },
    });
  }
}

// TODO: Remove once client lib has been updated
export interface DataStreamMappingsUpdateResponse {
  data_streams: Array<{
    name: string;
    applied_to_data_stream: boolean;
    error?: string;
    mappings: Record<string, unknown>;
    effective_mappings: Record<string, unknown>;
  }>;
}

export async function updateDataStreamsMappings({
  esClient,
  logger,
  name,
  mappings,
}: UpdateDataStreamsMappingsOptions) {
  // update the mappings on the data stream level
  const response = (await esClient.transport.request({
    method: 'PUT',
    path: `/_data_stream/${name}/_mappings`,
    body: {
      properties: mappings,
      _meta: {
        managed_by: 'streams',
      },
    },
  })) as DataStreamMappingsUpdateResponse;
  if (response.data_streams.length === 0) {
    throw new Error(`Data stream ${name} not found`);
  }
  if (response.data_streams[0].error) {
    throw new Error(
      `Error updating data stream mappings for ${name}: ${response.data_streams[0].error}`
    );
  }
  await retryTransientEsErrors(() => esClient.indices.rollover({ alias: name, lazy: true }), {
    logger,
  });
}

export async function updateDataStreamsLifecycle({
  esClient,
  logger,
  names,
  lifecycle,
  isServerless,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
  names: string[];
  lifecycle: IngestStreamLifecycle;
  isServerless: boolean;
}) {
  try {
    if (isIlmLifecycle(lifecycle)) {
      await putDataStreamsSettings({
        esClient,
        names,
        settings: {
          'index.lifecycle.name': lifecycle.ilm.policy,
          'index.lifecycle.prefer_ilm': true,
        },
      });
    } else if (isDslLifecycle(lifecycle)) {
      const dslDownsampling = lifecycle.dsl.downsample;
      const request: IndicesPutDataLifecycleRequest = {
        name: names,
        data_retention: lifecycle.dsl.data_retention,
        ...(dslDownsampling?.length ? { downsampling: dslDownsampling } : {}),
      };
      await retryTransientEsErrors(() => esClient.indices.putDataLifecycle(request), { logger });

      if (!isServerless) {
        // we don't need overrides for serverless since data streams can
        // only be managed by dsl
        await putDataStreamsSettings({
          esClient,
          names,
          settings: {
            'index.lifecycle.name': null,
            'index.lifecycle.prefer_ilm': false,
          },
        });
      }
    } else if (isInheritLifecycle(lifecycle)) {
      // classic streams only - inheriting a lifecycle means falling back to
      // the template configuration. if we find a DSL we need to set it
      // explicitly since there is no way to fall back to the template value,
      // for ILM or disabled we only have to unset any overrides
      await Promise.all(
        names.map(async (name) => {
          const template = await simulateClassicStreamTemplate({ esClient, name, logger });

          // simulateIndexTemplate returns an empty response for replicated data streams
          // that have no local index template
          if (!template || !template.settings) {
            throw new StatusError(
              `Cannot determine template lifecycle for ${name} — the data stream may be replicated and managed by a remote cluster`,
              400
            );
          }

          const templateLifecycle = getTemplateLifecycle(template);
          if (isDslLifecycle(templateLifecycle)) {
            const templateDownsampling = templateLifecycle.dsl.downsample;
            const request: IndicesPutDataLifecycleRequest = {
              name,
              data_retention: templateLifecycle.dsl.data_retention,
              ...(templateDownsampling?.length ? { downsampling: templateDownsampling } : {}),
            };
            await retryTransientEsErrors(() => esClient.indices.putDataLifecycle(request), {
              logger,
            });
          } else {
            await retryTransientEsErrors(() => esClient.indices.deleteDataLifecycle({ name }), {
              logger,
            });
          }

          if (!isServerless) {
            // unset any overriden settings
            await putDataStreamsSettings({
              esClient,
              names: [name],
              settings: {
                'index.lifecycle.name': null,
                'index.lifecycle.prefer_ilm': null,
              },
            });
          }
        })
      );
    }
  } catch (err) {
    logger.error(`Error updating data stream lifecycle: ${getErrorMessage(err)}`);
    throw err;
  }
}

export async function putDataStreamsSettings({
  esClient,
  names,
  settings,
}: {
  esClient: ElasticsearchClient;
  names: string[];
  settings: {
    'index.lifecycle.name'?: string | null;
    'index.lifecycle.prefer_ilm'?: boolean | null;
    'index.number_of_replicas'?: number | null;
    'index.number_of_shards'?: number | null;
    'index.refresh_interval'?: string | -1 | null;
  };
}) {
  const response = await retryTransientEsErrors(() =>
    esClient.indices.putDataStreamSettings({
      name: names,
      settings,
    })
  );
  const dataStreamErrors = response.data_streams
    .filter(({ error }) => Boolean(error))
    .map(({ error }) => (typeof error === 'string' ? error : JSON.stringify(error)));
  if (dataStreamErrors.length) {
    const joined = dataStreamErrors.join('\n');
    throw new Error(joined);
  }
}

/**
 * Maps a non-inherit stream failure_store definition to Elasticsearch failure_store options
 * (put data stream API and index template data_stream_options).
 */
export function failureStoreDefinitionToElasticsearchOptions(
  failureStore: FailureStore,
  isServerless: boolean
): IndicesDataStreamFailureStore {
  if (isInheritFailureStore(failureStore)) {
    throw new Error('Expected a resolved failure store, not { inherit: {} }');
  }

  if (isEnabledLifecycleFailureStore(failureStore)) {
    const dataRetention = failureStore.lifecycle.enabled?.data_retention;
    return {
      enabled: true,
      ...(dataRetention ? { lifecycle: { data_retention: dataRetention, enabled: true } } : {}),
    };
  }

  if (isDisabledLifecycleFailureStore(failureStore)) {
    return {
      enabled: true,
      ...(isServerless ? {} : { lifecycle: { enabled: false } }),
    };
  }

  if (isDisabledFailureStore(failureStore)) {
    return {
      enabled: false,
    };
  }

  throw new Error('Invalid failure store configuration');
}

/**
 * Template-layer failure store options for wired stream index templates so new or restored
 * data streams materialize with the correct failure store when deferral skips putDataStreamOptions.
 */
export function failureStoreToIndexTemplateDataStreamOptions(
  failureStore: FailureStore,
  isServerless: boolean
): IndicesDataStreamOptionsTemplate | undefined {
  if (isInheritFailureStore(failureStore)) {
    return undefined;
  }

  return {
    failure_store: failureStoreDefinitionToElasticsearchOptions(failureStore, isServerless),
  };
}

export async function updateDataStreamsFailureStore({
  esClient,
  logger,
  failureStore,
  stream,
  isServerless,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
  failureStore: FailureStore;
  stream: Streams.all.Definition;
  isServerless: boolean;
}) {
  try {
    let failureStoreConfig: IndicesDataStreamFailureStore;

    // Handle { inherit: {} }
    if (isInheritFailureStore(failureStore)) {
      const response = await retryTransientEsErrors(
        () => esClient.indices.simulateIndexTemplate({ name: stream.name }),
        { logger }
      );
      // If not template, disable the failure store. Empty object would cause Elasticsearch error.
      // @ts-expect-error index simulate response is not well typed
      failureStoreConfig = response.template?.data_stream_options?.failure_store ?? {
        enabled: false,
      };
    } else {
      failureStoreConfig = failureStoreDefinitionToElasticsearchOptions(failureStore, isServerless);
    }

    await retryTransientEsErrors(
      () =>
        esClient.indices.putDataStreamOptions(
          {
            name: stream.name,
            failure_store: failureStoreConfig,
          },
          { meta: true }
        ),
      { logger }
    );
  } catch (err) {
    logger.error(`Error updating data stream failure store: ${getErrorMessage(err)}`);
    throw err;
  }
}

export type SimulatedClassicStreamTemplate = IndicesSimulateTemplateTemplate & {
  lifecycle?: IndicesDataStreamLifecycle;
  data_stream_options?: IndicesDataStreamOptions;
};

export async function simulateClassicStreamTemplate({
  esClient,
  name,
  logger,
}: {
  esClient: ElasticsearchClient;
  name: string;
  logger: Logger;
}): Promise<SimulatedClassicStreamTemplate | undefined> {
  const dataStream = await retryTransientEsErrors(() => esClient.indices.getDataStream({ name }), {
    logger,
  })
    .then((response) => response.data_streams?.[0])
    .catch(() => undefined);

  const templateName = dataStream?.template;
  if (!templateName) {
    const simulation = await retryTransientEsErrors(
      () => esClient.indices.simulateIndexTemplate({ name: dataStream?.name ?? name }),
      { logger }
    ).catch(() => undefined);
    return simulation?.template;
  }

  const simulation = await retryTransientEsErrors(
    () => esClient.indices.simulateTemplate({ name: templateName }),
    { logger }
  ).catch(() => undefined);

  return simulation?.template;
}

export function getTemplateLifecycle(
  template: SimulatedClassicStreamTemplate
): IngestStreamLifecycleILM | IngestStreamLifecycleDSL | IngestStreamLifecycleDisabled {
  const toBoolean = (value: boolean | string | undefined): boolean => {
    if (typeof value === 'boolean') {
      return value;
    }
    return value === 'true';
  };

  const dslEnabled =
    template.lifecycle?.enabled !== undefined
      ? toBoolean(template.lifecycle.enabled)
      : template.lifecycle?.data_retention != null;

  const ilmPolicyName = template.settings?.index?.lifecycle?.name;
  const preferIlmSetting = template.settings?.index?.lifecycle?.prefer_ilm;
  const preferIlm = preferIlmSetting === undefined ? true : toBoolean(preferIlmSetting);

  const hasEffectiveDsl = dslEnabled && !(preferIlm && ilmPolicyName);
  if (hasEffectiveDsl) {
    const dataRetention =
      typeof template.lifecycle?.data_retention === 'string'
        ? template.lifecycle.data_retention
        : undefined;
    const downsample: IngestStreamLifecycleDSL['dsl']['downsample'] = Array.isArray(
      template.lifecycle?.downsampling
    )
      ? template.lifecycle.downsampling.flatMap(({ after, fixed_interval }) => {
          return typeof after === 'string' ? [{ after, fixed_interval }] : [];
        })
      : undefined;

    return {
      dsl: {
        data_retention: dataRetention,
        ...(downsample?.length ? { downsample } : {}),
      },
    };
  }

  if (ilmPolicyName) {
    return { ilm: { policy: ilmPolicyName } };
  }

  return { disabled: {} };
}
