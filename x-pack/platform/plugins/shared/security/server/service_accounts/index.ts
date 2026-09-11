/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { ServiceAccountsService } from './service_accounts_service';
export type { ServiceAccountsServiceStartParams } from './service_accounts_service';
export type {
  CloudProjectContext,
  ServiceAccountsBackend,
  ServiceAccountsServiceStart,
} from './types';
export { buildAssumableBy } from './assumable_by';
export { SERVICE_ACCOUNT_ROLE_ASSIGNMENTS } from './role_assignments';
export { EsServiceAccounts } from './es_service_accounts';
export { UiamServiceAccounts } from './uiam_service_accounts';
export { ServiceAccountFakeRequests } from './fake_requests';
export type { CreateServiceAccountFakeRequestParams } from './fake_requests';
