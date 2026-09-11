/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { UIAM_INTERNAL_CALLER_ATTESTATION_HEADER } from '@kbn/core-security-server';

import type { UiamServicePublic } from './uiam_service';
import { ES_CLIENT_AUTHENTICATION_HEADER } from '../../common/constants';

export const uiamServiceMock = {
  create: (): jest.Mocked<UiamServicePublic> => ({
    getAuthenticationHeaders: jest.fn().mockImplementation((accessToken: string) => ({
      authorization: `Bearer ${accessToken}`,
      [ES_CLIENT_AUTHENTICATION_HEADER]: 'some-shared-secret',
    })),
    getClientAuthentication: jest.fn(),
    getInternalCallerAttestationHeaders: jest.fn().mockReturnValue({
      [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: 'some-internal-caller-attestation',
    }),
    refreshSessionTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
    invalidateSessionTokens: jest.fn().mockResolvedValue(undefined),
    grantApiKey: jest.fn().mockResolvedValue({
      id: 'mock-api-key-id',
      key: 'mock-api-key-value',
      description: 'mock-api-key-name',
    }),
    exchangeOAuthToken: jest.fn().mockResolvedValue('mock-ephemeral-token'),
    revokeApiKey: jest.fn().mockResolvedValue(undefined),
    convertApiKeys: jest.fn().mockResolvedValue({ results: [] }),
    exchangeServiceAccountToken: jest
      .fn()
      .mockResolvedValue({ token: 'essu_mock-service-account-token' }),
    createServiceAccount: jest.fn().mockResolvedValue({
      id: 'mock-service-account-id',
      type: 'project' as const,
      name: 'mock-service-account-name',
      organization_id: 'mock-organization-id',
      role_assignments: {},
      assumable_by: [],
    }),
    createOAuthClient: jest.fn().mockResolvedValue({
      id: 'mock-client-id',
      resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
    }),
    listOAuthClients: jest.fn().mockResolvedValue({ clients: [] }),
    updateOAuthClient: jest.fn().mockResolvedValue({
      id: 'mock-client-id',
      resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
    }),
    revokeOAuthClient: jest.fn().mockResolvedValue({
      id: 'mock-client-id',
      resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
      revoked: true,
    }),
    deleteOAuthClient: jest.fn().mockResolvedValue(undefined),
    listOAuthConnections: jest.fn().mockResolvedValue({ connections: [] }),
    updateOAuthConnection: jest.fn().mockResolvedValue({
      id: 'mock-connection-id',
      client_id: 'mock-client-id',
      resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
      name: 'mock-connection-name',
    }),
    revokeOAuthConnection: jest.fn().mockResolvedValue({
      id: 'mock-connection-id',
      client_id: 'mock-client-id',
      resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
      revoked: true,
    }),
    deleteOAuthConnection: jest.fn().mockResolvedValue(undefined),
    resolveUsers: jest.fn().mockResolvedValue({ users: {} }),
  }),
};
