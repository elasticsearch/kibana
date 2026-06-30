/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { Logger } from '@kbn/logging';
import { EsResourceType } from '@kbn/agent-builder-common';
import type { ScopedModel } from '@kbn/agent-builder-server';
import type { BaseMessageLike } from '@langchain/core/messages';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type {
  AliasSearchSource,
  DataStreamSearchSource,
  DatasetSearchSource,
  IndexSearchSource,
} from './steps/list_search_sources';
import { listSearchSources } from './steps/list_search_sources';
import { flattenMapping, getDataStreamMappings } from './utils/mappings';
import { getIndexFields, partitionByCcs, getBatchedFieldsFromFieldCaps } from './utils/ccs';
import { getDatasetFields } from './utils/datasets';

export interface RelevantResource {
  type: EsResourceType;
  name: string;
  reason: string;
}

export interface IndexExplorerResponse {
  resources: RelevantResource[];
}

export interface ResourceFieldDescriptor {
  path: string;
  type: string;
}

export interface ResourceDescriptor {
  type: EsResourceType;
  name: string;
  description?: string;
  fields?: ResourceFieldDescriptor[];
}

const truncateList = (fields: string[], max: number): string[] => {
  if (fields.length <= max) {
    return fields;
  }
  return [...fields.slice(0, max), `[and ${fields.length - max} more]`];
};

/**
 * Builds resource descriptors for a list of indices by delegating
 * the local-vs-CCS field resolution to {@link getIndexFields}.
 */
const createIndexSummaries = async ({
  indices,
  esClient,
}: {
  indices: IndexSearchSource[];
  esClient: ElasticsearchClient;
}): Promise<ResourceDescriptor[]> => {
  const indexFields = await getIndexFields({
    indices: indices.map((i) => i.name),
    esClient,
  });

  return indices.map(({ name }) => {
    const entry = indexFields[name];
    return {
      type: EsResourceType.index,
      name,
      description: entry?.rawMapping?._meta?.description,
      fields: (entry?.fields ?? []).map((f) => ({ path: f.path, type: f.type })),
    };
  });
};

const createAliasSummaries = async ({
  aliases,
}: {
  aliases: AliasSearchSource[];
}): Promise<ResourceDescriptor[]> => {
  // for now aliases are only described by the list of indices they target
  return aliases.map<ResourceDescriptor>(({ name: aliasName, indices }) => {
    return {
      type: EsResourceType.alias,
      name: aliasName,
      description: `Point to the following indices: ${truncateList(indices, 20).join(', ')}`,
    };
  });
};

const createDatastreamSummaries = async ({
  datastreams,
  esClient,
}: {
  datastreams: DataStreamSearchSource[];
  esClient: ElasticsearchClient;
}): Promise<ResourceDescriptor[]> => {
  const { local, remote } = partitionByCcs(datastreams);
  const descriptors: ResourceDescriptor[] = [];

  // Local data streams: use _data_stream/_mappings API (full mapping tree + _meta.description)
  if (local.length > 0) {
    const allMappings = await getDataStreamMappings({
      datastreams: local.map((stream) => stream.name),
      cleanup: true,
      esClient,
    });

    for (const { name } of local) {
      const mappings = allMappings[name];
      const flattened = flattenMapping(mappings.mappings);
      descriptors.push({
        type: EsResourceType.dataStream,
        name,
        description: mappings?.mappings._meta?.description,
        fields: flattened.map((field) => ({ path: field.path, type: field.type })),
      });
    }
  }

  // Remote (CCS) data streams: single batched _field_caps request, then split per data stream
  if (remote.length > 0) {
    const fieldsByDs = await getBatchedFieldsFromFieldCaps({
      resources: remote.map((r) => r.name),
      esClient,
    });

    for (const { name } of remote) {
      descriptors.push({
        type: EsResourceType.dataStream,
        name,
        fields: (fieldsByDs[name] ?? []).map((f) => ({ path: f.path, type: f.type })),
      });
    }
  }

  return descriptors;
};

/**
 * Builds resource descriptors for a list of external ES|QL datasets by introspecting their
 * columns via `FROM <name> | LIMIT 0` (datasets have no mappings or field caps).
 */
const createDatasetSummaries = async ({
  datasets,
  esClient,
}: {
  datasets: DatasetSearchSource[];
  esClient: ElasticsearchClient;
}): Promise<ResourceDescriptor[]> => {
  return Promise.all(
    datasets.map(async ({ name, data_source: dataSource, resource }) => {
      const fields = await getDatasetFields({ name, esClient });
      return {
        type: EsResourceType.dataset,
        name,
        description: `External ES|QL dataset (data source: ${dataSource}, resource: ${resource}). Query with ES|QL "FROM ${name}".`,
        fields: fields.map((f) => ({ path: f.path, type: f.type })),
      };
    })
  );
};

/**
 * Builds resource descriptors for a pre-fetched set of search sources.
 * Splits the work per source type and optionally skips aliases / data streams.
 */
const buildResourceDescriptors = async ({
  sources,
  includeAliases,
  includeDatastream,
  includeDatasets,
  esClient,
}: {
  sources: Awaited<ReturnType<typeof listSearchSources>>;
  includeAliases: boolean;
  includeDatastream: boolean;
  includeDatasets: boolean;
  esClient: ElasticsearchClient;
}): Promise<ResourceDescriptor[]> => {
  const resources: ResourceDescriptor[] = [];
  if (sources.indices.length > 0) {
    resources.push(...(await createIndexSummaries({ indices: sources.indices, esClient })));
  }
  if (sources.data_streams.length > 0 && includeDatastream) {
    resources.push(
      ...(await createDatastreamSummaries({ datastreams: sources.data_streams, esClient }))
    );
  }
  if (sources.aliases.length > 0 && includeAliases) {
    resources.push(...(await createAliasSummaries({ aliases: sources.aliases })));
  }
  if (sources.datasets.length > 0 && includeDatasets) {
    resources.push(...(await createDatasetSummaries({ datasets: sources.datasets, esClient })));
  }
  return resources;
};

/**
 * Gathers resource descriptors (with field names and types) for all resources
 * matching the given pattern.
 */
export const gatherResourceDescriptors = async ({
  indexPattern = '*',
  includeAliases = true,
  includeDatastream = true,
  includeDatasets = false,
  esClient,
}: {
  indexPattern?: string;
  includeAliases?: boolean;
  includeDatastream?: boolean;
  includeDatasets?: boolean;
  esClient: ElasticsearchClient;
}): Promise<ResourceDescriptor[]> => {
  const sources = await listSearchSources({
    pattern: indexPattern,
    excludeIndicesRepresentedAsDatastream: true,
    excludeIndicesRepresentedAsAlias: false,
    includeDatasets,
    esClient,
  });

  return buildResourceDescriptors({
    sources,
    includeAliases,
    includeDatastream,
    includeDatasets,
    esClient,
  });
};

export const indexExplorer = async ({
  nlQuery,
  indexPattern = '*',
  includeAliases = true,
  includeDatastream = true,
  includeDatasets = false,
  limit = 1,
  esClient,
  model,
  logger,
}: {
  nlQuery: string;
  indexPattern?: string;
  includeAliases?: boolean;
  includeDatastream?: boolean;
  includeDatasets?: boolean;
  limit?: number;
  esClient: ElasticsearchClient;
  model: ScopedModel;
  logger?: Logger;
}): Promise<IndexExplorerResponse> => {
  logger?.trace(() => `index_explorer - query="${nlQuery}", pattern="${indexPattern}"`);

  const sources = await listSearchSources({
    pattern: indexPattern,
    excludeIndicesRepresentedAsDatastream: true,
    excludeIndicesRepresentedAsAlias: false,
    includeDatasets,
    esClient,
  });

  const indexCount = sources.indices.length;
  const aliasCount = sources.aliases.length;
  const dataStreamCount = sources.data_streams.length;
  const datasetCount = includeDatasets ? sources.datasets.length : 0;
  const totalCount = indexCount + aliasCount + dataStreamCount + datasetCount;

  logger?.trace(
    () =>
      `index_explorer - found ${indexCount} indices, ${aliasCount} aliases, ${dataStreamCount} datastreams, ${datasetCount} datasets for query="${nlQuery}"`
  );

  if (totalCount <= limit) {
    return {
      resources: [
        ...sources.indices,
        ...sources.aliases,
        ...sources.data_streams,
        ...(includeDatasets ? sources.datasets : []),
      ].map((resource) => {
        return {
          type: resource.type,
          name: resource.name,
          reason: `Index pattern matched less resources that the specified limit of ${limit}.`,
        };
      }),
    };
  }

  const resources = await buildResourceDescriptors({
    sources,
    includeAliases,
    includeDatastream,
    includeDatasets,
    esClient,
  });

  const selectedResources = await selectResources({
    resources,
    nlQuery,
    model,
    limit,
  });

  return { resources: selectedResources };
};

export interface SelectedResource {
  type: EsResourceType;
  name: string;
  reason: string;
}

export const formatResource = (res: ResourceDescriptor): string => {
  const allFields = res.fields ?? [];
  const topFields = allFields.slice(0, 10);
  const formatted = topFields.map((f) => `${f.path} [${f.type}]`);
  if (allFields.length > 10) {
    formatted.push(`[and ${allFields.length - 10} more]`);
  }
  const description = res.description ? `: ${res.description}` : '';
  const fields = formatted.length > 0 ? `\n  fields: ${formatted.join(', ')}` : '';
  return `- ${res.name} (${res.type})${description}${fields}`;
};

export const createIndexSelectorPrompt = ({
  resources,
  nlQuery,
  limit = 1,
}: {
  resources: ResourceDescriptor[];
  nlQuery: string;
  limit?: number;
}): BaseMessageLike[] => {
  return [
    [
      'system',
      `You are an AI assistant for Elasticsearch. Your task is to select the most relevant Elasticsearch resources based on a user query.

## CRITICAL INSTRUCTIONS

You MUST call the 'select_resources' tool. Do NOT respond with text or explanations.

## Tool Schema

The 'select_resources' tool expects this exact structure:
{
  "targets": [
    {
      "name": "resource_name",
      "type": "index" | "alias" | "data_stream" | "dataset",
      "reason": "why this resource is relevant"
    }
  ]
}

## Rules

1. ALWAYS call the 'select_resources' tool - never respond with plain text
2. The 'targets' property MUST be an array at the root level
3. Select at most ${limit} resource(s)
4. If no resources match, call the tool with: {"targets": []}
5. Each target must have: "name", "type", and "reason" fields
`,
    ],
    [
      'human',
      `## Query

"${nlQuery}"

## Available Resources

<available_resources>
${resources.map(formatResource).join('\n')}
</available_resources>

Call the 'select_resources' tool now with your selection. Maximum ${limit} target(s). Use an empty targets array if none match.`,
    ],
  ];
};

const selectResources = async ({
  resources,
  nlQuery,
  model,
  limit = 1,
}: {
  resources: ResourceDescriptor[];
  nlQuery: string;
  model: ScopedModel;
  limit?: number;
}): Promise<SelectedResource[]> => {
  const { chatModel } = model;
  const indexSelectorModel = chatModel.withStructuredOutput(
    z
      .object({
        targets: z
          .array(
            z.object({
              reason: z
                .string()
                .describe('brief explanation of why this resource could be relevant'),
              type: z
                .enum([
                  EsResourceType.index,
                  EsResourceType.alias,
                  EsResourceType.dataStream,
                  EsResourceType.dataset,
                ])
                .describe('the type of the resource'),
              name: z.string().describe('name of the resource'),
            })
          )
          .default([])
          .describe(
            'The list of selected resources (indices, aliases, datastreams and/or datasets). Must be an array. Use an empty array if no resources match.'
          ),
      })
      .describe('Tool to select the relevant Elasticsearch resources to search against'),
    { name: 'select_resources' }
  );

  const promptContent = createIndexSelectorPrompt({
    resources,
    nlQuery,
    limit,
  });

  const response = await indexSelectorModel.invoke(promptContent);
  // Handle case where response might be malformed or targets is not an array
  return Array.isArray(response?.targets) ? response.targets : [];
};
