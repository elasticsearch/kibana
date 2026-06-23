/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import qs from 'query-string';
import { escapeKuery } from '@kbn/es-query';
import type { LocatorDefinition, LocatorPublic } from '@kbn/share-plugin/public';
import type { ServiceAlertsLocatorParams } from '@kbn/deeplinks-observability';
import { SERVICE_ALERTS_LOCATOR_ID } from '@kbn/deeplinks-observability';
import { ALERT_STATUS_ACTIVE } from '@kbn/rule-data-utils';
import { TRANSACTION_NAME, TRANSACTION_TYPE } from '../../field_names/elasticsearch';

export { SERVICE_ALERTS_LOCATOR_ID, type ServiceAlertsLocatorParams };

export type ServiceAlertsLocator = LocatorPublic<ServiceAlertsLocatorParams>;

export class ServiceAlertsLocatorDefinition
  implements LocatorDefinition<ServiceAlertsLocatorParams>
{
  public readonly id = SERVICE_ALERTS_LOCATOR_ID;

  public readonly getLocation = async ({
    serviceName,
    transactionName,
    transactionType,
    kuery,
    rangeFrom,
    rangeTo,
  }: ServiceAlertsLocatorParams) => {
    const filters = [
      kuery,
      transactionName ? `${TRANSACTION_NAME}: ${escapeKuery(transactionName)}` : undefined,
      transactionType ? `${TRANSACTION_TYPE}: ${escapeKuery(transactionType)}` : undefined,
    ].filter(Boolean);

    const params = {
      kuery: filters.join(' and ') || undefined,
      rangeFrom,
      rangeTo,
      alertStatus: ALERT_STATUS_ACTIVE,
    };

    return {
      app: 'apm',
      path: `/services/${encodeURIComponent(serviceName)}/alerts?${qs.stringify(params)}`,
      state: {},
    };
  };
}
