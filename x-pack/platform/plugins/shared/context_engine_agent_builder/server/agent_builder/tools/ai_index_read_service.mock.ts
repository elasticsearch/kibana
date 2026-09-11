/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { securityMock } from '@kbn/security-plugin/server/mocks';
import type { ContextEnginePluginStart } from '@kbn/context-engine-plugin/server';
import type { AiIndexDataReadServiceApi, AiIndexToolDeps } from './ai_index_read_service';

export const createAiIndexDataReadServiceMock = (): jest.Mocked<AiIndexDataReadServiceApi> => ({
  query: jest.fn(),
  describe: jest.fn(),
  listVisible: jest.fn(),
});

export const createAiIndexToolDepsMock = ({
  authorized = true,
  readService = createAiIndexDataReadServiceMock(),
}: {
  authorized?: boolean;
  readService?: jest.Mocked<AiIndexDataReadServiceApi>;
} = {}) => {
  const security = securityMock.createStart();
  security.authz.checkPrivilegesDynamicallyWithRequest.mockReturnValue(
    jest.fn().mockResolvedValue({ hasAllRequested: authorized })
  );

  const getAiIndexDataReadService = jest.fn().mockReturnValue(readService);
  const contextEngine = { getAiIndexDataReadService } as unknown as ContextEnginePluginStart;

  const deps: AiIndexToolDeps = {
    getContextEngineStart: async () => contextEngine,
    getSecurityStart: async () => security,
  };

  return { deps, readService, security, getAiIndexDataReadService };
};
