/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { KibanaRequest } from '@kbn/core/server';
import type { KueryNode } from '@kbn/es-query';
import type { SpaceId } from '@kbn/core-spaces-common';

export type { IEvent, IValidatedEvent } from '../generated/schemas';
export { EventSchema, ECS_VERSION } from '../generated/schemas';
import type { BulkResponse, UpdateByQueryResponse } from '@elastic/elasticsearch/lib/api/types';
import type { IEvent } from '../generated/schemas';
import type {
  AggregateOptionsType,
  FindOptionsType,
  FindOptionsSearchAfterType,
} from './event_log_client';
import type {
  AggregateEventsBySavedObjectResult,
  QueryEventsBySavedObjectResult,
  InternalFields,
  QueryEventsBySavedObjectSearchAfterResult,
  SoftDeleteByQueryParams,
} from './es/cluster_client_adapter';

export type {
  QueryEventsBySavedObjectResult,
  AggregateEventsBySavedObjectResult,
  InternalFields,
  IValidatedEventInternalDocInfo,
} from './es/cluster_client_adapter';
import type { SavedObjectProvider } from './saved_object_provider_registry';

export const SAVED_OBJECT_REL_PRIMARY = 'primary';

export const ConfigSchema = schema.object({
  logEntries: schema.boolean({ defaultValue: false }),
  indexEntries: schema.boolean({ defaultValue: true }),
});

export type IEventLogConfig = TypeOf<typeof ConfigSchema>;

// the object exposed by plugin.setup()
export interface IEventLogService {
  isLoggingEntries(): boolean;
  isIndexingEntries(): boolean;
  registerProviderActions(provider: string, actions: string[]): void;
  isProviderActionRegistered(provider: string, action: string): boolean;
  getProviderActions(): Map<string, Set<string>>;
  registerSavedObjectProvider(type: string, provider: SavedObjectProvider): void;
  getLogger(properties: IEvent): IEventLogger;
  getIndexPattern(): string;
  isEsContextReady(): Promise<boolean>;
}

export interface IEventLogClientService {
  getClient(request: KibanaRequest): IEventLogClient;
  getClientWithRequestInSpace(request: KibanaRequest, spaceId: SpaceId): IEventLogClient;
}

export interface IEventLogClient {
  findEventsBySavedObjectIds(
    type: string,
    ids: string[],
    options?: Partial<FindOptionsType>,
    legacyIds?: string[]
  ): Promise<QueryEventsBySavedObjectResult>;
  findEventsWithAuthFilter(
    type: string,
    ids: string[],
    authFilter: KueryNode,
    namespace: string | undefined,
    options?: Partial<FindOptionsType>
  ): Promise<QueryEventsBySavedObjectResult>;
  aggregateEventsBySavedObjectIds(
    type: string,
    ids: string[],
    options?: Partial<AggregateOptionsType>,
    legacyIds?: string[]
  ): Promise<AggregateEventsBySavedObjectResult>;
  aggregateEventsWithAuthFilter(
    type: string,
    authFilter: KueryNode,
    options?: Partial<AggregateOptionsType>,
    namespaces?: Array<string | undefined>,
    includeSpaceAgnostic?: boolean
  ): Promise<AggregateEventsBySavedObjectResult>;
  findEventsByDocumentIds(
    docs: Array<{ _id: string; _index: string }>
  ): Promise<Pick<QueryEventsBySavedObjectResult, 'data'>>;
  findEventsBySavedObjectIdsSearchAfter(
    type: string,
    ids: string[],
    options?: Partial<FindOptionsSearchAfterType>,
    legacyIds?: string[]
  ): Promise<QueryEventsBySavedObjectSearchAfterResult>;
  closePointInTime(pitId: string): Promise<void>;
  refreshIndex(): Promise<void>;
  softDeleteByQuery(params: SoftDeleteByQueryParams): Promise<UpdateByQueryResponse>;
}

export interface IEventLogger {
  logEvent(properties: IEvent, id?: string): void;
  startTiming(event: IEvent, startTime?: Date): void;
  stopTiming(event: IEvent): void;
  updateEvents(
    events: Array<{ internalFields: InternalFields; event: IEvent }>
  ): Promise<BulkResponse>;
}
