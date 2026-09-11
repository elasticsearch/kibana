/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import { apiPrivileges } from '@kbn/context-engine-plugin/common/features';
import { assertContextEngineWriteAccess } from './assert_context_engine_write_access';

describe('assertContextEngineWriteAccess', () => {
  const request = httpServerMock.createKibanaRequest();
  const spaceId = 'default';

  const createSecurityStart = ({
    hasAllRequested = true,
  }: {
    hasAllRequested?: boolean;
  } = {}) => {
    const security = securityMock.createStart();
    security.authz.checkPrivilegesWithRequest.mockReturnValue({
      atSpace: jest.fn().mockResolvedValue({ hasAllRequested }),
    });
    return security;
  };

  it('throws when the security plugin is unavailable', async () => {
    const getCoreStart = jest.fn().mockResolvedValue(coreMock.createStart());

    await expect(
      assertContextEngineWriteAccess({
        request,
        spaceId,
        getCoreStart,
        getSecurityStart: async () => undefined,
      })
    ).rejects.toThrow('Security plugin is not available.');
  });

  it('throws when Context Engine is disabled in the space', async () => {
    const coreStart = coreMock.createStart();
    coreStart.uiSettings.asScopedToClient = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(false),
    });

    await expect(
      assertContextEngineWriteAccess({
        request,
        spaceId,
        getCoreStart: async () => coreStart,
        getSecurityStart: async () => createSecurityStart(),
      })
    ).rejects.toThrow('Context Engine is not enabled in this space.');
  });

  it('throws when the user lacks write privileges', async () => {
    const coreStart = coreMock.createStart();
    coreStart.uiSettings.asScopedToClient = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(true),
    });
    const security = createSecurityStart({ hasAllRequested: false });

    await expect(
      assertContextEngineWriteAccess({
        request,
        spaceId,
        getCoreStart: async () => coreStart,
        getSecurityStart: async () => security,
      })
    ).rejects.toThrow('Insufficient privileges to update Context Engine AI indices.');
  });

  it('passes when Context Engine is enabled and the user can write', async () => {
    const coreStart = coreMock.createStart();
    const uiSettingsClient = {
      get: jest.fn().mockResolvedValue(true),
    };
    coreStart.uiSettings.asScopedToClient = jest.fn().mockReturnValue(uiSettingsClient);
    const security = createSecurityStart();
    const marketingSpaceId = 'marketing';

    await expect(
      assertContextEngineWriteAccess({
        request,
        spaceId: marketingSpaceId,
        getCoreStart: async () => coreStart,
        getSecurityStart: async () => security,
      })
    ).resolves.toBeUndefined();

    expect(
      coreStart.savedObjects.getUnsafeInternalClient().asScopedToNamespace
    ).toHaveBeenCalledWith(marketingSpaceId);
    expect(uiSettingsClient.get).toHaveBeenCalledWith(CONTEXT_ENGINE_ENABLED_SETTING_ID);
    expect(security.authz.checkPrivilegesWithRequest).toHaveBeenCalledWith(request);
    expect(security.authz.checkPrivilegesWithRequest().atSpace).toHaveBeenCalledWith(
      marketingSpaceId,
      {
        kibana: [apiPrivileges.writeContextEngine],
      }
    );
  });
});
