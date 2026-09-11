/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject } from 'rxjs';
import { bufferTime, filter as rxFilter, concatMap } from 'rxjs';
import { reject, isUndefined, isNumber, pick, isEmpty, get } from 'lodash';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import util from 'util';
import type { estypes } from '@elastic/elasticsearch';
import type { KueryNode } from '@kbn/es-query';
import { fromKueryExpression, toElasticsearchQuery, nodeBuilder } from '@kbn/es-query';
import type { BulkResponse, long } from '@elastic/elasticsearch/lib/api/types';
import type { IEvent, IValidatedEvent } from '../types';
import { SAVED_OBJECT_REL_PRIMARY } from '../types';
import type {
  AggregateOptionsType,
  FindOptionsType,
  QueryOptionsType,
  FindOptionsSearchAfterType,
} from '../event_log_client';
import type { ParsedIndexAlias } from './init';
import type { EsNames } from './names';

export const EVENT_BUFFER_TIME = 1000; // milliseconds
export const EVENT_BUFFER_LENGTH = 100;

export type IClusterClientAdapter = PublicMethodsOf<ClusterClientAdapter>;

export interface InternalFields {
  _id: string;
  _index: string;
  _seq_no: number;
  _primary_term: number;
}

export interface Doc {
  index: string;
  body: IEvent;
  internalFields?: InternalFields;
}

export type DocWithOptionalId = Doc & {
  id?: string;
};

type Wait = () => Promise<boolean>;

export interface ConstructorOpts {
  logger: Logger;
  elasticsearchClientPromise: Promise<ElasticsearchClient>;
  esNames: EsNames;
  wait: Wait;
}

export type IValidatedEventInternalDocInfo = IValidatedEvent & {
  _id: estypes.Id;
  _index: estypes.IndexName;
  _seq_no: estypes.SequenceNumber;
  _primary_term: long;
};

export interface QueryEventsBySavedObjectResult {
  page: number;
  per_page: number;
  total: number;
  data: IValidatedEventInternalDocInfo[];
}

interface QueryOptionsEventsBySavedObjectFilter {
  index: string;
  namespace: string | undefined;
  type: string;
  ids: string[];
  legacyIds?: string[];
}

interface QueryOptionsEventsWithAuthFilter {
  index: string;
  namespace: string | undefined;
  type: string;
  ids: string[];
  authFilter: KueryNode;
}

export interface AggregateEventsWithAuthFilter {
  index: string;
  namespaces?: Array<string | undefined>;
  type: string;
  authFilter: KueryNode;
  aggregateOptions: AggregateOptionsType;
  includeSpaceAgnostic?: boolean;
}

export type FindEventsOptionsWithAuthFilter = QueryOptionsEventsWithAuthFilter & {
  findOptions: FindOptionsType;
};

export type FindEventsOptionsBySavedObjectFilter = QueryOptionsEventsBySavedObjectFilter & {
  findOptions: FindOptionsType;
};

export type FindEventsOptionsSearchAfter = QueryOptionsEventsBySavedObjectFilter & {
  findOptions: FindOptionsSearchAfterType;
};

export type AggregateEventsOptionsBySavedObjectFilter = QueryOptionsEventsBySavedObjectFilter & {
  aggregateOptions: AggregateOptionsType;
};

export interface AggregateEventsBySavedObjectResult {
  hits?: estypes.SearchHitsMetadata<unknown>;
  aggregations: Record<string, estypes.AggregationsAggregate> | undefined;
}

type GetQueryBodyWithAuthFilterOpts =
  | (FindEventsOptionsWithAuthFilter & {
      namespaces: AggregateEventsWithAuthFilter['namespaces'];
      includeSpaceAgnostic?: AggregateEventsWithAuthFilter['includeSpaceAgnostic'];
    })
  | AggregateEventsWithAuthFilter;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AliasAny = any;

const LEGACY_ID_CUTOFF_VERSION = '8.0.0';

export interface QueryEventsBySavedObjectSearchAfterResult {
  data: IValidatedEventInternalDocInfo[];
  total: number;
  search_after?: estypes.SortResults;
  pit_id?: string;
}

export interface SoftDeleteByQueryParams {
  query: estypes.QueryDslQueryContainer;
  field: string;
  conflicts?: estypes.Conflicts;
  slices?: estypes.Slices;
  requestsPerSecond?: number;
}

export class ClusterClientAdapter<
  TDoc extends {
    body: AliasAny;
    id?: string;
    index: string;
    internalFields?: InternalFields;
  } = Doc
> {
  private readonly logger: Logger;
  private readonly elasticsearchClientPromise: Promise<ElasticsearchClient>;
  private readonly docBuffer$: Subject<TDoc>;
  private readonly wait: Wait;
  private readonly docsBufferedFlushed: Promise<void>;
  private readonly esNames: EsNames;

  constructor(opts: ConstructorOpts) {
    this.logger = opts.logger;
    this.elasticsearchClientPromise = opts.elasticsearchClientPromise;
    this.esNames = opts.esNames;
    this.wait = opts.wait;
    this.docBuffer$ = new Subject<TDoc>();

    // buffer event log docs for time / buffer length, ignore empty
    // buffers, then index the buffered docs; kick things off with a
    // promise on the observable, which we'll wait on in shutdown
    this.docsBufferedFlushed = this.docBuffer$
      .pipe(
        bufferTime(EVENT_BUFFER_TIME, null, EVENT_BUFFER_LENGTH),
        rxFilter((docs) => docs.length > 0),
        concatMap(async (docs) => await this.indexDocuments(docs))
      )
      .toPromise();
  }

  // This will be called at plugin stop() time; the assumption is any plugins
  // depending on the event_log will already be stopped, and so will not be
  // writing more event docs.  We complete the docBuffer$ observable,
  // and wait for the docsBufffered$ observable to complete via it's promise,
  // and so should end up writing all events out that pass through, before
  // Kibana shuts down (cleanly).
  public async shutdown(): Promise<void> {
    this.docBuffer$.complete();
    await this.docsBufferedFlushed;
  }

  public async updateDocuments(docs: Array<Required<TDoc>>): Promise<BulkResponse> {
    const esClient = await this.elasticsearchClientPromise;
    try {
      const bulkBody: Array<Record<string, unknown>> = [];

      for (const doc of docs) {
        if (!doc.internalFields) {
          throw new Error('Internal fields are required');
        }

        bulkBody.push({
          update: {
            _id: doc.internalFields._id,
            _index: doc.internalFields._index,
            if_primary_term: doc.internalFields._primary_term,
            if_seq_no: doc.internalFields._seq_no,
          },
        });
        bulkBody.push({ doc: doc.body });
      }

      const response = await esClient.bulk({
        body: bulkBody,
      });

      if (response.errors) {
        const error = new Error('Error updating some bulk events');
        error.stack +=
          '\n' +
          util.inspect(
            response.items.filter((item) => 'error' in item),
            { depth: null }
          );
        this.logger.error(error);
      }

      return response;
    } catch (e) {
      this.logger.error(
        `error updating events in bulk: "${e.message}"; docs: ${JSON.stringify(docs)}`
      );
      throw e;
    }
  }

  public indexDocument(doc: TDoc): void {
    this.docBuffer$.next(doc);
  }

  async indexDocuments(docs: TDoc[]): Promise<void> {
    // If es initialization failed, don't try to index.
    // Also, don't log here, we log the failure case in plugin startup
    // instead, otherwise we'd be spamming the log (if done here)
    if (!(await this.wait())) {
      this.logger.debug(`Initialization failed, not indexing ${docs.length} documents`);
      return;
    }

    this.logger.debug(`Indexing ${docs.length} documents`);

    const bulkBody: Array<Record<string, unknown>> = [];

    for (const doc of docs) {
      if (doc.body === undefined) continue;

      if (doc.id) {
        bulkBody.push({ create: { _id: doc.id } });
      } else {
        bulkBody.push({ create: {} });
      }

      bulkBody.push(doc.body);
    }

    try {
      const esClient = await this.elasticsearchClientPromise;
      const response = await esClient.bulk({
        index: this.esNames.dataStream,
        body: bulkBody,
      });

      if (response.errors) {
        const error = new Error('Error writing some bulk events');
        error.stack += '\n' + util.inspect(response.items, { depth: null });
        this.logger.error(error);
      }
    } catch (err) {
      this.logger.error(
        `error writing bulk events: "${err.message}"; docs: ${JSON.stringify(bulkBody)}`
      );
    }
  }

  public async doesIndexTemplateExist(name: string): Promise<boolean> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      const indexTemplateResult = await esClient.indices.existsIndexTemplate({ name });
      return indexTemplateResult as boolean;
    } catch (err) {
      throw new Error(`error checking existence of index template: ${err.message}`);
    }
  }

  public async createIndexTemplate(name: string, template: Record<string, unknown>): Promise<void> {
    this.logger.info(`Installing index template ${name}`);

    try {
      const esClient = await this.elasticsearchClientPromise;
      await esClient.indices.putIndexTemplate({
        name,
        body: template,
        create: true,
      });
    } catch (err) {
      // The error message doesn't have a type attribute we can look to guarantee it's due
      // to the template already existing (only long message) so we'll check ourselves to see
      // if the template now exists. This scenario would happen if you startup multiple Kibana
      // instances at the same time.
      const existsNow = await this.doesIndexTemplateExist(name);
      if (!existsNow) {
        const error = new Error(`error creating index template: ${err.message}`);
        Object.assign(error, { wrapped: err });
        throw error;
      }
    }
  }

  public async updateIndexTemplate(name: string, template: Record<string, unknown>): Promise<void> {
    this.logger.info(`Updating index template ${name}`);

    try {
      const esClient = await this.elasticsearchClientPromise;

      // Simulate the index template to proactively identify any issues with the mappings
      const simulateResponse = await esClient.indices.simulateTemplate({ name, body: template });
      const mappings: estypes.MappingTypeMapping = simulateResponse.template.mappings;

      if (isEmpty(mappings)) {
        throw new Error(
          `No mappings would be generated for ${template.name}, possibly due to failed/misconfigured bootstrapping`
        );
      }
      await esClient.indices.putIndexTemplate({ name, body: template });
    } catch (err) {
      this.logger.error(`Error updating index template ${name}: ${err.message}`);
      throw err;
    }
  }

  public async getExistingLegacyIndexTemplates(
    indexTemplatePattern: string
  ): Promise<estypes.IndicesGetTemplateResponse> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      return await esClient.indices.getTemplate({ name: indexTemplatePattern }, { ignore: [404] });
    } catch (err) {
      throw new Error(`error getting existing legacy index templates: ${err.message}`);
    }
  }

  public async setLegacyIndexTemplateToHidden(
    indexTemplateName: string,
    currentIndexTemplate: estypes.IndicesTemplateMapping
  ): Promise<void> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      await esClient.indices.putTemplate({
        name: indexTemplateName,
        ...currentIndexTemplate,
        settings: {
          ...currentIndexTemplate.settings,
          'index.hidden': true,
        },
      });
    } catch (err) {
      throw new Error(
        `error setting existing legacy index template ${indexTemplateName} to hidden: ${err.message}`
      );
    }
  }

  public async getExistingIndices(
    indexPattern: string
  ): Promise<estypes.IndicesGetSettingsResponse> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      return await esClient.indices.getSettings({ index: indexPattern }, { ignore: [404] });
    } catch (err) {
      throw new Error(
        `error getting existing indices matching pattern ${indexPattern}: ${err.message}`
      );
    }
  }

  public async setIndexToHidden(indexName: string): Promise<void> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      await esClient.indices.putSettings({
        index: indexName,
        settings: {
          index: { hidden: true },
        },
      });
    } catch (err) {
      throw new Error(`error setting existing index ${indexName} to hidden: ${err.message}`);
    }
  }

  public async getExistingIndexAliases(
    indexPattern: string
  ): Promise<estypes.IndicesGetAliasResponse> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      return await esClient.indices.getAlias({ index: indexPattern }, { ignore: [404] });
    } catch (err) {
      throw new Error(
        `error getting existing index aliases matching pattern ${indexPattern}: ${err.message}`
      );
    }
  }

  public async setIndexAliasToHidden(
    aliasName: string,
    currentAliasData: ParsedIndexAlias[]
  ): Promise<void> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      await esClient.indices.updateAliases({
        actions: currentAliasData.map((aliasData) => {
          const existingAliasOptions = pick(aliasData, [
            'is_write_index',
            'filter',
            'index_routing',
            'routing',
            'search_routing',
          ]);
          return {
            add: {
              ...existingAliasOptions,
              index: aliasData.indexName,
              alias: aliasName,
              is_hidden: true,
            },
          };
        }),
      });
    } catch (err) {
      throw new Error(
        `error setting existing index aliases for alias ${aliasName} to is_hidden: ${err.message}`
      );
    }
  }

  public async doesDataStreamExist(name: string): Promise<boolean> {
    try {
      const esClient = await this.elasticsearchClientPromise;
      const body = await esClient.indices.getDataStream({ name, expand_wildcards: 'all' });
      return body.data_streams.length > 0;
    } catch (err) {
      if (err.meta?.statusCode === 404) {
        return false;
      }

      throw new Error(`error checking existance of data stream: ${err.message}`);
    }
  }

  public async createDataStream(name: string): Promise<void> {
    this.logger.info(`Creating datastream ${name}`);
    try {
      const esClient = await this.elasticsearchClientPromise;
      await esClient.indices.createDataStream({ name });
    } catch (err) {
      if (err.body?.error?.type !== 'resource_already_exists_exception') {
        throw new Error(`error creating data stream: ${err.message}`);
      }
    }
  }

  public async updateConcreteIndices(name: string): Promise<void> {
    this.logger.info(`Updating concrete index mappings for ${name}`);
    try {
      const esClient = await this.elasticsearchClientPromise;
      const simulatedIndexMapping = await esClient.indices.simulateIndexTemplate({ name });
      const simulatedMapping = get(simulatedIndexMapping, ['template', 'mappings']);

      if (simulatedMapping != null) {
        await esClient.indices.putMapping({ index: name, ...simulatedMapping });
        this.logger.debug(`Successfully updated concrete index mappings for ${name}`);
      }
    } catch (err) {
      this.logger.error(`Error updating index mappings for ${name}: ${err.message}`);
      throw err;
    }
  }

  public async queryEventsBySavedObjects(
    queryOptions: FindEventsOptionsBySavedObjectFilter
  ): Promise<QueryEventsBySavedObjectResult> {
    const { index, type, ids, findOptions } = queryOptions;
    const { page, per_page: perPage, sort } = findOptions;

    const esClient = await this.elasticsearchClientPromise;

    const query = getQueryBody(
      this.logger,
      queryOptions,
      pick(queryOptions.findOptions, ['start', 'end', 'filter'])
    );

    const body: estypes.SearchRequest = {
      size: perPage,
      from: (page - 1) * perPage,
      query,
      ...(sort
        ? { sort: sort.map((s) => ({ [s.sort_field]: { order: s.sort_order } })) as estypes.Sort }
        : {}),
    };
    try {
      const {
        hits: { hits, total },
      } = await esClient.search<IValidatedEventInternalDocInfo>({
        index,
        track_total_hits: true,
        seq_no_primary_term: true,
        ...body,
      });

      return {
        page,
        per_page: perPage,
        total: isNumber(total) ? total : total!.value,
        data: hits.map((hit) => ({
          ...hit._source,
          _id: hit._id!,
          _index: hit._index,
          _seq_no: hit._seq_no!,
          _primary_term: hit._primary_term!,
        })),
      };
    } catch (err) {
      throw new Error(
        `querying for Event Log by for type "${type}" and ids "${ids}" failed with: ${err.message}`
      );
    }
  }

  public async queryEventsByDocumentIds(
    docs: Array<{ _id: string; _index: string }>
  ): Promise<Pick<QueryEventsBySavedObjectResult, 'data'>> {
    const esClient = await this.elasticsearchClientPromise;

    try {
      const response = await esClient.mget<IValidatedEventInternalDocInfo>({
        docs,
      });

      const data = [];

      for (const hit of response.docs) {
        if ('error' in hit) {
          this.logger.error(`Event not found: ${hit._id}, with error: ${hit.error.reason}`);
          continue;
        }
        if (!('found' in hit) || !hit.found) {
          this.logger.error(`Event not found: ${hit._id}`);
          continue;
        }
        data.push({
          ...hit._source,
          _id: hit._id!,
          _index: hit._index,
          _seq_no: hit._seq_no!,
          _primary_term: hit._primary_term!,
        });
      }

      return {
        data,
      };
    } catch (err) {
      throw new Error(`error querying events by document ids: ${err.message}`);
    }
  }

  public async queryEventsWithAuthFilter(
    queryOptions: FindEventsOptionsWithAuthFilter
  ): Promise<QueryEventsBySavedObjectResult> {
    const { index, type, ids, findOptions } = queryOptions;
    const { page, per_page: perPage, sort } = findOptions;

    const esClient = await this.elasticsearchClientPromise;

    const query = getQueryBodyWithAuthFilter(
      this.logger,
      { ...queryOptions, namespaces: [queryOptions.namespace] },
      pick(queryOptions.findOptions, ['start', 'end', 'filter'])
    );

    const body: estypes.SearchRequest = {
      size: perPage,
      from: (page - 1) * perPage,
      query,
      ...(sort
        ? { sort: sort.map((s) => ({ [s.sort_field]: { order: s.sort_order } })) as estypes.Sort }
        : {}),
    };

    try {
      const {
        hits: { hits, total },
      } = await esClient.search<IValidatedEventInternalDocInfo>({
        index,
        track_total_hits: true,
        ...body,
        seq_no_primary_term: true,
      });
      return {
        page,
        per_page: perPage,
        total: isNumber(total) ? total : total!.value,
        data: hits.map((hit) => ({
          ...hit._source,
          _id: hit._id!,
          _index: hit._index,
          _seq_no: hit._seq_no!,
          _primary_term: hit._primary_term!,
        })),
      };
    } catch (err) {
      throw new Error(
        `querying for Event Log by for type "${type}" and ids "${ids}" failed with: ${err.message}`
      );
    }
  }

  public async aggregateEventsBySavedObjects(
    queryOptions: AggregateEventsOptionsBySavedObjectFilter
  ): Promise<AggregateEventsBySavedObjectResult> {
    const { index, type, ids, aggregateOptions } = queryOptions;
    const { aggs } = aggregateOptions;

    const esClient = await this.elasticsearchClientPromise;

    const query = getQueryBody(
      this.logger,
      queryOptions,
      pick(queryOptions.aggregateOptions, ['start', 'end', 'filter'])
    );

    const body: estypes.SearchRequest = {
      size: 0,
      query,
      aggs,
    };

    try {
      const { aggregations, hits } = await esClient.search<IValidatedEvent>({
        index,
        ...body,
      });
      return {
        aggregations,
        hits,
      };
    } catch (err) {
      throw new Error(
        `querying for Event Log by for type "${type}" and ids "${ids}" failed with: ${err.message}`
      );
    }
  }

  public async aggregateEventsWithAuthFilter(
    queryOptions: AggregateEventsWithAuthFilter
  ): Promise<AggregateEventsBySavedObjectResult> {
    const { index, type, aggregateOptions } = queryOptions;
    const { aggs } = aggregateOptions;

    const esClient = await this.elasticsearchClientPromise;

    const query = getQueryBodyWithAuthFilter(
      this.logger,
      queryOptions,
      pick(queryOptions.aggregateOptions, ['start', 'end', 'filter'])
    );

    const body: estypes.SearchRequest = {
      size: 0,
      query,
      aggs,
    };
    try {
      const { aggregations, hits } = await esClient.search<IValidatedEvent>({
        index,
        ...body,
      });
      return {
        aggregations,
        hits,
      };
    } catch (err) {
      this.logger.debug(
        `querying for Event Log by for type "${type}" and auth filter failed with: ${err.message}`
      );
      throw err;
    }
  }

  public async refreshIndex(): Promise<void> {
    try {
      const esClient = await this.elasticsearchClientPromise;

      await esClient.indices.refresh({
        index: this.esNames.dataStream,
      });
    } catch (err) {
      this.logger.error(`error refreshing index: ${err.message}`);
      throw err;
    }
  }

  public async queryEventsBySavedObjectsSearchAfter(
    queryOptions: FindEventsOptionsSearchAfter
  ): Promise<QueryEventsBySavedObjectSearchAfterResult> {
    const { index, type, ids, findOptions } = queryOptions;
    const {
      per_page: perPage,
      sort,
      pit_id: existingPitId,
      search_after: searchAfter,
    } = findOptions;

    const esClient = await this.elasticsearchClientPromise;

    let pitId = existingPitId;
    // Create new PIT if not provided
    if (!pitId) {
      const pitResponse = await esClient.openPointInTime({
        index,
        keep_alive: '1m',
      });
      pitId = pitResponse.id;
    }

    const query = getQueryBody(
      this.logger,
      queryOptions,
      pick(queryOptions.findOptions, ['start', 'end', 'filter'])
    );

    const body: estypes.SearchRequest = {
      size: perPage,
      query,
      pit: {
        id: pitId,
        keep_alive: '1m',
      },
      ...(sort
        ? { sort: sort.map((s) => ({ [s.sort_field]: { order: s.sort_order } })) as estypes.Sort }
        : { sort: [{ '@timestamp': { order: 'desc' } }, { _id: { order: 'desc' } }] }), // default sort
      ...(searchAfter ? { search_after: searchAfter } : {}),
    };

    try {
      const {
        hits: { hits, total },
        pit_id: returnedPit,
      } = await esClient.search<IValidatedEventInternalDocInfo>({
        ...body,
        track_total_hits: true,
        seq_no_primary_term: true,
      });

      if (returnedPit && returnedPit !== pitId) {
        pitId = returnedPit;
      }

      // Get the sort values from the last hit to use as search_after for next page
      const lastHit = hits[hits.length - 1];
      const nextSearchAfter = lastHit?.sort;

      return {
        data: hits.map((hit) => ({
          ...hit._source,
          _id: hit._id!,
          _index: hit._index,
          _seq_no: hit._seq_no!,
          _primary_term: hit._primary_term!,
        })),
        total: isNumber(total) ? total : total!.value,
        search_after: nextSearchAfter,
        pit_id: pitId,
      };
    } catch (err) {
      try {
        if (pitId) {
          await esClient.closePointInTime({ id: pitId });
        }
      } catch (closeErr) {
        this.logger.error(`Failed to close point in time: ${closeErr.message}`);
      }

      throw new Error(
        `querying for Event Log by for type "${type}" and ids "${ids}" failed with: ${err.message}`
      );
    }
  }

  public async closePointInTime(pitId: string): Promise<void> {
    if (!pitId) return;

    try {
      const esClient = await this.elasticsearchClientPromise;
      await esClient.closePointInTime({ id: pitId });
    } catch (err) {
      this.logger.error(`Failed to close point in time: ${err.message}`);
      throw err;
    }
  }

  /**
   * Sets a single boolean `field` to `true` on every document that matches
   * `query`, using one blocking `_update_by_query` against the event log data
   * stream. The field is only set when its parent object exists, so a malformed
   * document cannot fail the batch. Chunking, logging, and error handling are the
   * caller's responsibility.
   */
  public async softDeleteByQuery({
    query,
    field,
    conflicts = 'proceed',
    slices = 'auto',
    requestsPerSecond,
  }: SoftDeleteByQueryParams): Promise<estypes.UpdateByQueryResponse> {
    const buildSetFieldTrueScript = (): string => {
      const segments = field.split('.');
      const assignPath = `ctx._source.${segments.join('.')}`;
      const parents = segments.slice(0, -1);
      if (parents.length === 0) {
        return `${assignPath} = true;`;
      }
      const guardPath = `ctx._source.${parents[0]}${parents
        .slice(1)
        .map((segment) => `?.${segment}`)
        .join('')}`;
      return `if (${guardPath} != null) { ${assignPath} = true; }`;
    };

    const source = buildSetFieldTrueScript();

    const esClient = await this.elasticsearchClientPromise;
    return esClient.updateByQuery({
      index: this.esNames.dataStream,
      conflicts,
      slices,
      query,
      script: {
        source,
        lang: 'painless',
      },
      // Optional trottling param
      ...(requestsPerSecond == null ? {} : { requests_per_second: requestsPerSecond }),
    });
  }
}

export function getQueryBodyWithAuthFilter(
  logger: Logger,
  opts: GetQueryBodyWithAuthFilterOpts,
  queryOptions: QueryOptionsType
) {
  const { namespaces, type, authFilter, includeSpaceAgnostic } = opts;
  const { start, end, filter } = queryOptions ?? {};
  const ids = 'ids' in opts ? opts.ids : [];

  const namespaceQuery = (namespaces ?? [undefined]).map((namespace) =>
    getNamespaceQuery(namespace)
  );
  let dslFilterQuery: estypes.QueryDslBoolQuery['filter'];
  try {
    const filterKueryNode = filter ? fromKueryExpression(filter) : null;
    const queryFilter = filterKueryNode
      ? nodeBuilder.and([filterKueryNode, authFilter as KueryNode])
      : authFilter;
    dslFilterQuery = queryFilter ? toElasticsearchQuery(queryFilter) : undefined;
  } catch (err) {
    logger.debug(
      () =>
        `esContext: Invalid kuery syntax for the filter (${filter}) error: ${JSON.stringify({
          message: err.message,
          statusCode: err.statusCode,
        })}`
    );
    throw err;
  }

  const savedObjectsQueryMust: estypes.QueryDslQueryContainer[] = [
    {
      term: {
        'kibana.saved_objects.rel': {
          value: SAVED_OBJECT_REL_PRIMARY,
        },
      },
    },
    {
      term: {
        'kibana.saved_objects.type': {
          value: type,
        },
      },
    },
    {
      bool: {
        ...(includeSpaceAgnostic
          ? {
              should: [
                {
                  bool: {
                    should: namespaceQuery,
                  },
                },
                {
                  match: {
                    ['kibana.saved_objects.space_agnostic']: true,
                  },
                },
              ],
            }
          : { should: namespaceQuery }),
      },
    },
  ];

  const musts: estypes.QueryDslQueryContainer[] = [
    {
      nested: {
        path: 'kibana.saved_objects',
        query: {
          bool: {
            must: reject(savedObjectsQueryMust, isUndefined),
          },
        },
      },
    },
  ];

  if (ids.length) {
    musts.push({
      bool: {
        should: {
          bool: {
            must: [
              {
                nested: {
                  path: 'kibana.saved_objects',
                  query: {
                    bool: {
                      must: [
                        {
                          terms: {
                            // default maximum of 65,536 terms, configurable by index.max_terms_count
                            'kibana.saved_objects.id': ids,
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                range: {
                  'kibana.version': {
                    gte: LEGACY_ID_CUTOFF_VERSION,
                  },
                },
              },
            ],
          },
        },
      },
    });
  }

  if (start) {
    musts.push({
      range: {
        '@timestamp': {
          gte: start,
        },
      },
    });
  }
  if (end) {
    musts.push({
      range: {
        '@timestamp': {
          lte: end,
        },
      },
    });
  }

  return {
    bool: {
      ...(dslFilterQuery ? { filter: dslFilterQuery } : {}),
      must: reject(musts, isUndefined),
    },
  };
}

function getNamespaceQuery(namespace?: string): estypes.QueryDslQueryContainer {
  const defaultNamespaceQuery = {
    bool: {
      must_not: {
        exists: {
          field: 'kibana.saved_objects.namespace',
        },
      },
    },
  };
  const namedNamespaceQuery = {
    term: {
      'kibana.saved_objects.namespace': {
        value: namespace!,
      },
    },
  };
  return namespace === undefined ? defaultNamespaceQuery : namedNamespaceQuery;
}

export function getQueryBody(
  logger: Logger,
  opts:
    | FindEventsOptionsBySavedObjectFilter
    | AggregateEventsOptionsBySavedObjectFilter
    | FindEventsOptionsSearchAfter,
  queryOptions: QueryOptionsType
) {
  const { namespace, type, ids, legacyIds } = opts;
  const { start, end, filter } = queryOptions ?? {};

  const namespaceQuery = getNamespaceQuery(namespace);
  let filterKueryNode;
  try {
    filterKueryNode = JSON.parse(filter ?? '');
  } catch (e) {
    filterKueryNode = filter ? fromKueryExpression(filter) : null;
  }
  let dslFilterQuery: estypes.QueryDslBoolQuery['filter'];
  try {
    dslFilterQuery = filterKueryNode ? toElasticsearchQuery(filterKueryNode) : undefined;
  } catch (err) {
    logger.debug(
      () =>
        `esContext: Invalid kuery syntax for the filter (${filter}) error: ${JSON.stringify({
          message: err.message,
          statusCode: err.statusCode,
        })}`
    );
    throw err;
  }

  const savedObjectsQueryMust: estypes.QueryDslQueryContainer[] = [
    {
      term: {
        'kibana.saved_objects.rel': {
          value: SAVED_OBJECT_REL_PRIMARY,
        },
      },
    },
    {
      term: {
        'kibana.saved_objects.type': {
          value: type,
        },
      },
    },
    namespaceQuery,
  ];

  const musts: estypes.QueryDslQueryContainer[] = [
    {
      nested: {
        path: 'kibana.saved_objects',
        query: {
          bool: {
            must: reject(savedObjectsQueryMust, isUndefined),
          },
        },
      },
    },
  ];

  const shouldQuery = [];

  shouldQuery.push({
    bool: {
      must: [
        {
          nested: {
            path: 'kibana.saved_objects',
            query: {
              bool: {
                must: [
                  {
                    terms: {
                      // default maximum of 65,536 terms, configurable by index.max_terms_count
                      'kibana.saved_objects.id': ids,
                    },
                  },
                ],
              },
            },
          },
        },
        {
          range: {
            'kibana.version': {
              gte: LEGACY_ID_CUTOFF_VERSION,
            },
          },
        },
      ],
    },
  });

  if (legacyIds && legacyIds.length > 0) {
    shouldQuery.push({
      bool: {
        must: [
          {
            nested: {
              path: 'kibana.saved_objects',
              query: {
                bool: {
                  must: [
                    {
                      terms: {
                        // default maximum of 65,536 terms, configurable by index.max_terms_count
                        'kibana.saved_objects.id': legacyIds,
                      },
                    },
                  ],
                },
              },
            },
          },
          {
            bool: {
              should: [
                {
                  range: {
                    'kibana.version': {
                      lt: LEGACY_ID_CUTOFF_VERSION,
                    },
                  },
                },
                {
                  bool: {
                    must_not: {
                      exists: {
                        field: 'kibana.version',
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });
  }

  musts.push({
    bool: {
      should: shouldQuery,
    },
  });

  if (start) {
    musts.push({
      range: {
        '@timestamp': {
          gte: start,
        },
      },
    });
  }
  if (end) {
    musts.push({
      range: {
        '@timestamp': {
          lte: end,
        },
      },
    });
  }

  return {
    bool: {
      ...(dslFilterQuery ? { filter: dslFilterQuery } : {}),
      must: reject(musts, isUndefined),
    },
  };
}
