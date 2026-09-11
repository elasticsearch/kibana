/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type {
  APIKeysType,
  APIKeysWithContextType,
  CreateAPIKeyParams,
  CreateAPIKeyResult,
  InvalidateAPIKeyResult,
  InvalidateAPIKeysParams,
  ValidateAPIKeyParams,
  CreateRestAPIKeyParams,
  CreateRestAPIKeyWithKibanaPrivilegesParams,
  CreateCrossClusterAPIKeyParams,
  GrantAPIKeyOptions,
  GrantAPIKeyResult,
  CloneAPIKeyParams,
  CloneAPIKeyResult,
  NativeAPIKeysType,
  NativeAPIKeysWithContextType,
  UpdateAPIKeyParams,
  UpdateAPIKeyResult,
  UpdateCrossClusterAPIKeyParams,
  UpdateRestAPIKeyParams,
  UpdateRestAPIKeyWithKibanaPrivilegesParams,
  UiamAPIKeysType,
  UiamAPIKeysWithContextType,
  GrantUiamAPIKeyParams,
  InvalidateUiamAPIKeyParams,
  ConvertUiamAPIKeyResult,
  ConvertUiamAPIKeyResultSuccess,
  ConvertUiamAPIKeyResultFailed,
  ConvertUiamAPIKeysResponse,
} from './api_keys';

export type {
  UiamOAuthType,
  UiamOAuthClientResponse,
  UiamOAuthClientLogo,
  UiamOAuthClientType,
  UiamOAuthConnectionsSummary,
  UiamOAuthConnectionResponse,
  CreateUiamOAuthClientParams,
  UpdateUiamOAuthClientParams,
  UpdateUiamOAuthConnectionParams,
  UiamUserInfo,
  UiamResolvedUsersResponse,
} from './oauth';

export { HTTPAuthorizationHeader } from './http_authentication';
export {
  isCreateRestAPIKeyParams,
  extractApiKeyIdFromAuthzHeader,
  decodeApiKeyId,
} from './api_keys';
