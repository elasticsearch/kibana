/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { NativeAPIKeysType } from './api_keys';
import type { NativeAPIKeysWithContextType } from './api_keys_context';
import type { UiamAPIKeysType, UiamAPIKeysWithContextType } from './uiam';

export type {
  NativeAPIKeysType,
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
  UpdateAPIKeyParams,
  UpdateAPIKeyResult,
  UpdateCrossClusterAPIKeyParams,
  UpdateRestAPIKeyParams,
  UpdateRestAPIKeyWithKibanaPrivilegesParams,
} from './api_keys';
export type { NativeAPIKeysWithContextType } from './api_keys_context';
export { isCreateRestAPIKeyParams } from './api_keys';
export { extractApiKeyIdFromAuthzHeader, decodeApiKeyId } from './utils';

export type {
  UiamAPIKeysType,
  UiamAPIKeysWithContextType,
  GrantUiamAPIKeyParams,
  InvalidateUiamAPIKeyParams,
  ConvertUiamAPIKeyResult,
  ConvertUiamAPIKeyResultSuccess,
  ConvertUiamAPIKeyResultFailed,
  ConvertUiamAPIKeysResponse,
} from './uiam';

export interface APIKeysType extends NativeAPIKeysType {
  uiam: UiamAPIKeysType | null;
}

export interface APIKeysWithContextType extends NativeAPIKeysWithContextType {
  uiam: UiamAPIKeysWithContextType | null;
}
