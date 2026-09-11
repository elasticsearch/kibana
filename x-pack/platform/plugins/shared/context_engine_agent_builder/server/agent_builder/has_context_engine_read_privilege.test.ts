/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import { apiPrivileges } from '@kbn/context-engine-plugin/common/features';
import { hasContextEngineReadPrivilege } from './has_context_engine_read_privilege';

describe('hasContextEngineReadPrivilege', () => {
  const request = httpServerMock.createKibanaRequest();

  const createSecurityStart = (hasAllRequested: boolean) => {
    const security = securityMock.createStart();
    const checkPrivileges = jest.fn().mockResolvedValue({ hasAllRequested });
    security.authz.checkPrivilegesDynamicallyWithRequest.mockReturnValue(checkPrivileges);
    security.authz.actions.api.get = jest.fn((privilege: string) => `api:${privilege}`);
    return { security, checkPrivileges };
  };

  it('is false when the security plugin is unavailable', async () => {
    await expect(hasContextEngineReadPrivilege({ security: undefined, request })).resolves.toBe(
      false
    );
  });

  it('checks the read privilege for the request space', async () => {
    const { security, checkPrivileges } = createSecurityStart(true);

    await expect(hasContextEngineReadPrivilege({ security, request })).resolves.toBe(true);

    expect(security.authz.checkPrivilegesDynamicallyWithRequest).toHaveBeenCalledWith(request);
    expect(checkPrivileges).toHaveBeenCalledWith({
      kibana: [`api:${apiPrivileges.readContextEngine}`],
    });
  });

  it('is false when the caller lacks the privilege', async () => {
    const { security } = createSecurityStart(false);

    await expect(hasContextEngineReadPrivilege({ security, request })).resolves.toBe(false);
  });
});
