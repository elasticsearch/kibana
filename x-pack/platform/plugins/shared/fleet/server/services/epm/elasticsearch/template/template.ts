/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import deepEqual from 'fast-deep-equal';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type {
  IndicesIndexSettings,
  MappingDynamicTemplate,
  MappingTypeMapping,
} from '@elastic/elasticsearch/lib/api/types';

import pMap from 'p-map';
import { isResponseError } from '@kbn/es-errors';

import {
  FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_NAME,
  OTEL_LOGS_COMPONENT_TEMPLATES,
  OTEL_METRICS_COMPONENT_TEMPLATES,
  OTEL_TRACES_COMPONENT_TEMPLATES,
  STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
} from '../../../../constants/fleet_es_assets';
import { MAX_CONCURRENT_DATASTREAM_OPERATIONS } from '../../../../constants';

import type { Field } from '../../fields/field';
import type {
  RegistryDataStream,
  IndexTemplateEntry,
  IndexTemplate,
  IndexTemplateMappings,
  RegistryElasticsearch,
} from '../../../../types';
import { appContextService } from '../../..';
import { getRegistryDataStreamAssetBaseName } from '../../../../../common/services';
import {
  STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
  FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
  FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
  STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS,
  STACK_COMPONENT_TEMPLATE_METRICS_SETTINGS,
  STACK_COMPONENT_TEMPLATE_METRICS_TSDB_SETTINGS,
} from '../../../../constants';
import { getESAssetMetadata } from '../meta';
import { retryTransientEsErrors } from '../retry';
import { PackageESError, PackageInvalidArchiveError } from '../../../../errors';

import { isUserSettingsTemplate, fillConstantKeywordValues } from './utils';
import { MappingsBuilder } from './mappings_builder';
import { retryDataStreamUpdateOnClusterEventTimeout } from './retry_data_stream_update';

export interface IndexTemplateMapping {
  [key: string]: any;
}
export interface CurrentDataStream {
  dataStreamName: string;
  replicated: boolean;
  indexTemplate: IndexTemplate;
  currentWriteIndex: string;
}

// see discussion in https://github.com/elastic/kibana/issues/88307
const DEFAULT_TEMPLATE_PRIORITY = 200;
const DATASET_IS_PREFIX_TEMPLATE_PRIORITY = 150;

// Namespace-scoped templates get a higher priority so ES picks them over
// the base template for data streams belonging to that namespace.
export const NAMESPACE_TEMPLATE_PRIORITY_BOOST = 50;

/**
 * getTemplate retrieves the default template but overwrites the index pattern with the given value.
 *
 * @param indexPattern String with the index pattern
 */
export function getTemplate({
  templateIndexPattern,
  packageName,
  composedOfTemplates,
  templatePriority,
  hidden,
  registryElasticsearch,
  isIndexModeTimeSeries,
  type,
  isOtelInputType,
}: {
  templateIndexPattern: string;
  packageName: string;
  composedOfTemplates: string[];
  templatePriority: number;
  type: string;
  hidden?: boolean;
  registryElasticsearch?: RegistryElasticsearch | undefined;
  isIndexModeTimeSeries?: boolean;
  isOtelInputType?: boolean;
}): IndexTemplate {
  const template = getBaseTemplate({
    templateIndexPattern,
    packageName,
    composedOfTemplates,
    templatePriority,
    registryElasticsearch,
    hidden,
    isIndexModeTimeSeries,
  });
  if (template.template.settings.index.final_pipeline) {
    throw new PackageInvalidArchiveError(
      `Error template for ${templateIndexPattern} contains a final_pipeline`
    );
  }

  const esBaseComponents = getBaseEsComponents(type, !!isIndexModeTimeSeries, isOtelInputType);
  const config = appContextService.getConfig();

  template.composed_of = [
    ...esBaseComponents,
    ...(template.composed_of || []),
    ...(isOtelInputType ? [] : [STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS]),
    FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
    ...(config?.agentIdVerificationEnabled ? [FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME] : []),
    ...(!config?.agentIdVerificationEnabled && config?.eventIngestedEnabled
      ? [FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_NAME]
      : []),
  ];

  template.ignore_missing_component_templates = template.composed_of.filter(isUserSettingsTemplate);
  return template;
}

const getBaseEsComponents = (
  type: string,
  isIndexModeTimeSeries: boolean,
  isOTelInputType?: boolean
): string[] => {
  if (isOTelInputType) {
    return getOtelBaseComponents(type);
  }

  if (type === 'metrics') {
    if (isIndexModeTimeSeries) {
      return [STACK_COMPONENT_TEMPLATE_METRICS_TSDB_SETTINGS];
    }

    return [STACK_COMPONENT_TEMPLATE_METRICS_SETTINGS];
  } else if (type === 'logs') {
    return [STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS, STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS];
  }

  return [];
};

const getOtelBaseComponents = (type: string): string[] => {
  if (type === 'metrics') {
    return OTEL_METRICS_COMPONENT_TEMPLATES;
  } else if (type === 'logs') {
    return OTEL_LOGS_COMPONENT_TEMPLATES;
  } else if (type === 'traces') {
    return OTEL_TRACES_COMPONENT_TEMPLATES;
  }
  return [];
};

/**
 * Generate mapping takes the given nested fields array and creates the Elasticsearch
 * mapping properties out of it.
 *
 * This assumes that all fields with dotted.names have been expanded in a previous step.
 */
export function generateMappings(
  fields: Field[],
  isIndexModeTimeSeries = false
): IndexTemplateMappings {
  const builder = new MappingsBuilder(isIndexModeTimeSeries);
  const { properties } = builder.build(fields);
  return builder.toIndexTemplateMappings(properties);
}

/**
 * Generates the template name out of the given information
 */
export function generateTemplateName(dataStream: RegistryDataStream): string {
  return getRegistryDataStreamAssetBaseName(dataStream);
}

/**
 * Given a data stream name, return the indexTemplate name
 */
async function getIndexTemplate(
  esClient: ElasticsearchClient,
  dataStreamName: string
): Promise<string> {
  const dataStream = await esClient.indices.getDataStream({
    name: dataStreamName,
    expand_wildcards: ['open', 'hidden'],
  });
  return dataStream.data_streams[0].template;
}

const buildIndexPattern = (baseName: string, isPrefix: boolean, tail: string): string =>
  isPrefix ? `${baseName}.*-${tail}` : `${baseName}-${tail}`;

export function generateTemplateIndexPattern(
  dataStream: RegistryDataStream,
  isOtelInputType?: boolean
): string {
  // See also https://github.com/elastic/package-spec/pull/102
  return buildIndexPattern(
    getRegistryDataStreamAssetBaseName(dataStream, isOtelInputType),
    !!dataStream.dataset_is_prefix,
    '*'
  );
}

// Template priorities are discussed in https://github.com/elastic/kibana/issues/88307
// See also https://www.elastic.co/guide/en/elasticsearch/reference/current/index-templates.html
//
// Built-in templates like logs-*-* and metrics-*-* have priority 100
//
// EPM generated templates for data streams have priority 200 (DEFAULT_TEMPLATE_PRIORITY)
//
// EPM generated templates for data streams with dataset_is_prefix: true have priority 150 (DATASET_IS_PREFIX_TEMPLATE_PRIORITY)

export function getTemplatePriority(dataStream: RegistryDataStream): number {
  // undefined or explicitly set to false
  // See also https://github.com/elastic/package-spec/pull/102
  if (!dataStream.dataset_is_prefix) {
    return DEFAULT_TEMPLATE_PRIORITY;
  } else {
    return DATASET_IS_PREFIX_TEMPLATE_PRIORITY;
  }
}

// ---------------------------------------------------------------------------
// Namespace-scoped index template helpers
// ---------------------------------------------------------------------------

/**
 * Returns the index template name for a namespace-scoped template.
 * Example: `logs-nginx.access@namespace.production`
 */
export function generateNamespaceTemplateName(baseName: string, namespace: string): string {
  return `${baseName}@namespace.${namespace}`;
}

/**
 * Returns the index pattern for a namespace-scoped template.
 *
 * The pattern matches the data stream name exactly (no trailing wildcard on the
 * namespace segment) so that namespaces with shared prefixes do not collide —
 * e.g. the template for namespace `production` must not also match data streams
 * for `production_eu` or `production_us`.
 *
 * Example (non-prefix): `logs-nginx.access-production`
 * Example (dataset_is_prefix): `metrics-test.*-production`
 * Example (OTel): `traces-generic.otel-production`
 */
export function generateNamespaceTemplateIndexPattern(
  dataStream: RegistryDataStream,
  namespace: string,
  isOtelInputType?: boolean
): string {
  return buildIndexPattern(
    getRegistryDataStreamAssetBaseName(dataStream, isOtelInputType),
    !!dataStream.dataset_is_prefix,
    namespace
  );
}

/**
 * Returns the priority for a namespace-scoped index template.
 * Always higher than the base template so ES picks it for matching data streams.
 *
 * Note: for data streams with `dataset_is_prefix: true`, the base template priority is 150
 * and the namespace template priority is 200 — the same numeric value as a regular base
 * template. This is intentional: Elasticsearch resolves priority ties by index pattern
 * specificity, so the more specific namespace pattern (e.g. `metrics-test.*-production`)
 * wins over the regular base pattern (e.g. `metrics-test.*-*`) even at equal priority.
 */
export function getNamespaceTemplatePriority(dataStream: RegistryDataStream): number {
  return getTemplatePriority(dataStream) + NAMESPACE_TEMPLATE_PRIORITY_BOOST;
}

/**
 * Returns true if the given template ID is a namespace-scoped index template,
 * identifiable by the `@namespace.` discriminator in the name.
 */
export function isNamespaceTemplate(id: string): boolean {
  return id.includes('@namespace.');
}

/**
 * Extracts the namespace from a namespace-scoped template ID.
 * Returns undefined if the ID is not a namespace template.
 * Example: `logs-nginx.access@namespace.production` → `'production'`
 */
export function getNamespaceFromTemplateId(id: string): string | undefined {
  const marker = '@namespace.';
  const idx = id.indexOf(marker);
  if (idx === -1) {
    return undefined;
  }
  return id.slice(idx + marker.length);
}

/**
 * Returns a map of the data stream path fields to elasticsearch index pattern.
 * @param dataStreams an array of RegistryDataStream objects
 */
export function generateESIndexPatterns(
  dataStreams: RegistryDataStream[] | undefined
): Record<string, string> {
  if (!dataStreams) {
    return {};
  }

  const patterns: Record<string, string> = {};
  for (const dataStream of dataStreams) {
    patterns[dataStream.path] = generateTemplateIndexPattern(dataStream);
  }
  return patterns;
}

function getBaseTemplate({
  templateIndexPattern,
  packageName,
  composedOfTemplates,
  templatePriority,
  hidden,
  registryElasticsearch,
  isIndexModeTimeSeries,
}: {
  templateIndexPattern: string;
  packageName: string;
  composedOfTemplates: string[];
  templatePriority: number;
  hidden?: boolean;
  registryElasticsearch: RegistryElasticsearch | undefined;
  isIndexModeTimeSeries?: boolean;
}): IndexTemplate {
  const _meta = getESAssetMetadata({ packageName });

  let settingsIndex = {};
  if (isIndexModeTimeSeries) {
    settingsIndex = {
      mode: 'time_series',
    };
  }

  return {
    priority: templatePriority,
    index_patterns: [templateIndexPattern],
    template: {
      settings: {
        index: settingsIndex,
      },
      mappings: {
        _meta,
      },
    },
    data_stream: {
      hidden: registryElasticsearch?.['index_template.data_stream']?.hidden || hidden,
    },
    composed_of: composedOfTemplates,
    _meta,
  };
}

export const updateCurrentWriteIndices = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  templates: IndexTemplateEntry[],
  options?: {
    ignoreMappingUpdateErrors?: boolean;
    skipDataStreamRollover?: boolean;
  }
): Promise<void> => {
  if (!templates.length) return;

  const allIndices = await queryDataStreamsFromTemplates(esClient, templates);
  const allUpdatablesIndices = allIndices.filter((indice) => {
    if (indice.replicated) {
      logger.warn(
        `Datastream ${indice.dataStreamName} cannot be updated because this is a replicated datastream.`
      );
      return false;
    }
    return true;
  });
  if (!allUpdatablesIndices.length) return;
  return updateAllDataStreams(allUpdatablesIndices, esClient, logger, options);
};

function isCurrentDataStream(item: CurrentDataStream[] | undefined): item is CurrentDataStream[] {
  return item !== undefined;
}

const queryDataStreamsFromTemplates = async (
  esClient: ElasticsearchClient,
  templates: IndexTemplateEntry[]
): Promise<CurrentDataStream[]> => {
  const concurrency =
    appContextService.getConfig()?.packageInstallation?.maxConcurrentDatastreamOperations ??
    MAX_CONCURRENT_DATASTREAM_OPERATIONS;
  const dataStreamObjects = await pMap(
    templates,
    (template) => {
      return getDataStreams(esClient, template);
    },
    {
      concurrency,
    }
  );
  return dataStreamObjects.filter(isCurrentDataStream).flat();
};

const getDataStreams = async (
  esClient: ElasticsearchClient,
  template: IndexTemplateEntry
): Promise<CurrentDataStream[] | undefined> => {
  const { indexTemplate } = template;

  const body = await esClient.indices.getDataStream({
    name: indexTemplate.index_patterns.join(','),
    expand_wildcards: ['open', 'hidden'],
  });

  const dataStreams = body.data_streams;
  if (!dataStreams.length) return;
  return dataStreams.map((dataStream: any) => ({
    dataStreamName: dataStream.name,
    replicated: dataStream.replicated,
    indexTemplate,
    currentWriteIndex: dataStream.indices?.at(-1)?.index_name,
  }));
};

const MAPPER_EXCEPTION_REASONS_REQUIRING_ROLLOVER = [
  'subobjects',
  "[enabled] parameter can't be updated for the object mapping",
];

/**
 * Returns true when the ES error indicates that the mapping change is incompatible with the
 * current write index and a data-stream rollover is the right recovery action.
 *
 * `total_fields` limit breaches are deliberately excluded: they surface as
 * `illegal_argument_exception` but a rollover cannot fix them — the new write index is built
 * from the same index template and inherits the same field-count limit, so the oversized
 * mapping would fail again immediately.  Callers should surface those errors clearly instead.
 */
function errorNeedRollover(err: any): boolean {
  if (
    isResponseError(err) &&
    err.statusCode === 400 &&
    err.body?.error?.type === 'illegal_argument_exception'
  ) {
    // total_fields limit errors cannot be resolved by a rollover — skip them.
    if (isTotalFieldsLimitError(err)) {
      return false;
    }
    return true;
  }
  if (
    err.body?.error?.type === 'mapper_exception' &&
    err.body?.error?.reason &&
    MAPPER_EXCEPTION_REASONS_REQUIRING_ROLLOVER.some((reason) =>
      err.body?.error?.reason?.includes(reason)
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true when the error is an ES `total_fields` limit breach
 * (`index.mapping.total_fields.limit` exceeded).
 */
export function isTotalFieldsLimitError(err: any): boolean {
  const reason: string = err.body?.error?.reason ?? '';
  return reason.includes('Limit of total fields') && reason.includes('has been exceeded');
}

const rolloverDataStream = (
  dataStreamName: string,
  esClient: ElasticsearchClient,
  logger: Logger
) => {
  return retryDataStreamUpdateOnClusterEventTimeout(
    () =>
      esClient.transport.request({
        method: 'POST',
        path: `/${dataStreamName}/_rollover`,
        querystring: {
          lazy: true,
        },
      }),
    { logger, dataStreamName }
  );
};

const updateAllDataStreams = async (
  indexNameWithTemplates: CurrentDataStream[],
  esClient: ElasticsearchClient,
  logger: Logger,
  options?: {
    ignoreMappingUpdateErrors?: boolean;
    skipDataStreamRollover?: boolean;
  }
): Promise<void> => {
  const concurrency =
    appContextService.getConfig()?.packageInstallation?.maxConcurrentDatastreamOperations ??
    MAX_CONCURRENT_DATASTREAM_OPERATIONS;
  await pMap(
    indexNameWithTemplates,
    (templateEntry) => {
      return updateExistingDataStream({
        esClient,
        logger,
        currentWriteIndex: templateEntry.currentWriteIndex,
        dataStreamName: templateEntry.dataStreamName,
        options,
      });
    },
    {
      concurrency,
    }
  );
};

const updateExistingDataStream = async ({
  dataStreamName,
  currentWriteIndex,
  esClient,
  logger,
  options,
}: {
  dataStreamName: string;
  currentWriteIndex: string;
  esClient: ElasticsearchClient;
  logger: Logger;
  options?: {
    ignoreMappingUpdateErrors?: boolean;
    skipDataStreamRollover?: boolean;
  };
}) => {
  const existingDs = await esClient.indices.get({
    index: currentWriteIndex,
  });

  const existingDsConfig = Object.values(existingDs);
  const currentBackingIndexConfig = existingDsConfig.at(-1);
  const currentIndexMode = currentBackingIndexConfig?.settings?.index?.mode;
  const currentSourceType = currentBackingIndexConfig?.settings?.index?.mapping?.source?.mode;

  let settings: IndicesIndexSettings;
  let mappings: MappingTypeMapping = {};
  let lifecycle: any;
  let subobjectsFieldChanged: boolean = false;
  let simulateResult: any = {};
  try {
    simulateResult = await retryTransientEsErrors(async () =>
      esClient.indices.simulateTemplate({
        name: await getIndexTemplate(esClient, dataStreamName),
      })
    );

    settings = simulateResult.template.settings;

    try {
      mappings = fillConstantKeywordValues(
        currentBackingIndexConfig?.mappings || {},
        simulateResult.template.mappings || {}
      );
    } catch (err) {
      logger.error(`Error filling constant keyword values: ${err}`);
      mappings = simulateResult.template.mappings;
    }

    lifecycle = simulateResult.template.lifecycle;

    // for now, remove from object so as not to update stream or data stream properties of the index until type and name
    // are added in https://github.com/elastic/kibana/issues/66551.  namespace value we will continue
    // to skip updating and assume the value in the index mapping is correct
    if (mappings && mappings.properties) {
      delete mappings.properties.stream;
      delete mappings.properties.data_stream;
    }
    if (currentBackingIndexConfig?.mappings?.subobjects !== mappings.subobjects) {
      subobjectsFieldChanged = true;
    }

    logger.debug(`Attempt to update the mappings for the ${dataStreamName} (write_index_only)`);
    await retryTransientEsErrors(
      () =>
        esClient.indices.putMapping({
          index: dataStreamName,
          ...mappings,
          write_index_only: true,
        }),
      { logger }
    );

    // if update fails, rollover data stream and bail out
  } catch (err) {
    if (errorNeedRollover(err) || subobjectsFieldChanged) {
      logger.info(`Mappings update for ${dataStreamName} failed due to ${err}`);
      logger.trace(`Attempted mappings: ${mappings}`);
      if (options?.skipDataStreamRollover === true) {
        logger.info(
          `Skipping rollover for ${dataStreamName} as "skipDataStreamRollover" is enabled`
        );
        return;
      } else {
        logger.info(`Triggering a rollover for ${dataStreamName}`);
        await rolloverDataStream(dataStreamName, esClient, logger);
        return;
      }
    }
    // total_fields limit errors cannot be resolved by a rollover (the new write index inherits
    // the same limit from the index template).  Log clearly and skip the rollover so we don't
    // add churn to an already-overloaded cluster.
    if (isTotalFieldsLimitError(err)) {
      logger.warn(
        `Mappings update for ${dataStreamName} failed because the index mapping total_fields limit has been exceeded. ` +
          `Skipping rollover as it would not resolve the issue. ` +
          `The total_fields limit must be raised on the index template to allow this mapping update: ${err}`
      );
      if (options?.ignoreMappingUpdateErrors !== true) {
        throw err;
      }
      return;
    }
    logger.error(`Mappings update for ${dataStreamName} failed due to unexpected error: ${err}`);
    logger.trace(`Attempted mappings: ${mappings}`);
    if (options?.ignoreMappingUpdateErrors === true) {
      logger.info(`Ignore mapping update errors as "ignoreMappingUpdateErrors" is enabled`);
      return;
    } else {
      throw err;
    }
  }

  const filterDimensionMappings = (
    templates?: Array<Record<string, MappingDynamicTemplate | undefined>>
  ) =>
    templates?.filter(
      (template) => (Object.values(template)[0]?.mapping as any)?.time_series_dimension
    ) ?? [];

  const currentDynamicDimensionMappings = filterDimensionMappings(
    currentBackingIndexConfig?.mappings?.dynamic_templates
  );
  const updatedDynamicDimensionMappings = filterDimensionMappings(mappings.dynamic_templates);

  const sortMappings = (
    a: Record<string, MappingDynamicTemplate | undefined>,
    b: Record<string, MappingDynamicTemplate | undefined>
  ) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]);

  const dynamicDimensionMappingsChanged = !deepEqual(
    currentDynamicDimensionMappings.sort(sortMappings),
    updatedDynamicDimensionMappings.sort(sortMappings)
  );

  const packageDefinedIndexMode = settings?.index?.mode;
  const packageDefinedSourceMode = settings?.index?.mapping?.source?.mode;

  // Trigger a rollover if the index mode or source type has changed
  if (
    (packageDefinedIndexMode !== undefined && currentIndexMode !== settings?.index?.mode) ||
    (packageDefinedSourceMode !== undefined &&
      currentSourceType !== settings?.index?.mapping?.source?.mode) ||
    dynamicDimensionMappingsChanged
  ) {
    if (options?.skipDataStreamRollover === true) {
      logger.info(
        `Index mode or source type or dynamic dimension mappings have changed for ${dataStreamName}, skipping rollover as "skipDataStreamRollover" is enabled`
      );
      return;
    } else {
      logger.info(
        dynamicDimensionMappingsChanged
          ? `Dynamic dimension mappings changed for ${dataStreamName}, triggering a rollover`
          : `Index mode or source type has changed for ${dataStreamName}, triggering a rollover`
      );
      await rolloverDataStream(dataStreamName, esClient, logger);
    }
  }

  if (lifecycle?.data_retention) {
    try {
      logger.debug(`Updating lifecycle for ${dataStreamName}`);

      await retryTransientEsErrors(
        () =>
          esClient.transport.request({
            method: 'PUT',
            path: `_data_stream/${dataStreamName}/_lifecycle`,
            body: { data_retention: lifecycle.data_retention },
          }),
        { logger }
      );
    } catch (err) {
      // Check if this error can happen because of invalid settings;
      // We are returning a 500 but in that case it should be a 400 instead
      throw new PackageESError(
        `Could not update lifecycle settings for ${dataStreamName}: ${err.message}`
      );
    }
  }

  // update settings after mappings was successful to ensure
  // pointing to the new pipeline is safe
  // for now, only update the pipeline
  if (!settings?.index?.default_pipeline) {
    return;
  }

  try {
    logger.debug(`Updating index settings of data stream  ${dataStreamName}`);

    await retryTransientEsErrors(
      () =>
        esClient.indices.putSettings({
          index: dataStreamName,
          settings: { default_pipeline: settings!.index!.default_pipeline },
        }),
      { logger }
    );
  } catch (err) {
    logger.error(`Error updating index settings of data stream ${dataStreamName}: ${err}`);
    // Same as above - Check if this error can happen because of invalid settings;
    // We are returning a 500 but in that case it should be a 400 instead
    throw new PackageESError(
      `Could not update index settings of data stream ${dataStreamName}: ${err.message}`
    );
  }
};
