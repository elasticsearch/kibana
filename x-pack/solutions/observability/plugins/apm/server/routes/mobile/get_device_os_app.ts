/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { termQuery, kqlQuery, rangeQuery } from '@kbn/observability-plugin/server';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import {
  DEVICE_MODEL_IDENTIFIER,
  HOST_OS_VERSION,
  SERVICE_NAME,
  SERVICE_VERSION,
  TRANSACTION_TYPE,
} from '../../../common/es_fields/apm';
import { environmentQuery } from '../../../common/utils/environment_query';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';

export async function getDeviceOSApp({
  kuery,
  apmEventClient,
  serviceName,
  transactionType,
  environment,
  start,
  end,
  size,
}: {
  kuery: string;
  apmEventClient: APMEventClient;
  serviceName: string;
  transactionType?: string;
  environment: string;
  start: number;
  end: number;
  size: number;
}) {
  return await apmEventClient.search('get_mobile_device_os_app', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.TransactionEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          ...termQuery(SERVICE_NAME, serviceName),
          ...termQuery(TRANSACTION_TYPE, transactionType),
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
        ],
      },
    },
    aggs: {
      devices: {
        terms: {
          field: DEVICE_MODEL_IDENTIFIER,
          size,
        },
      },
      osVersions: {
        terms: {
          field: HOST_OS_VERSION,
          size,
        },
      },
      appVersions: {
        terms: {
          field: SERVICE_VERSION,
          size,
        },
      },
    },
  });
}
