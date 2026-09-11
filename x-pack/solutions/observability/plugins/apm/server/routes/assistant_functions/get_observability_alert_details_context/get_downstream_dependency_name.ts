/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery } from '@kbn/observability-plugin/server';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import { maybe } from '../../../../common/utils/maybe';
import { termQuery } from '../../../../common/utils/term_query';
import {
  EVENT_OUTCOME,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  TRACE_ID,
} from '../../../../common/es_fields/apm';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';

export async function getDownstreamServiceResource({
  traceId,
  start,
  end,
  apmEventClient,
}: {
  traceId: string;
  start: number;
  end: number;
  apmEventClient: APMEventClient;
}) {
  const requiredFields = asMutableArray([SPAN_DESTINATION_SERVICE_RESOURCE] as const);
  const response = await apmEventClient.search('get_error_group_main_statistics', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.SpanEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 1,
    _source: ['span.destination.service'],
    query: {
      bool: {
        filter: [
          ...termQuery(TRACE_ID, traceId),
          ...termQuery(EVENT_OUTCOME, 'failure'),
          ...rangeQuery(start, end),
          { exists: { field: SPAN_DESTINATION_SERVICE_RESOURCE } },
        ],
      },
    },
    fields: requiredFields,
  });

  const fields = maybe(response.hits.hits[0])?.fields;

  const event = fields && accessKnownApmEventFields(fields).requireFields(requiredFields);

  return event?.[SPAN_DESTINATION_SERVICE_RESOURCE];
}
