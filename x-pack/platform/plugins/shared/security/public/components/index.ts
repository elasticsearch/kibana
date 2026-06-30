/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { SecurityApiClientsProvider, useSecurityApiClients } from './security_api_clients_provider';
export type { SecurityApiClients } from './security_api_clients_provider';
export {
  AuthenticationProvider,
  useAuthentication,
  useUserProfile,
  useCurrentUser,
} from './use_current_user';
export type { CurrentUser } from './use_current_user';
