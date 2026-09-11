/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchRequest as ESSearchRequest } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { CoreRequestHandlerContext } from '@kbn/core-http-request-handler-context-server';
import { rangeQuery, typedSearch } from '@kbn/observability-plugin/server/utils/queries';
import moment from 'moment';
import type { AlertDetailsContextualInsightsHandlerQuery } from '@kbn/observability-plugin/server/services';
import type { LogSourcesService } from '@kbn/logs-data-access-plugin/common/types';
import { CONTAINER_ID } from '@kbn/apm-types';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import type { FlattenedApmEvent } from '@kbn/apm-data-access-plugin/server/utils/utility_types';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { maybe } from '../../../../common/utils/maybe';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import type {
  APMEventClient,
  APMEventESSearchRequest,
} from '../../../lib/helpers/create_es_client/create_apm_event_client';

export async function getContainerIdFromSignals({
  query,
  esClient,
  logSourcesService,
  apmEventClient,
}: {
  query: AlertDetailsContextualInsightsHandlerQuery;
  esClient: ElasticsearchClient;
  logSourcesService: LogSourcesService;
  coreContext: Pick<CoreRequestHandlerContext, 'uiSettings'>;
  apmEventClient: APMEventClient;
}) {
  if (query['container.id']) {
    return query['container.id'];
  }

  if (!query['service.name']) {
    return;
  }

  const start = moment(query.alert_started_at).subtract(30, 'minutes').valueOf();
  const end = moment(query.alert_started_at).valueOf();

  const params: Omit<APMEventESSearchRequest, 'apm'> = {
    _source: ['container.id'],
    terminate_after: 1,
    size: 1,
    track_total_hits: false,
    query: {
      bool: {
        filter: [
          { term: { 'service.name': query['service.name'] } },
          { exists: { field: 'container.id' } },
          ...rangeQuery(start, end),
        ],
      },
    },
  };
  const containerId = await getContainerIdFromTraces({
    params,
    apmEventClient,
  });

  if (containerId) {
    return containerId;
  }

  return getContainerIdFromLogs({ params, esClient, logSourcesService });
}

async function getContainerIdFromLogs({
  params,
  esClient,
  logSourcesService,
}: {
  params: ESSearchRequest;
  esClient: ElasticsearchClient;
  logSourcesService: LogSourcesService;
}) {
  const requiredFields = asMutableArray([CONTAINER_ID] as const);
  const index = await logSourcesService.getFlattenedLogSources();
  const res = await typedSearch<{ container: { id: string } }, any>(esClient, {
    index,
    ...params,
    fields: requiredFields,
  });

  const fields = maybe(res.hits.hits[0])?.fields;

  const event =
    fields &&
    accessKnownApmEventFields(fields as Partial<FlattenedApmEvent>).requireFields(requiredFields);

  return event?.[CONTAINER_ID];
}

async function getContainerIdFromTraces({
  params,
  apmEventClient,
}: {
  params: Omit<APMEventESSearchRequest, 'apm'>;
  apmEventClient: APMEventClient;
}) {
  const requiredFields = asMutableArray([CONTAINER_ID] as const);
  const res = await apmEventClient.search('get_container_id_from_traces', {
    ...params,
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.TransactionEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    fields: requiredFields,
  });

  const fields = maybe(res.hits.hits[0])?.fields;

  const event =
    fields &&
    accessKnownApmEventFields(fields as Partial<FlattenedApmEvent>).requireFields(requiredFields);

  return event?.[CONTAINER_ID];
}
