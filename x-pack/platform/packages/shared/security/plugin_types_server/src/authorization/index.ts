/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  Actions,
  AlertingActions,
  AlertsActions,
  ApiActions,
  AppActions,
  CasesActions,
  SavedObjectActions,
  SpaceActions,
  UIActions,
} from './actions';
export type { AuthorizationServiceSetup } from './authorization_service';
export type {
  CheckPrivilegesOptions,
  CheckPrivilegesResponse,
  CheckPrivilegesWithRequest,
  CheckPrivilegesPayload,
  CheckPrivileges,
  HasPrivilegesResponse,
  HasPrivilegesResponseApplication,
  CheckUserProfilesPrivilegesPayload,
  CheckUserProfilesPrivilegesResponse,
  CheckUserProfilesPrivileges,
} from './check_privileges';
export type {
  CheckPrivilegesDynamically,
  CheckPrivilegesDynamicallyWithRequest,
} from './check_privileges_dynamically';
export type {
  CheckSavedObjectsPrivileges,
  CheckSavedObjectsPrivilegesWithRequest,
} from './check_saved_objects_privileges';
export type {
  PrivilegeDeprecationsService,
  PrivilegeDeprecationsRolesByFeatureIdRequest,
  PrivilegeDeprecationsRolesByFeatureIdResponse,
} from './deprecations';
export type { AuthorizationMode } from './mode';
export type { EsSecurityConfig } from './es_security_config';

export { GLOBAL_RESOURCE } from './constants';
export { elasticsearchRoleSchema, getKibanaRoleSchema } from './role_schema';
