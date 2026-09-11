/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';
import type { Observable } from 'rxjs';
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { IClusterClient, KibanaRequest } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';

import type { KueryNode } from '@kbn/es-query';
import type { SpaceId } from '@kbn/core-spaces-common';
import type { EsContext } from './es';
import type { IEventLogClient } from './types';
import type {
  QueryEventsBySavedObjectResult,
  QueryEventsBySavedObjectSearchAfterResult,
  SoftDeleteByQueryParams,
} from './es/cluster_client_adapter';
import type { SavedObjectBulkGetterResult } from './saved_object_provider_registry';
export type PluginClusterClient = Pick<IClusterClient, 'asInternalUser'>;
export type AdminClusterClient$ = Observable<PluginClusterClient>;

const optionalDateFieldSchema = schema.maybe(
  schema.string({
    validate(value) {
      if (isNaN(Date.parse(value))) {
        return 'Invalid Date';
      }
    },
  })
);

const sortSchema = schema.object({
  sort_field: schema.oneOf([
    schema.literal('@timestamp'),
    schema.literal('event.sequence'), // can be used as a tiebreaker for @timestamp
    schema.literal('event.start'),
    schema.literal('event.end'),
    schema.literal('event.provider'),
    schema.literal('event.duration'),
    schema.literal('event.action'),
    schema.literal('message'),
    schema.literal('kibana.alert.rule.gap.status'),
    schema.literal('kibana.alert.rule.gap.total_gap_duration_ms'),
  ]),
  sort_order: schema.oneOf([schema.literal('asc'), schema.literal('desc')]),
});

export const queryOptionsSchema = schema.object({
  per_page: schema.number({ defaultValue: 10, min: 0 }),
  page: schema.number({ defaultValue: 1, min: 1 }),
  start: optionalDateFieldSchema,
  end: optionalDateFieldSchema,
  sort: schema.arrayOf(sortSchema, {
    defaultValue: [{ sort_field: '@timestamp', sort_order: 'asc' }],
  }),
  filter: schema.maybe(schema.string()),
});

export const queryOptionsSearchAfterSchema = schema.object({
  per_page: schema.number({ defaultValue: 10, min: 0 }),
  pit_id: schema.maybe(schema.string()),
  search_after: schema.maybe(
    schema.arrayOf(schema.oneOf([schema.string(), schema.number(), schema.boolean(), schema.any()]))
  ),
  start: optionalDateFieldSchema,
  end: optionalDateFieldSchema,
  sort: schema.arrayOf(sortSchema, {
    defaultValue: [{ sort_field: '@timestamp', sort_order: 'asc' }],
  }),
  filter: schema.maybe(schema.string()),
});

export type QueryOptionsType = Pick<TypeOf<typeof queryOptionsSchema>, 'start' | 'end' | 'filter'>;

// page & perPage are required, other fields are optional
// using schema.maybe allows us to set undefined, but not to make the field optional
export type FindOptionsType = Pick<
  TypeOf<typeof queryOptionsSchema>,
  'page' | 'per_page' | 'sort' | 'filter'
> &
  Partial<TypeOf<typeof queryOptionsSchema>>;

export type AggregateOptionsType = Pick<TypeOf<typeof queryOptionsSchema>, 'filter'> &
  Partial<TypeOf<typeof queryOptionsSchema>> & {
    aggs: Record<string, estypes.AggregationsAggregationContainer>;
  };

export type FindOptionsSearchAfterType = Omit<FindOptionsType, 'page'> & {
  pit_id?: string;
  search_after?: estypes.SortResults;
};

const softDeleteByQuerySchema = schema.object({
  query: schema.object({}, { unknowns: 'allow' }),
  field: schema.oneOf([schema.literal('kibana.alert.rule.gap.deleted')]),
  conflicts: schema.maybe(schema.oneOf([schema.literal('abort'), schema.literal('proceed')])),
  slices: schema.maybe(schema.oneOf([schema.literal('auto'), schema.number({ min: 1 })])),
  requestsPerSecond: schema.maybe(schema.number({ min: 1 })),
});

interface EventLogServiceCtorParams {
  esContext: EsContext;
  savedObjectGetter: SavedObjectBulkGetterResult;
  spacesService?: SpacesServiceStart;
  request: KibanaRequest;
  spaceId?: SpaceId;
}

// note that clusterClient may be null, indicating we can't write to ES
export class EventLogClient implements IEventLogClient {
  private esContext: EsContext;
  private savedObjectGetter: SavedObjectBulkGetterResult;
  private spacesService?: SpacesServiceStart;
  private request: KibanaRequest;
  private spaceId?: SpaceId;

  constructor({
    esContext,
    savedObjectGetter,
    spacesService,
    request,
    spaceId,
  }: EventLogServiceCtorParams) {
    this.esContext = esContext;
    this.savedObjectGetter = savedObjectGetter;
    this.spacesService = spacesService;
    this.request = request;
    this.spaceId = spaceId;
  }

  public async findEventsBySavedObjectIds(
    type: string,
    ids: string[],
    options?: Partial<FindOptionsType>,
    legacyIds?: string[]
  ): Promise<QueryEventsBySavedObjectResult> {
    const findOptions = queryOptionsSchema.validate(options ?? {});

    // verify the user has the required permissions to view this saved object
    await this.savedObjectGetter(type, ids);

    return await this.esContext.esAdapter.queryEventsBySavedObjects({
      index: this.esContext.esNames.indexPattern,
      namespace: await this.getNamespace(),
      type,
      ids,
      findOptions,
      legacyIds,
    });
  }

  public async findEventsWithAuthFilter(
    type: string,
    ids: string[],
    authFilter: KueryNode,
    namespace: string | undefined,
    options?: Partial<FindOptionsType>
  ): Promise<QueryEventsBySavedObjectResult> {
    if (!authFilter) {
      throw new Error('No authorization filter defined!');
    }

    const findOptions = queryOptionsSchema.validate(options ?? {});

    return await this.esContext.esAdapter.queryEventsWithAuthFilter({
      index: this.esContext.esNames.indexPattern,
      namespace: namespace
        ? this.spacesService?.spaceIdToNamespace(namespace)
        : await this.getNamespace(),
      type,
      ids,
      findOptions,
      authFilter,
    });
  }

  public async findEventsByDocumentIds(
    docs: Array<{ _id: string; _index: string }>
  ): Promise<Pick<QueryEventsBySavedObjectResult, 'data'>> {
    const response = await this.esContext.esAdapter.queryEventsByDocumentIds(docs);

    return response;
  }

  public async aggregateEventsBySavedObjectIds(
    type: string,
    ids: string[],
    options?: AggregateOptionsType,
    legacyIds?: string[]
  ) {
    const aggs = options?.aggs;
    if (!aggs) {
      throw new Error('No aggregation defined!');
    }

    // validate other query options separately from
    const aggregateOptions = queryOptionsSchema.validate(omit(options, 'aggs') ?? {});

    // verify the user has the required permissions to view this saved object
    await this.savedObjectGetter(type, ids);

    return await this.esContext.esAdapter.aggregateEventsBySavedObjects({
      index: this.esContext.esNames.indexPattern,
      namespace: await this.getNamespace(),
      type,
      ids,
      aggregateOptions: { ...aggregateOptions, aggs } as AggregateOptionsType,
      legacyIds,
    });
  }

  public async aggregateEventsWithAuthFilter(
    type: string,
    authFilter: KueryNode,
    options?: AggregateOptionsType,
    namespaces?: Array<string | undefined>,
    includeSpaceAgnostic?: boolean
  ) {
    if (!authFilter) {
      throw new Error('No authorization filter defined!');
    }

    const aggs = options?.aggs;
    if (!aggs) {
      throw new Error('No aggregation defined!');
    }

    // validate other query options separately from
    const aggregateOptions = queryOptionsSchema.validate(omit(options, 'aggs') ?? {});

    return await this.esContext.esAdapter.aggregateEventsWithAuthFilter({
      index: this.esContext.esNames.indexPattern,
      namespaces: namespaces ?? [await this.getNamespace()],
      type,
      authFilter,
      aggregateOptions: { ...aggregateOptions, aggs } as AggregateOptionsType,
      includeSpaceAgnostic,
    });
  }

  public async refreshIndex(): Promise<void> {
    await this.esContext.esAdapter.refreshIndex();
  }

  public async softDeleteByQuery(
    params: SoftDeleteByQueryParams
  ): Promise<estypes.UpdateByQueryResponse> {
    softDeleteByQuerySchema.validate(params);
    return this.esContext.esAdapter.softDeleteByQuery(params);
  }

  public async findEventsBySavedObjectIdsSearchAfter(
    type: string,
    ids: string[],
    options?: Partial<FindOptionsSearchAfterType>,
    legacyIds?: string[]
  ): Promise<QueryEventsBySavedObjectSearchAfterResult> {
    const findOptions = queryOptionsSearchAfterSchema.validate(options ?? {});

    await this.savedObjectGetter(type, ids);

    return await this.esContext.esAdapter.queryEventsBySavedObjectsSearchAfter({
      index: this.esContext.esNames.indexPattern,
      namespace: await this.getNamespace(),
      type,
      ids,
      findOptions,
      legacyIds,
    });
  }

  public async closePointInTime(pitId: string): Promise<void> {
    return await this.esContext.esAdapter.closePointInTime(pitId);
  }

  private async getNamespace() {
    if (this.spaceId) {
      return this.spacesService?.spaceIdToNamespace(this.spaceId);
    }
    const space = await this.spacesService?.getActiveSpace(this.request);
    return space && this.spacesService?.spaceIdToNamespace(space.id);
  }
}
