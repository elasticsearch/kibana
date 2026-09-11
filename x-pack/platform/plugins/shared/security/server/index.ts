/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import type {
  PluginConfigDescriptor,
  PluginInitializer,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import type { RecursiveReadonly } from '@kbn/utility-types';

import { ConfigSchema } from './config';
import { securityConfigDeprecationProvider } from './config_deprecations';
import type { PluginSetupDependencies, SecurityPluginSetup } from './plugin';

// These exports are part of public Security plugin contract, any change in signature of exported
// functions or removal of exports should be considered as a breaking change.
export type { CasesSupportedOperations } from './authorization';
export type { SecurityPluginSetup, SecurityPluginStart };
export type { AuthenticatedUser } from '../common';
export { ROUTE_TAG_CAN_REDIRECT, ROUTE_TAG_AUTH_FLOW } from './routes/tags';

// Re-export types from the plugin directly to enhance the developer experience for consumers of the Security plugin.
export type {
  AuditEvent,
  AuditHttp,
  AuditKibana,
  AuditRequest,
  AuditLogger,
  AuditServiceSetup,
  NativeAPIKeysType,
  AuthenticationServiceStart,
  InvalidateAPIKeyResult,
  GrantAPIKeyOptions,
  GrantAPIKeyResult,
  CloneAPIKeyParams,
  CloneAPIKeyResult,
  ValidateAPIKeyParams,
  CreateAPIKeyResult,
  InvalidateAPIKeysParams,
  CreateAPIKeyParams,
  CreateRestAPIKeyParams,
  CreateRestAPIKeyWithKibanaPrivilegesParams,
  CreateCrossClusterAPIKeyParams,
  Actions,
  AlertingActions,
  ApiActions,
  AppActions,
  CasesActions,
  SavedObjectActions,
  SpaceActions,
  UIActions,
  AuthorizationServiceSetup,
  CheckPrivileges,
  CheckPrivilegesPayload,
  CheckUserProfilesPrivileges,
  CheckPrivilegesDynamically,
  CheckPrivilegesDynamicallyWithRequest,
  CheckUserProfilesPrivilegesResponse,
  CheckUserProfilesPrivilegesPayload,
  CheckPrivilegesOptions,
  CheckPrivilegesResponse,
  CheckPrivilegesWithRequest,
  CheckSavedObjectsPrivileges,
  CheckSavedObjectsPrivilegesWithRequest,
  ElasticsearchPrivilegesType,
  KibanaPrivilegesType,
  AuthorizationMode,
  PrivilegeDeprecationsRolesByFeatureIdResponse,
  PrivilegeDeprecationsService,
  PrivilegeDeprecationsRolesByFeatureIdRequest,
  UserProfileBulkGetParams,
  UserProfileSuggestParams,
  UserProfileRequiredPrivileges,
  UserProfileGetCurrentParams,
  UserProfileGetCurrentProfileIdParams,
  UserProfileServiceStart,
} from '@kbn/security-plugin-types-server';

export const config: PluginConfigDescriptor<TypeOf<typeof ConfigSchema>> = {
  schema: ConfigSchema,
  deprecations: securityConfigDeprecationProvider,
  exposeToBrowser: {
    loginAssistanceMessage: true,
    showInsecureClusterWarning: true,
    sameSiteCookies: true,
    showNavLinks: true,
    ui: true,
    roleManagementEnabled: true,
    uiam: { enabled: true },
    serviceAccounts: { enabled: true },
  },
};
export const plugin: PluginInitializer<
  RecursiveReadonly<SecurityPluginSetup>,
  RecursiveReadonly<SecurityPluginStart>,
  PluginSetupDependencies
> = async (initializerContext: PluginInitializerContext) => {
  const { SecurityPlugin } = await import('./plugin');
  return new SecurityPlugin(initializerContext);
};
