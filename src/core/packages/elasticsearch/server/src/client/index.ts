/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type { ElasticsearchClient, ElasticsearchRequestLoggingOptions } from './client';
export type {
  IClusterClient,
  ICustomClusterClient,
  AsScopedOptions,
  SpaceProjectRoutingOptions,
  ExpressionProjectRoutingOptions,
} from './cluster_client';
export type { ScopeableRequest, FakeRequest } from './types';
export type { IScopedClusterClient } from './scoped_cluster_client';
export type {
  UnauthorizedErrorHandler,
  UnauthorizedErrorHandlerOptions,
  UnauthorizedErrorHandlerResult,
  UnauthorizedErrorHandlerResultRetryParams,
  UnauthorizedErrorHandlerToolkit,
  UnauthorizedErrorHandlerRetryResult,
  UnauthorizedErrorHandlerNotHandledResult,
} from './unauthorized_error_handler';
export type {
  ElasticsearchClientConfig,
  ElasticsearchClientSslConfig,
  ElasticsearchApiToRedactInLogs,
} from './client_config';
