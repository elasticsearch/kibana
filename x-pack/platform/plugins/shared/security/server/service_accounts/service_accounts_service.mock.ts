/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';

import type { ServiceAccountsServiceStart } from './types';

export const serviceAccountsServiceMock = {
  createStart: (): jest.Mocked<ServiceAccountsServiceStart> => ({
    create: jest.fn().mockResolvedValue({
      id: 'mock-service-account-id',
      type: 'project' as const,
      name: 'mock-service-account-name',
      organization_id: 'mock-organization-id',
      role_assignments: {},
      assumable_by: [],
    }),
    createFakeRequest: jest.fn().mockImplementation(async () =>
      httpServerMock.createFakeKibanaRequest({
        headers: { authorization: 'Bearer essu_mock-service-account-token' },
      })
    ),
    reauthenticateFakeRequest: jest.fn().mockResolvedValue(null),
  }),
};
