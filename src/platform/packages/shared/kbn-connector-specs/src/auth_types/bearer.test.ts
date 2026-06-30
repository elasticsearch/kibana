/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { AuthContext } from '../connector_spec';
import { BearerAuth } from './bearer';

const mockAuthContext: AuthContext = {
  getCustomHostSettings: () => undefined,
  getToken: async () => null,
  logger: loggerMock.create(),
  sslSettings: {},
};

describe('BearerAuth', () => {
  describe('getAuthHeaders', () => {
    it('returns Authorization header with bearer token', async () => {
      const { getAuthHeaders } = BearerAuth;
      if (!getAuthHeaders) throw new Error('BearerAuth.getAuthHeaders is not defined');
      await expect(getAuthHeaders(mockAuthContext, { token: 'tok' })).resolves.toEqual({
        Authorization: 'Bearer tok',
      });
    });
  });
});
