/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  IndicesGetDataStreamResponse,
  IndicesResolveIndexResponse,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import { isNotFoundError } from '@kbn/es-errors';
import { EsResourceType } from '@kbn/agent-builder-common';
import type { MappingField } from '../mappings';
import { flattenMapping, getIndexMappings } from '../mappings';
import { processFieldCapsResponse } from '../field_caps';
import { isCcsTarget, getFieldsFromFieldCaps } from '../ccs';
import { listDatasets, getDatasetFields } from '../datasets';

export interface ResolveResourceResponse {
  /** name of the resource */
  name: string;
  /** type of the resource*/
  type: EsResourceType;
  /** list of fields */
  fields: MappingField[];
  /** description from the meta, if available */
  description?: string;
  /** whether the resource is a TSDB resource (any field has tsDimension or tsMetric) */
  isTsdb: boolean;
}

/**
 * Heuristic TSDB detection from field markers. Used as a fallback for resources where
 * we can't query an authoritative source per call: aliases, multi-target patterns, and
 * CCS / cross-project targets.
 */
export const deriveIsTsdb = (fields: MappingField[]): boolean => {
  return fields.some((f) => f.tsDimension === true || f.tsMetric != null);
};

/**
 * Fetches index settings as a flat key/value object. Returns the raw typed response so
 * callers can read whichever setting(s) they need (`index.mode`, `index.lifecycle.name`, ...).
 */
const getIndexSettings = async ({
  indexName,
  esClient,
}: {
  indexName: string;
  esClient: ElasticsearchClient;
}) => {
  return esClient.indices.getSettings({
    index: indexName,
    flat_settings: true,
  });
};

/**
 * Fetches a data stream definition. Returns the raw typed response so callers can read
 * whichever property they need (`indices[].index_mode`, `generation`, `lifecycle`, ...).
 *
 * All backing indices of a single data stream share `index.mode` (it's inherited from the
 * index template at every rollover), so a single backing-index entry is enough to decide
 * the mode of the stream.
 */
const getDataStream = async ({
  datastreamName,
  esClient,
}: {
  datastreamName: string;
  esClient: ElasticsearchClient;
}) => {
  return esClient.indices.getDataStream({ name: datastreamName });
};

/**
 * Returns true when the data stream is a time-series data stream
 * (i.e. its backing indices run in `index.mode: time_series`).
 */
const isTimeseriesDataStream = (definition: IndicesGetDataStreamResponse): boolean => {
  return definition.data_streams[0]?.indices?.[0]?.index_mode === 'time_series';
};
/**
 * Retrieve the field list and other relevant info from the given resource name (index, alias or datastream)
 * Note: this can target a single resource, the resource name must not be a pattern.
 */
export const resolveResource = async ({
  resourceName,
  esClient,
}: {
  resourceName: string;
  esClient: ElasticsearchClient;
}): Promise<ResolveResourceResponse> => {
  if (resourceName.includes(',') || resourceName.includes('*')) {
    throw new Error(
      `Tried to resolve resource for multiple resources using pattern ${resourceName}`
    );
  }

  let resolveRes: IndicesResolveIndexResponse;
  try {
    resolveRes = await esClient.indices.resolveIndex({
      name: [resourceName],
      allow_no_indices: false,
    });
  } catch (e) {
    if (isNotFoundError(e)) {
      throw new Error(`No resource found for '${resourceName}'`);
    }
    throw e;
  }

  const resourceCount =
    resolveRes.indices.length + resolveRes.aliases.length + resolveRes.data_streams.length;

  if (resourceCount !== 1) {
    throw new Error(`Found multiple targets when trying to resolve resource for ${resourceName}`);
  }

  return resolveSingleResource({ resourceName, resolveRes, esClient });
};

/**
 * Resolves a single external ES|QL dataset by name, or undefined when none matches. Datasets are
 * invisible to `_resolve/index`/`_field_caps`, so they're looked up via `_query/dataset` and their
 * fields introspected with `FROM <name> | LIMIT 0`.
 */
const tryResolveDataset = async ({
  resourceName,
  esClient,
}: {
  resourceName: string;
  esClient: ElasticsearchClient;
}): Promise<ResolveResourceResponse | undefined> => {
  if (resourceName.includes(',') || resourceName.includes('*')) {
    return undefined;
  }
  const datasets = await listDatasets({ esClient });
  if (!datasets.some((dataset) => dataset.name === resourceName)) {
    return undefined;
  }
  const fields = await getDatasetFields({ name: resourceName, esClient });
  return {
    name: resourceName,
    type: EsResourceType.dataset,
    fields,
    isTsdb: false,
  };
};

const EMPTY_RESOLVE_RESPONSE: IndicesResolveIndexResponse = {
  indices: [],
  aliases: [],
  data_streams: [],
};

/**
 * Retrieve resource metadata for ES|QL generation.
 * Supports index patterns and comma-separated targets by using field_caps
 * when multiple resources are resolved. Multi-target results use {@link EsResourceType.indexPattern}.
 * When `includeDatasets` is true, a name that resolves to no index falls back to an external ES|QL dataset.
 */
export const resolveResourceForEsql = async ({
  resourceName,
  esClient,
  includeDatasets = false,
}: {
  resourceName: string;
  esClient: ElasticsearchClient;
  includeDatasets?: boolean;
}): Promise<ResolveResourceResponse> => {
  let resolveRes: IndicesResolveIndexResponse;
  try {
    resolveRes = await esClient.indices.resolveIndex({
      name: [resourceName],
      allow_no_indices: false,
      expand_wildcards: ['all'],
    });
  } catch (e) {
    if (!isNotFoundError(e)) {
      throw e;
    }
    resolveRes = EMPTY_RESOLVE_RESPONSE;
  }

  const resourceCount =
    resolveRes.indices.length + resolveRes.aliases.length + resolveRes.data_streams.length;

  if (resourceCount === 0) {
    if (includeDatasets) {
      const dataset = await tryResolveDataset({ resourceName, esClient });
      if (dataset) {
        return dataset;
      }
    }
    throw new Error(`No resource found for '${resourceName}'`);
  }

  if (resourceCount === 1) {
    return resolveSingleResource({ resourceName, resolveRes, esClient });
  }

  const fieldCapRes = await esClient.fieldCaps({
    index: resourceName,
    fields: ['*'],
  });
  const { fields } = processFieldCapsResponse(fieldCapRes);

  return {
    name: resourceName,
    type: EsResourceType.indexPattern,
    fields,
    isTsdb: deriveIsTsdb(fields),
  };
};

const resolveSingleResource = async ({
  resourceName,
  resolveRes,
  esClient,
}: {
  resourceName: string;
  resolveRes: IndicesResolveIndexResponse;
  esClient: ElasticsearchClient;
}): Promise<ResolveResourceResponse> => {
  // target is an index
  if (resolveRes.indices.length > 0) {
    const indexName = resolveRes.indices[0].name;

    // CCS fallback: the _mapping API does not support remote indices,
    // so we use the CCS-compatible _field_caps API instead.
    // Trade-off: _meta.description is not available via _field_caps.
    if (isCcsTarget(resourceName)) {
      const fields = await getFieldsFromFieldCaps({ resource: indexName, esClient });
      return {
        name: resourceName,
        type: EsResourceType.index,
        fields,
        isTsdb: deriveIsTsdb(fields),
      };
    }

    const [mappingRes, settingsRes] = await Promise.all([
      getIndexMappings({ indices: [indexName], esClient, cleanup: true }),
      getIndexSettings({ indexName, esClient }),
    ]);
    const mappings = mappingRes[indexName].mappings;
    const fields = flattenMapping(mappings);
    const isTsdb = settingsRes[indexName]?.settings?.['index.mode'] === 'time_series';
    return {
      name: resourceName,
      type: EsResourceType.index,
      fields,
      description: mappings._meta?.description,
      isTsdb,
    };
  }
  // target is a datastream
  if (resolveRes.data_streams.length > 0) {
    const datastream = resolveRes.data_streams[0].name;

    // CCS fallback: _data_stream APIs (both /_mappings and the data stream definition)
    // do not support remote data streams, so we use the CCS-compatible _field_caps API
    // and fall back to the heuristic isTsdb check.
    // Trade-off: _meta.description is not available via _field_caps.
    if (isCcsTarget(resourceName)) {
      const fields = await getFieldsFromFieldCaps({ resource: datastream, esClient });
      return {
        name: resourceName,
        type: EsResourceType.dataStream,
        fields,
        isTsdb: deriveIsTsdb(fields),
      };
    }

    const [fields, dataStreamRes] = await Promise.all([
      getFieldsFromFieldCaps({ resource: datastream, esClient }),
      getDataStream({ datastreamName: datastream, esClient }),
    ]);
    return {
      name: resourceName,
      type: EsResourceType.dataStream,
      fields,
      isTsdb: isTimeseriesDataStream(dataStreamRes),
    };
  }
  // target is an alias
  if (resolveRes.aliases.length > 0) {
    const alias = resolveRes.aliases[0].name;

    const fieldCapRes = await esClient.fieldCaps({
      index: alias,
      fields: ['*'],
    });

    const { fields } = processFieldCapsResponse(fieldCapRes);

    return {
      name: resourceName,
      type: EsResourceType.alias,
      fields,
      isTsdb: deriveIsTsdb(fields),
    };
  }

  throw new Error(`No resource found for pattern ${resourceName}`);
};
