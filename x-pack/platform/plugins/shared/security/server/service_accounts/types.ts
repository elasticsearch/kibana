/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type {
  CreateServiceAccountParams,
  ServiceAccount,
  UiamProjectType,
} from '@kbn/core-security-server';

import type { CreateServiceAccountFakeRequestParams } from './fake_requests';

/**
 * A backend capable of managing service accounts for the current runtime.
 *
 * Implemented once for UIAM-backed deployments and once for Elasticsearch-backed
 * ones, so the route and contract layers stay backend-agnostic.
 */
export interface ServiceAccountsBackend {
  create(request: KibanaRequest, params: CreateServiceAccountParams): Promise<ServiceAccount>;

  /**
   * Mints a fake `KibanaRequest` bound to the given service account, for use with `asScoped(...)`
   * facilities. The credential is transparently replaced when it expires, within the configured
   * `xpack.security.serviceAccounts.requestLifetime`. Already-issued tokens keep their upstream
   * expiration. Performs no user authorization: callers must authorize their own users first.
   */
  createFakeRequest(params: CreateServiceAccountFakeRequestParams): Promise<KibanaRequest>;

  /**
   * Replaces the credential of a service-account-bound fake request after the ES client reported
   * a token-expiry 401 for it, returning the auth headers to retry with, or `null` when the request is not
   * bound to a service account or a replacement could not be minted. Only meant to be called by
   * the ES-client unauthorized-error handler.
   *
   * Only requests minted by this backend are ever refreshed. Fake requests carrying external
   * (user-created) UIAM credentials and real inbound requests that happen to carry a service
   * account token both resolve to `null`: their credentials are owned by someone else and are not
   * Kibana's to re-mint.
   */
  reauthenticateFakeRequest(request: KibanaRequest): Promise<{ authorization: string } | null>;
}

/**
 * Start contract of the service accounts service. `null` when the feature is
 * disabled.
 */
export type ServiceAccountsServiceStart = ServiceAccountsBackend;

export interface CloudProjectContext {
  organizationId: string;
  projectId: string;
  projectType: UiamProjectType;
}
