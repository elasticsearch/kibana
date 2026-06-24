/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ProcessorEvent } from '@kbn/observability-plugin/common';
import {
  CLOUD_ACCOUNT_ID,
  CLOUD_AVAILABILITY_ZONE,
  CLOUD_PROVIDER,
  CLOUD_REGION,
  CONTAINER_ID,
  HOST_NAME,
  KUBERNETES_DEPLOYMENT_NAME,
  KUBERNETES_NAMESPACE,
  KUBERNETES_NODE_NAME,
  KUBERNETES_POD_NAME,
} from '@kbn/apm-types';
import type { CommonCorrelationsQueryParams } from '../../../../common/correlations/types';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { getCommonCorrelationsQuery } from './get_common_correlations_query';
import type { FieldCandidatesResponse } from './types';

const INFRA_FIELD_CANDIDATES = new Set([
  HOST_NAME,
  CONTAINER_ID,
  KUBERNETES_POD_NAME,
  KUBERNETES_NAMESPACE,
  KUBERNETES_DEPLOYMENT_NAME,
  KUBERNETES_NODE_NAME,
  CLOUD_AVAILABILITY_ZONE,
  CLOUD_REGION,
  CLOUD_PROVIDER,
  CLOUD_ACCOUNT_ID,
]);

export async function fetchInfraFieldCandidates({
  apmEventClient,
  eventType,
  start,
  end,
  environment,
  kuery,
  query,
}: CommonCorrelationsQueryParams & {
  query: estypes.QueryDslQueryContainer;
  apmEventClient: APMEventClient;
  eventType: ProcessorEvent;
}): Promise<FieldCandidatesResponse> {
  const respMapping = await apmEventClient.fieldCaps('get_infra_field_caps', {
    apm: {
      events: [eventType],
    },
    fields: [...INFRA_FIELD_CANDIDATES],
    filters: '-metadata,-parent',
    include_empty_fields: false,
    index_filter: getCommonCorrelationsQuery({ start, end, environment, kuery, query }),
  });

  return {
    fieldCandidates: Object.keys(respMapping.fields).filter((fieldName) =>
      INFRA_FIELD_CANDIDATES.has(fieldName)
    ),
  };
}
