/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery, kqlQuery } from '@kbn/observability-plugin/server';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import { termQuery, termsQuery } from '@kbn/es-query';
import { environmentQuery } from '../../../common/utils/environment_query';
import {
  SERVICE_NAME,
  CONTAINER_ID,
  KUBERNETES_POD_NAME,
  K8S_POD_NAME,
  HOST_NAME,
} from '../../../common/es_fields/apm';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { hasOpenTelemetryPrefix } from '../../../common/agent_name';

export const getInfrastructureData = async ({
  kuery,
  serviceName,
  agentName,
  environment,
  apmEventClient,
  start,
  end,
}: {
  kuery: string;
  agentName: string | undefined;
  serviceName: string;
  environment: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
}) => {
  const isOtel = Boolean(agentName && hasOpenTelemetryPrefix(agentName));
  const k8sFilterField = isOtel ? K8S_POD_NAME : KUBERNETES_POD_NAME;

  const response = await apmEventClient.search('get_service_infrastructure', {
    apm: {
      events: [ProcessorEvent.metric],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          ...termQuery(SERVICE_NAME, serviceName),
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
        ],
      },
    },
    aggs: {
      containerIds: {
        terms: {
          field: CONTAINER_ID,
          size: 500,
        },
      },
      hostNames: {
        terms: {
          field: HOST_NAME,
          size: 500,
        },
      },
      podNames: {
        terms: {
          field: k8sFilterField,
          size: 500,
        },
      },
    },
  });

  let containerIds: string[] =
    response.aggregations?.containerIds?.buckets.map((bucket) => bucket.key as string) ?? [];
  const hostNames =
    response.aggregations?.hostNames?.buckets.map((bucket) => bucket.key as string) ?? [];
  const podNames =
    response.aggregations?.podNames?.buckets.map((bucket) => bucket.key as string) ?? [];

  if (podNames.length > 0 && isOtel) {
    const containersByPodResponse = await apmEventClient.search(
      'get_container_ids_by_pod_names',
      {
        apm: {
          events: [ProcessorEvent.metric],
        },
        track_total_hits: false,
        size: 0,
        query: {
          bool: {
            filter: [
              ...rangeQuery(start, end),
              ...kqlQuery(kuery),
              ...termsQuery(k8sFilterField, podNames),
            ],
          },
        },
        aggs: {
          containerIds: {
            terms: {
              field: CONTAINER_ID,
              size: 500,
            },
          },
        },
      },
      { skipProcessorEventFilter: true }
    );
    containerIds =
      containersByPodResponse.aggregations?.containerIds?.buckets.map(
        (bucket) => bucket.key as string
      ) ?? [];
  }

  return {
    containerIds,
    hostNames,
    podNames,
  };
};
