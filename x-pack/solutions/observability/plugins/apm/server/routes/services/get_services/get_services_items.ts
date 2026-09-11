/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { ServicesItemsResponse } from '@kbn/apm-api-shared';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import type { ServiceGroup } from '../../../../common/service_groups';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import type { ApmAlertsClient } from '../../../lib/helpers/get_apm_alerts_client';
import type { ApmSloClient } from '../../../lib/helpers/get_apm_slo_client';
import type { MlClient } from '../../../lib/helpers/get_ml_client';
import type { RandomSampler } from '../../../lib/helpers/get_random_sampler';
import { withApmSpan } from '../../../utils/with_apm_span';
import { getServiceAnomalyScores } from './get_service_anomaly_scores';
import { getServicesAlerts } from './get_service_alerts';
import { getServicesSloStats } from './get_services_slo_stats';
import { getServiceTransactionStats } from './get_service_transaction_stats';
import { mergeServiceStats } from './merge_service_stats';

export const MAX_NUMBER_OF_SERVICES = 1_000;

export async function getServicesItems({
  environment,
  kuery,
  mlClient,
  apmEventClient,
  apmAlertsClient,
  sloClient,
  logger,
  start,
  end,
  serviceGroup,
  randomSampler,
  documentType,
  rollupInterval,
  useDurationSummary,
  searchQuery,
}: {
  environment: string;
  kuery: string;
  mlClient?: MlClient;
  apmEventClient: APMEventClient;
  apmAlertsClient: ApmAlertsClient;
  sloClient?: ApmSloClient;
  logger: Logger;
  start: number;
  end: number;
  serviceGroup: ServiceGroup | null;
  randomSampler: RandomSampler;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
  useDurationSummary: boolean;
  searchQuery?: string;
}): Promise<ServicesItemsResponse> {
  return withApmSpan('get_services_items', async () => {
    const commonParams = {
      environment,
      kuery,
      maxNumServices: MAX_NUMBER_OF_SERVICES,
      start,
      end,
      serviceGroup,
      randomSampler,
      documentType,
      rollupInterval,
      useDurationSummary,
      searchQuery,
    };

    const [{ serviceStats, serviceOverflowCount, maxCountExceeded }, anomalyScores, alertCounts] =
      await Promise.all([
        getServiceTransactionStats({
          ...commonParams,
          apmEventClient,
        }),
        getServiceAnomalyScores({ ...commonParams, mlClient }).catch((err) => {
          logger.debug(err);
          return [];
        }),
        getServicesAlerts({ ...commonParams, apmAlertsClient }).catch((err) => {
          logger.debug(err);
          return [];
        }),
      ]);

    const sloStats = await getServicesSloStats({
      ...commonParams,
      serviceNames: serviceStats.map(({ serviceName }) => serviceName),
      sloClient,
    }).catch((err) => {
      logger.debug(err);
      return [];
    });

    const items =
      mergeServiceStats({
        serviceStats,
        anomalyScores,
        alertCounts,
        sloStats,
      }) ?? [];

    return {
      items,
      maxCountExceeded,
      serviceOverflowCount,
    };
  });
}
