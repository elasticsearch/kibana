/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { Filter } from '@kbn/es-query';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';

import type {
  DetectionAlertLatest,
  WrappedAlert,
} from '../../../../../../common/api/detection_engine/model/alerts';
import type { SecurityRuleServices } from '../../types';
import type { IRuleExecutionLogForExecutors } from '../../../rule_monitoring';

/** Narrow ES surface used by alert enrichment (legacy rules and alerting v2 rows). */
export type AlertEnrichmentElasticsearchServices = Pick<
  SecurityRuleServices,
  'scopedClusterClient'
>;

export type AlertEnrichmentLogger = Pick<IRuleExecutionLogForExecutors, 'debug' | 'error' | 'info'>;
import type { ExperimentalFeatures } from '../../../../../../common/experimental_features';

export type EnrichmentType = estypes.SearchHit<unknown>;

export type EventsForEnrichment<T extends DetectionAlertLatest> = Pick<
  WrappedAlert<T>,
  '_id' | '_source'
>;

export type EnrichmentFunction = <T extends DetectionAlertLatest>(
  e: EventsForEnrichment<T>
) => EventsForEnrichment<T>;

export interface EventsMapByEnrichments {
  [id: string]: EnrichmentFunction[];
}

export type MergeEnrichments = <T extends DetectionAlertLatest>(
  allEnrichmentsResults: EventsMapByEnrichments[]
) => EventsMapByEnrichments;

export type ApplyEnrichmentsToEvents = <T extends DetectionAlertLatest>(params: {
  events: Array<EventsForEnrichment<T>>;
  enrichmentsList: EventsMapByEnrichments[];
  logger: AlertEnrichmentLogger;
}) => Array<EventsForEnrichment<T>>;

export interface BasedEnrichParameters<T extends DetectionAlertLatest> {
  services: AlertEnrichmentElasticsearchServices;
  logger: AlertEnrichmentLogger;
  events: Array<EventsForEnrichment<T>>;
  entityStoreCrudClient?: EntityStoreCRUDClient;
}

export type EnrichmentOptions<T extends DetectionAlertLatest> = BasedEnrichParameters<T> & {
  spaceId: string;
};

export type GetEventValue = <T extends DetectionAlertLatest>(
  events: EventsForEnrichment<T>,
  path: string
) => string | undefined;

export type GetFieldValue = (events: EnrichmentType, path: string) => string | undefined;

export type MakeSingleFieldMatchQuery = (params: {
  values: string[];
  searchByField: string;
  extraFilters?: QueryDslQueryContainer[];
}) => Filter;

export type SearchEnrichments = (params: {
  index: string[];
  services: AlertEnrichmentElasticsearchServices;
  logger: AlertEnrichmentLogger;
  query: Filter;
  fields: string[];
}) => Promise<EnrichmentType[]>;

export type GetIsRiskScoreAvailable = (params: {
  spaceId: string;
  services: AlertEnrichmentElasticsearchServices;
}) => Promise<boolean>;

export type IsIndexExist = (params: {
  services: AlertEnrichmentElasticsearchServices;
  index: string;
}) => Promise<boolean>;

export type CreateRiskEnrichment = <T extends DetectionAlertLatest>(
  params: BasedEnrichParameters<T> & {
    spaceId: string;
  }
) => Promise<EventsMapByEnrichments>;

export type CreateCriticalityEnrichment = <T extends DetectionAlertLatest>(
  params: BasedEnrichParameters<T> & {
    spaceId: string;
  }
) => Promise<EventsMapByEnrichments>;

export type CreateEnrichmentFunction = (enrichmentDoc: EnrichmentType) => EnrichmentFunction;
export type CreateV2EnrichmentFunction = (fields: Record<string, unknown[]>) => EnrichmentFunction;

export type CreateFieldsMatchEnrichment = <T extends DetectionAlertLatest>(
  params: BasedEnrichParameters<T> & {
    name: string;
    index: string[];
    mappingField: {
      /** The field on events which contains the value we'll use to build a query. */
      eventField: string;
      /** Used in a `match` query to find documents that match the values of `eventField`. */
      enrichmentField: string;
    };
    /** Specifies which fields should be returned when querying the enrichment index. */
    enrichmentResponseFields: string[];
    createEnrichmentFunction: CreateEnrichmentFunction;
    extraFilters?: QueryDslQueryContainer[];
  }
) => Promise<EventsMapByEnrichments>;

export type EnrichEventsParams<T extends DetectionAlertLatest> = BasedEnrichParameters<T> & {
  spaceId: string;
  experimentalFeatures: ExperimentalFeatures;
};

export type EnrichEvents = <T extends DetectionAlertLatest>(
  params: EnrichEventsParams<T>
) => Promise<Array<EventsForEnrichment<T>>>;

export type EnrichEventsWrapper = <T extends DetectionAlertLatest>(
  alerts: Array<EventsForEnrichment<T>>,
  params: { spaceId: string }
) => Promise<Array<EventsForEnrichment<T>>>;

interface Risk {
  calculated_level: string;
  calculated_score_norm: string;
}
export interface RiskEnrichmentFields {
  host?: {
    name?: string;
    risk?: Risk;
  };
  user?: {
    name?: string;
    risk?: Risk;
  };
}
