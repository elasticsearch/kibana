/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import { compact } from 'lodash';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import type { filterOptionsSchema } from './custom_link_types';
import { splitFilterValueByComma } from './helper';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';

export async function getTransaction({
  apmEventClient,
  filters = {},
}: {
  apmEventClient: APMEventClient;
  filters?: z.infer<typeof filterOptionsSchema>;
}) {
  const esFilters = compact(
    Object.entries(filters)
      // loops through the filters splitting the value by comma and removing white spaces
      .map(([key, value]) => {
        if (value) {
          return { terms: { [key]: splitFilterValueByComma(value) } };
        }
      })
  );

  const resp = await apmEventClient.search('get_transaction_for_custom_link', {
    terminate_after: 1,
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.TransactionEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 1,
    query: {
      bool: {
        filter: esFilters,
      },
    },
  });
  return resp.hits.hits[0]?._source;
}
