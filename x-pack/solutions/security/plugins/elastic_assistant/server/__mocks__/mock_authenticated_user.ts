/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthenticatedUser } from '@kbn/core/server';

export const mockAuthenticatedUser: AuthenticatedUser = {
  enabled: true,
  authentication_realm: {
    name: 'test_authentication_realm_name',
    type: 'saml',
  },
  lookup_realm: {
    name: 'test_lookup_realm_name',
    type: 'saml',
  },
  authentication_type: 'token',
  authentication_provider: {
    type: 'test_authentication_provider_type',
    name: 'test_authentication_provider_name',
  },
  elastic_cloud_user: false,
  profile_uid: 'u_EWATCHX9oIEsmcXj8aA1FkcaY3DE-XEpsiGTjrR2PmM_0',
  roles: ['admin'],
  username: 'test_user',
  http_authentication_scheme: null,
};
