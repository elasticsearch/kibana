/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import qs from 'query-string';
import type { LocatorDefinition, LocatorPublic } from '@kbn/share-plugin/public';
import type { ServiceTransactionsLocatorParams } from '@kbn/deeplinks-observability';
import { SERVICE_TRANSACTIONS_LOCATOR_ID } from '@kbn/deeplinks-observability';

export { SERVICE_TRANSACTIONS_LOCATOR_ID, type ServiceTransactionsLocatorParams };

export type ServiceTransactionsLocator = LocatorPublic<ServiceTransactionsLocatorParams>;

export class ServiceTransactionsLocatorDefinition
  implements LocatorDefinition<ServiceTransactionsLocatorParams>
{
  public readonly id = SERVICE_TRANSACTIONS_LOCATOR_ID;

  public readonly getLocation = async ({
    serviceName,
    transactionType,
    environment,
    rangeFrom,
    rangeTo,
    latencyAggregationType,
  }: ServiceTransactionsLocatorParams) => {
    const params = { transactionType, environment, rangeFrom, rangeTo, latencyAggregationType };
    return {
      app: 'apm',
      path: `/services/${encodeURIComponent(serviceName)}/transactions?${qs.stringify(params)}`,
      state: {},
    };
  };
}
