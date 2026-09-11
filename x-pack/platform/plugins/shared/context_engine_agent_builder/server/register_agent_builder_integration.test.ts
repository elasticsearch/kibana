/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup } from '@kbn/core/server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { AgentBuilderPluginSetup, AiIndexResolver } from '@kbn/agent-builder-server';
import { registerContextEngineAgentBuilderIntegration } from './register_agent_builder_integration';
import type {
  ContextEngineAgentBuilderPluginStart,
  ContextEngineAgentBuilderStartDependencies,
} from './types';

jest.mock('./agent_builder/tools', () => ({
  registerAgentBuilderTools: jest.fn(),
}));
jest.mock('./attachment_types', () => ({
  registerAttachmentTypes: jest.fn(),
}));

const request = {} as KibanaRequest;

describe('registerContextEngineAgentBuilderIntegration', () => {
  const setup = ({
    aiIndices,
    authorized = true,
  }: {
    aiIndices: unknown[];
    /** Outcome of the privilege check: granted, denied, or the error it rejects with. */
    authorized?: boolean | Error;
  }) => {
    const checkPrivileges =
      authorized instanceof Error
        ? jest.fn().mockRejectedValue(authorized)
        : jest.fn().mockResolvedValue({ hasAllRequested: authorized });
    const security = {
      authz: {
        checkPrivilegesDynamicallyWithRequest: jest.fn().mockReturnValue(checkPrivileges),
        actions: { api: { get: (privilege: string) => `api:${privilege}` } },
      },
    };

    const listVisible = jest.fn().mockResolvedValue(aiIndices);
    const getAiIndexDataReadService = jest.fn().mockReturnValue({ listVisible });
    const asCurrentUser = {};
    const asScoped = jest.fn().mockReturnValue({ asCurrentUser });
    const coreSetup = {
      getStartServices: jest.fn().mockResolvedValue([
        { elasticsearch: { client: { asScoped } } },
        {
          contextEngine: { getAiIndexDataReadService },
          security,
        },
        {},
      ]),
    } as unknown as CoreSetup<
      ContextEngineAgentBuilderStartDependencies,
      ContextEngineAgentBuilderPluginStart
    >;

    let resolver: AiIndexResolver | undefined;
    const agentBuilder = {
      agents: {
        registerAiIndexResolver: jest.fn((registered: AiIndexResolver) => {
          resolver = registered;
        }),
      },
    } as unknown as AgentBuilderPluginSetup;

    registerContextEngineAgentBuilderIntegration({
      coreSetup,
      agentBuilder,
      workflowsManagement: {} as any,
    });

    if (!resolver) {
      throw new Error('Expected an AI Index resolver to be registered');
    }
    return {
      resolver,
      listVisible,
      getAiIndexDataReadService,
      asScoped,
      asCurrentUser,
      security,
      checkPrivileges,
    };
  };

  it('reads visible AI Indices as the requesting user through the data read service', async () => {
    const { resolver, getAiIndexDataReadService, asScoped, asCurrentUser } = setup({
      aiIndices: [],
    });

    await resolver({ ids: ['my-custom'], request });

    expect(asScoped).toHaveBeenCalledWith(request);
    expect(getAiIndexDataReadService).toHaveBeenCalledWith({ esClient: asCurrentUser, request });
  });

  it('registers a resolver mapping registry items to id, esqlTarget (dest.value) and description', async () => {
    const { resolver } = setup({
      aiIndices: [
        {
          id: 'my-custom',
          dest: { type: 'index', value: 'ai-index-idx-custom' },
          description: 'Support tickets.',
        },
      ],
    });

    expect(await resolver({ ids: ['my-custom'], request })).toEqual([
      { id: 'my-custom', esqlTarget: 'ai-index-idx-custom', description: 'Support tickets.' },
    ]);
  });

  it('asks the service for the requested ids only, so just those are probed', async () => {
    const { resolver, listVisible } = setup({
      aiIndices: [{ id: 'wanted', dest: { type: 'index', value: 'idx-wanted' } }],
    });

    expect(await resolver({ ids: ['wanted', 'unknown'], request })).toEqual([
      { id: 'wanted', esqlTarget: 'idx-wanted' },
    ]);
    expect(listVisible).toHaveBeenCalledTimes(1);
    expect(listVisible).toHaveBeenCalledWith(['wanted', 'unknown']);
  });

  it('checks the Context Engine read privilege for the request before disclosing details', async () => {
    const { resolver, security, checkPrivileges } = setup({
      aiIndices: [{ id: 'my-custom', dest: { type: 'index', value: 'idx-custom' } }],
    });

    await resolver({ ids: ['my-custom'], request });

    expect(security.authz.checkPrivilegesDynamicallyWithRequest).toHaveBeenCalledWith(request);
    expect(checkPrivileges).toHaveBeenCalledWith({ kibana: ['api:contextEngine:read'] });
  });

  it('returns no details when the user lacks the Context Engine read privilege', async () => {
    const { resolver, listVisible } = setup({
      aiIndices: [{ id: 'my-custom', dest: { type: 'index', value: 'idx-custom' } }],
      authorized: false,
    });

    expect(await resolver({ ids: ['my-custom'], request })).toEqual([]);
    expect(listVisible).not.toHaveBeenCalled();
  });

  it('propagates privilege-check failures so callers fail closed', async () => {
    const { resolver, listVisible } = setup({
      aiIndices: [{ id: 'my-custom', dest: { type: 'index', value: 'idx-custom' } }],
      authorized: new Error('cluster unreachable'),
    });

    await expect(resolver({ ids: ['my-custom'], request })).rejects.toThrow('cluster unreachable');
    expect(listVisible).not.toHaveBeenCalled();
  });
});
