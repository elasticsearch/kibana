/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type { SecurityServiceSetup, SecurityServiceStart } from './src/contracts';
export type {
  CoreAuthenticationService,
  FakeRequestEnricher,
  FakeRequestUserFields,
} from './src/authc';
export type { CoreAuditService } from './src/audit';
export type {
  CoreSecurityDelegateContract,
  AuthenticationServiceContract,
  AuditServiceContract,
} from './src/api_provider';
export type {
  SecurityRequestHandlerContext,
  AuthcRequestHandlerContext,
  AuditRequestHandlerContext,
} from './src/request_handler_context';
export type {
  AuditEvent,
  AuditHttp,
  AuditKibana,
  AuditRequest,
} from './src/audit_logging/audit_events';
export type { AuditLogger } from './src/audit_logging/audit_logger';

export type * from './src/authentication';

export type { KibanaPrivilegesType, ElasticsearchPrivilegesType } from './src/roles';
export {
  isCreateRestAPIKeyParams,
  extractApiKeyIdFromAuthzHeader,
  decodeApiKeyId,
  HTTPAuthorizationHeader,
} from './src/authentication';
export { isUiamCredential, isMissingApiKey, isRevokedApiKey } from './src/uiam';
export type { CoreFipsService } from './src/fips';
export { AuthzDisabled, AuthzOptOutReason, unwindNestedSecurityPrivileges } from './src/authz';
export { ApiPrivileges, ApiOperation } from './src/api_privileges';
