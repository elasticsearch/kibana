/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import {
  type IndicesAutocompleteResult,
  type IndexAutocompleteItem,
  type ResolveIndexResponse,
  type ESQLFieldWithMetadata,
  SOURCES_TYPES,
} from '@kbn/esql-types';
import type { EsqlFieldType, EsqlViewsResult } from '@kbn/esql-types';
import type { InferenceTaskType } from '@elastic/elasticsearch/lib/api/types';
import type {
  ESQLSourceResult,
  EsqlDatasetsResult,
  InferenceEndpointAutocompleteItem,
  InferenceEndpointsAutocompleteResult,
} from '@kbn/esql-types';
import { getListOfCCSIndices } from './lookup_utils';

export interface EsqlServiceOptions {
  client: ElasticsearchClient;
}

export class EsqlService {
  constructor(public readonly options: EsqlServiceOptions) {}

  /**
   * Get indices by their mode (lookup or time_series).
   * @param mode The mode to filter indices by.
   * @param remoteClusters Optional comma-separated list of remote clusters to include.
   * @returns A promise that resolves to the indices autocomplete result.
   */
  public async getIndicesByIndexMode(
    mode: 'lookup' | 'time_series',
    remoteClusters?: string
  ): Promise<IndicesAutocompleteResult> {
    const { client } = this.options;

    const indices: IndexAutocompleteItem[] = [];

    const sourcesToQuery = ['*'];
    const remoteClustersArray: string[] = [];
    if (remoteClusters) {
      remoteClustersArray.push(...remoteClusters.split(','));
      // attach a wildcard * for each remoteCluster
      const clustersArray = remoteClustersArray.map((cluster) => `${cluster.trim()}:*`);
      sourcesToQuery.push(...clustersArray);
    }

    // It doesn't return hidden indices
    const sources = (await client.indices.resolveIndex({
      name: sourcesToQuery,
      expand_wildcards: mode === 'lookup' ? ['open', 'closed'] : 'open',
      mode,
    })) as ResolveIndexResponse;

    const mappedMode = this.getIndexSourceType(mode);

    sources.indices?.forEach((index) => {
      indices.push({
        name: index.name,
        mode: mappedMode,
        aliases: index.aliases ?? [],
        ...(index.attributes?.includes('closed') ? { isClosed: true } : {}),
      });
    });

    sources.data_streams?.forEach((dataStream) => {
      indices.push({ name: dataStream.name, mode: mappedMode, aliases: dataStream.aliases ?? [] });
    });

    const crossClusterCommonIndices = remoteClusters
      ? getListOfCCSIndices(remoteClustersArray, indices)
      : indices;

    const result: IndicesAutocompleteResult = {
      indices: crossClusterCommonIndices,
    };

    return result;
  }

  /**
   * Get all indices, aliases, and data streams for ES|QL sources autocomplete.
   * @param scope The scope to retrieve indices for (local or all).
   * @param projectRouting Optional CPS project routing value. When provided it is forwarded
   *   directly to Elasticsearch as `project_routing` so that index resolution reflects the
   *   project picker selection or an explicit `SET project_routing` pre-statement.
   * @returns A promise that resolves to an array of ESQL source results.
   */
  public async getAllIndices(
    scope: 'local' | 'all' | 'remote' = 'local',
    projectRouting?: string
  ): Promise<ESQLSourceResult[]> {
    const { client } = this.options;

    const scopeToNames: Record<typeof scope, string[]> = {
      local: ['*'],
      remote: ['*:*'],
      all: ['*', '*:*'],
    };
    const namesToQuery = scopeToNames[scope];

    // hidden and not, important for finding timeseries mode
    // mode is not returned for time_series datastreams, we need to find it from the indices
    // which are usually hidden
    const cpsParams = projectRouting ? { project_routing: projectRouting } : {};
    const [allSources, availableSources] = (await Promise.all([
      client.indices.resolveIndex({
        name: namesToQuery,
        expand_wildcards: 'all', // this returns hidden indices too
        ...cpsParams,
      } as Parameters<typeof client.indices.resolveIndex>[0]),
      client.indices.resolveIndex({
        name: namesToQuery,
        expand_wildcards: 'open',
        ...cpsParams,
      } as Parameters<typeof client.indices.resolveIndex>[0]),
    ])) as [ResolveIndexResponse, ResolveIndexResponse];

    const suggestedIndices = this.processSuggestedIndices(availableSources.indices ?? []);
    const suggestedAliases = this.processSuggestedAliases(availableSources.aliases ?? []);
    const suggestedDataStreams = this.processSuggestedDataStreams(
      availableSources.data_streams ?? [],
      allSources.indices
    );

    return [...suggestedIndices, ...suggestedAliases, ...suggestedDataStreams];
  }

  private getIndexSourceType(mode?: string): SOURCES_TYPES {
    const modeTypeMap: Record<string, SOURCES_TYPES> = {
      time_series: SOURCES_TYPES.TIMESERIES,
      lookup: SOURCES_TYPES.LOOKUP,
    };

    return modeTypeMap[mode ?? ''] || SOURCES_TYPES.INDEX;
  }

  private processSuggestedIndices(indices: ResolveIndexResponse['indices']): ESQLSourceResult[] {
    return (
      indices?.map((index) => {
        // for remote clusters the format is cluster:indexName
        const [_, indexName] = index.name.split(':');
        return {
          name: index.name,
          type: this.getIndexSourceType(index.mode),
          // Extra hidden flag to flag system indices in the UI
          hidden: indexName?.startsWith('.') || index.name.startsWith('.'),
        };
      }) ?? []
    );
  }

  private processSuggestedAliases(aliases: ResolveIndexResponse['aliases']): ESQLSourceResult[] {
    return (
      aliases?.map((alias) => {
        // for remote clusters the format is cluster:aliasName
        const [_, aliasName] = alias.name.split(':');
        return {
          name: alias.name,
          type: SOURCES_TYPES.ALIAS,
          // Extra hidden flag to flag system aliases in the UI
          hidden: aliasName?.startsWith('.') || alias.name.startsWith('.'),
        };
      }) ?? []
    );
  }

  private processSuggestedDataStreams(
    dataStreams: ResolveIndexResponse['data_streams'],
    indices: ResolveIndexResponse['indices']
  ): ESQLSourceResult[] {
    const indexModeMap = new Map(indices?.map((idx) => [idx.name, idx.mode]) ?? []);

    return (
      dataStreams?.map((dataStream) => {
        const backingIndices = dataStream.backing_indices || [];
        // Determine if any of the backing indices are time_series
        const isTimeSeries = backingIndices.some(
          (indexName) => indexModeMap.get(indexName) === 'time_series'
        );
        return {
          name: dataStream.name,
          type: isTimeSeries ? SOURCES_TYPES.TIMESERIES : SOURCES_TYPES.DATA_STREAM,
          // Extra hidden flag to flag system data streams in the UI
          hidden: dataStream.name.startsWith('.'),
        };
      }) ?? []
    );
  }

  /**
   * Get all ES|QL views from the cluster (GET _query/view).
   * @returns A promise that resolves to the views response (list of view names and queries).
   */
  public async getViews(): Promise<EsqlViewsResult> {
    const { client } = this.options;
    const response = await client.transport.request<{
      views: Array<{ name: string; query: string }>;
    }>({
      method: 'GET',
      path: '/_query/view',
    });
    return response ?? { views: [] };
  }

  /**
   * Get all ES|QL datasets from the cluster (GET _query/dataset).
   * @returns A promise that resolves to the datasets response.
   */
  public async getDatasets(): Promise<EsqlDatasetsResult> {
    const { client } = this.options;
    const response = await client.transport.request<EsqlDatasetsResult>({
      method: 'GET',
      path: '/_query/dataset',
    });
    return response ?? { datasets: [] };
  }

  /**
   * Get inference endpoints for a specific task type.
   * @param taskType The type of inference task to retrieve endpoints for.
   * @returns A promise that resolves to the inference endpoints autocomplete result.
   */
  public async getInferenceEndpoints(
    taskType: string
  ): Promise<InferenceEndpointsAutocompleteResult> {
    const { client } = this.options;

    // The ES client's InferenceTaskType union can lag behind ES (e.g. new
    // task types ship on the server before appearing in the client types).
    // ES itself validates the value and rejects unknown task types.
    const { endpoints } = await client.inference.get({
      inference_id: '_all',
      task_type: taskType as InferenceTaskType,
    });

    return {
      inferenceEndpoints: endpoints.map(
        (endpoint): InferenceEndpointAutocompleteItem => ({
          inference_id: endpoint.inference_id,
          task_type: endpoint.task_type,
        })
      ),
    };
  }

  /**
   * Get enrich policies formatted for ES|QL autocomplete.
   * @returns A promise that resolves to an array of enrich policy objects.
   */
  public async getPolicies(): Promise<
    Array<{
      name: string;
      sourceIndices: string[];
      matchField: string;
      enrichFields: string[];
    }>
  > {
    const { client } = this.options;

    const response = await client.enrich.getPolicy();
    return response.policies.flatMap((p) => {
      const config = p.config.match ?? p.config.range ?? p.config.geo_match;
      if (!config?.name) return [];
      return [
        {
          name: config.name,
          sourceIndices: config.indices as string[],
          matchField: config.match_field,
          enrichFields: config.enrich_fields as string[],
        },
      ];
    });
  }

  /**
   * Get columns for an ES|QL query by executing it with LIMIT 0.
   * @param esqlQuery The ES|QL query to get columns for.
   * @returns A promise that resolves to an array of ESQLFieldWithMetadata.
   */
  public async getColumns(esqlQuery: string): Promise<ESQLFieldWithMetadata[]> {
    const { client } = this.options;

    const response = await client.esql.query({
      query: `${esqlQuery} | LIMIT 0`,
      format: 'json',
    });

    return (
      (response.columns as Array<{ name: string; type: string }>)?.map((c) => ({
        name: c.name,
        type: c.type as EsqlFieldType,
        hasConflict: false,
        userDefined: false,
      })) ?? []
    );
  }
}
