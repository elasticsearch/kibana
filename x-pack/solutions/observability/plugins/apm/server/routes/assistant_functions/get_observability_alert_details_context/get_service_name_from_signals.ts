/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchRequest as ESSearchRequest } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { rangeQuery, termQuery, typedSearch } from '@kbn/observability-plugin/server/utils/queries';
import moment from 'moment';
import type { AlertDetailsContextualInsightsHandlerQuery } from '@kbn/observability-plugin/server/services';
import type { LogSourcesService } from '@kbn/logs-data-access-plugin/common/types';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import { SERVICE_NAME } from '@kbn/apm-types';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { maybe } from '../../../../common/utils/maybe';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import type {
  APMEventClient,
  APMEventESSearchRequest,
} from '../../../lib/helpers/create_es_client/create_apm_event_client';

export async function getServiceNameFromSignals({
  query,
  esClient,
  logSourcesService,
  apmEventClient,
}: {
  query: AlertDetailsContextualInsightsHandlerQuery;
  esClient: ElasticsearchClient;
  logSourcesService: LogSourcesService;
  apmEventClient: APMEventClient;
}) {
  if (query['service.name']) {
    return query['service.name'];
  }

  if (!query['kubernetes.pod.name'] && !query['container.id']) {
    return;
  }

  const start = moment(query.alert_started_at).subtract(30, 'minutes').valueOf();
  const end = moment(query.alert_started_at).valueOf();

  const params: Omit<APMEventESSearchRequest, 'apm'> = {
    _source: ['service.name'],
    terminate_after: 1,
    size: 1,
    track_total_hits: false,
    query: {
      bool: {
        filter: [
          {
            bool: {
              should: [
                ...termQuery('container.id', query['container.id']),
                ...termQuery('kubernetes.pod.name', query['kubernetes.pod.name']),
              ],
              minimum_should_match: 1,
            },
          },
          { exists: { field: 'service.name' } },
          ...rangeQuery(start, end),
        ],
      },
    },
  };

  const serviceName = await getServiceNameFromTraces({
    params,
    apmEventClient,
  });

  if (serviceName) {
    return serviceName;
  }

  return getServiceNameFromLogs({ params, esClient, logSourcesService });
}

async function getServiceNameFromLogs({
  params,
  esClient,
  logSourcesService,
}: {
  params: ESSearchRequest;
  esClient: ElasticsearchClient;
  logSourcesService: LogSourcesService;
}) {
  const index = await logSourcesService.getFlattenedLogSources();
  const res = await typedSearch<{ service: { name: string } }, any>(esClient, {
    index,
    ...params,
  });

  return res.hits.hits[0]?._source?.service?.name;
}

async function getServiceNameFromTraces({
  params,
  apmEventClient,
}: {
  params: Omit<APMEventESSearchRequest, 'apm'>;
  apmEventClient: APMEventClient;
}) {
  const requiredFields = asMutableArray([SERVICE_NAME] as const);
  const res = await apmEventClient.search('get_service_name_from_traces', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.TransactionEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    ...params,
    fields: requiredFields,
  });

  const fields = maybe(res.hits.hits[0])?.fields;

  const event = fields && accessKnownApmEventFields(fields).requireFields(requiredFields);

  return event?.[SERVICE_NAME];
}
