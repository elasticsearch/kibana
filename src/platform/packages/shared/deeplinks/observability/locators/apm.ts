/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';

export const TRANSACTION_DETAILS_BY_TRACE_ID_LOCATOR = 'TRANSACTION_DETAILS_BY_TRACE_ID_LOCATOR';

export interface TransactionDetailsByTraceIdLocatorParams extends SerializableRecord {
  rangeFrom?: string;
  rangeTo?: string;
  waterfallItemId?: string;
  traceId: string;
}

export const DEPENDENCY_OVERVIEW_LOCATOR_ID = 'dependencyOverviewLocator';

export interface DependencyOverviewParams extends SerializableRecord {
  dependencyName: string;
  environment?: string;
  rangeFrom?: string;
  rangeTo?: string;
}

export const TRANSACTION_DETAILS_BY_NAME_LOCATOR = 'TransactionDetailsByNameLocator';

export interface TransactionDetailsByNameParams extends SerializableRecord {
  serviceName: string;
  transactionName: string;
  rangeFrom?: string;
  rangeTo?: string;
}

export const SERVICE_TRANSACTIONS_LOCATOR_ID = 'serviceTransactionsLocator';

export interface ServiceTransactionsLocatorParams extends SerializableRecord {
  serviceName: string;
  transactionType?: string;
  environment?: string;
  rangeFrom?: string;
  rangeTo?: string;
  latencyAggregationType?: string;
}

export const SERVICE_ALERTS_LOCATOR_ID = 'serviceAlertsLocator';

export interface ServiceAlertsLocatorParams extends SerializableRecord {
  serviceName: string;
  transactionName?: string;
  transactionType?: string;
  kuery?: string;
  rangeFrom?: string;
  rangeTo?: string;
}
