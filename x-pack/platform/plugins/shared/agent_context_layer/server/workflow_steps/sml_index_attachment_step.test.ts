/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import type { SmlIndexAttachmentInputSchema } from '../../common/workflow_steps/sml_index_attachment_step';
import { apiPrivileges } from '../../common/features';
import type { AgentContextLayerPluginStart } from '../types';
import { createContextEngineAddEntryStepDefinition } from './sml_index_attachment_step';

const buildStartContract = (): jest.Mocked<AgentContextLayerPluginStart> => ({
  search: jest.fn(),
  getDocuments: jest.fn(),
  // Default: treat any type as registered. Individual tests can override.
  getTypeDefinition: jest.fn().mockImplementation((id: string) => ({ id } as any)),
  resolveSmlAttachItems: jest.fn(),
  indexAttachment: jest.fn().mockResolvedValue(undefined),
  deleteAttachment: jest.fn().mockResolvedValue(undefined),
});

/**
 * Builds a security mock whose privilege check returns `authorized` for
 * every requested kibana privilege. The expanded `api:` form returned by
 * `actions.api.get(...)` is what we'd see at runtime — we mirror that here
 * so the assertions below can match on the same value.
 */
const buildSecurity = ({ authorized = true }: { authorized?: boolean } = {}): jest.Mocked<
  Pick<SecurityPluginStart, 'authz'>
> & {
  authz: {
    actions: { api: { get: jest.Mock } };
    checkPrivilegesDynamicallyWithRequest: jest.Mock;
  };
} => {
  const checkPrivileges = jest
    .fn()
    .mockImplementation(async ({ kibana }: { kibana: string[] }) => ({
      hasAllRequested: authorized,
      privileges: {
        kibana: kibana.map((privilege) => ({ privilege, authorized })),
      },
    }));
  return {
    authz: {
      actions: {
        api: {
          get: jest.fn((privilege: string) => `api:${privilege}`),
        },
      },
      checkPrivilegesDynamicallyWithRequest: jest.fn().mockReturnValue(checkPrivileges),
    },
  } as any;
};

// Reuse the Zod schema as the source of truth for the test input shape so
// the test fixtures cannot silently drift from the contract.
type StepInput = z.infer<typeof SmlIndexAttachmentInputSchema>;

const buildHandlerContext = (input: StepInput, request = httpServerMock.createKibanaRequest()) => ({
  input,
  config: {},
  rawInput: input,
  contextManager: {
    getContext: jest.fn(),
    getScopedEsClient: jest.fn(),
    renderInputTemplate: jest.fn((value: unknown) => value),
    getFakeRequest: jest.fn().mockReturnValue(request),
  },
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  abortSignal: new AbortController().signal,
  stepId: 'test-step',
  stepType: 'contextEngine.addEntry',
});

// Minimal `spaces` mock — only `spacesService.getSpaceId` is consumed. The
// `Pick` makes the partial-mock intent explicit so we don't cast to `any`.
type MockedSpaces = Pick<SpacesPluginStart, 'spacesService'>;

describe('createContextEngineAddEntryStepDefinition', () => {
  it('exposes the expected step type id, schemas, and tech-preview stability', () => {
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => buildStartContract(),
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });
    expect(definition.id).toBe('contextEngine.addEntry');
    expect(definition.stability).toBe('tech_preview');
    expect(definition.inputSchema).toBeDefined();
    expect(definition.outputSchema).toBeDefined();
    expect(typeof definition.handler).toBe('function');
  });

  it('forwards caller-supplied chunks as content-mode write for upsert', async () => {
    const startContract = buildStartContract();
    const spaces: MockedSpaces = {
      spacesService: { getSpaceId: jest.fn().mockReturnValue('test-space') } as any,
    };
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => spaces as SpacesPluginStart,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const request = httpServerMock.createKibanaRequest();
    const context = buildHandlerContext(
      {
        originId: 'doc-42',
        attachmentType: 'custom',
        action: 'upsert',
        chunks: [
          {
            type: 'custom',
            title: 'My title',
            content: 'My content',
            description: 'desc',
          },
        ],
      },
      request
    );

    const result = await definition.handler(context as any);

    expect(startContract.indexAttachment).toHaveBeenCalledWith({
      request,
      originId: 'doc-42',
      attachmentType: 'custom',
      // 'upsert' is translated to 'create' on the start contract — see
      // handler comment for why.
      action: 'create',
      // Workflow writes always go through content-mode → manual chunks.
      content: [
        {
          type: 'custom',
          title: 'My title',
          content: 'My content',
          description: 'desc',
          permissions: { kibana: { privileges: [] }, elasticsearch: { indices: [] } },
        },
      ],
    });
    expect(result).toEqual({
      output: {
        originId: 'doc-42',
        attachmentType: 'custom',
        action: 'upsert',
        spaceId: 'test-space',
        requestedChunkCount: 1,
        acknowledged: true,
      },
    });
  });

  it('strips optional chunk fields when not provided', async () => {
    const startContract = buildStartContract();
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'custom',
      action: 'upsert',
      chunks: [{ type: 'custom', title: 't', content: 'c' }],
    });

    await definition.handler(context as any);
    const callArgs = startContract.indexAttachment.mock.calls[0][0];
    expect((callArgs as any).content).toEqual([
      {
        type: 'custom',
        title: 't',
        content: 'c',
        permissions: { kibana: { privileges: [] }, elasticsearch: { indices: [] } },
      },
    ]);
    expect(Object.keys((callArgs as any).content[0])).toEqual([
      'type',
      'title',
      'content',
      'permissions',
    ]);
  });

  it('preserves optional chunk fields when provided', async () => {
    const startContract = buildStartContract();
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'custom',
      action: 'upsert',
      chunks: [
        {
          type: 'custom',
          title: 't',
          content: 'c',
          description: 'd',
          user_id: 'u',
          references: ['r1'],
          permissions: ['p1'],
          elasticsearchIndices: ['idx1'],
        },
      ],
    });

    await definition.handler(context as any);
    const callArgs = startContract.indexAttachment.mock.calls[0][0];
    expect((callArgs as any).content[0]).toEqual({
      type: 'custom',
      title: 't',
      content: 'c',
      description: 'd',
      user_id: 'u',
      references: [{ uri: 'r1' }],
      permissions: {
        kibana: { privileges: [{ name: 'p1' }] },
        elasticsearch: { indices: [{ name: 'idx1' }] },
      },
    });
  });

  it('handles delete by calling deleteAttachment with ingestionMethod="all" and reports requestedChunkCount = 0', async () => {
    const startContract = buildStartContract();
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'custom',
      action: 'delete',
    });

    const result = await definition.handler(context as any);

    expect(startContract.deleteAttachment).toHaveBeenCalledWith({
      request: expect.anything(),
      originId: 'doc-1',
      attachmentType: 'custom',
      // Workflow steps "own" the origin they wrote → wipe everything.
      // 'all' tells the AGL indexer to skip the ingestion_method filter
      // and remove every chunk for the origin (manual + crawled).
      ingestionMethod: 'all',
    });
    // Delete uses the dedicated `deleteAttachment` method on the contract,
    // not `indexAttachment` — keeps "delete with custom scope" out of the
    // index-mutation API surface.
    expect(startContract.indexAttachment).not.toHaveBeenCalled();
    expect(result).toEqual({
      output: expect.objectContaining({
        action: 'delete',
        spaceId: 'default',
        requestedChunkCount: 0,
        acknowledged: true,
      }),
    });
  });

  it('allows delete to proceed when the attachment type is not registered', async () => {
    const startContract = buildStartContract();
    startContract.getTypeDefinition.mockReturnValue(undefined);
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    // Cleanup must remain functional after the plugin that registered the
    // type is disabled — otherwise stale chunks become unreachable from
    // the workflow surface.
    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'unregistered-but-was-written-before',
      action: 'delete',
    });

    const result = await definition.handler(context as any);

    expect(startContract.deleteAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentType: 'unregistered-but-was-written-before',
        ingestionMethod: 'all',
      })
    );
    // The type-definition lookup must NOT be consulted for delete.
    expect(startContract.getTypeDefinition).not.toHaveBeenCalled();
    expect(result.error).toBeUndefined();
    expect(result.output?.action).toBe('delete');
  });

  it('returns an error result when upsert targets an unregistered attachment type', async () => {
    const startContract = buildStartContract();
    startContract.getTypeDefinition.mockReturnValueOnce(undefined);
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'unknown',
      action: 'upsert',
      chunks: [{ type: 'unknown', title: 't', content: 'c' }],
    });

    const result = await definition.handler(context as any);
    expect(result.output).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe("Unknown Context Engine entry type: 'unknown'");
    expect(startContract.indexAttachment).not.toHaveBeenCalled();
  });

  it('returns an error result and logs when indexAttachment throws', async () => {
    const startContract = buildStartContract();
    startContract.indexAttachment.mockRejectedValueOnce(new Error('ES write failed'));
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'custom',
      action: 'upsert',
      chunks: [{ type: 'custom', title: 't', content: 'c' }],
    });

    const result = await definition.handler(context as any);
    expect(result.output).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('ES write failed');
    expect(context.logger.error).toHaveBeenCalledWith(
      'contextEngine.addEntry workflow step failed',
      expect.any(Error)
    );
  });

  it('returns an error when the start contract is not yet available', async () => {
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => {
        throw new Error('start contract not ready');
      },
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'custom',
      action: 'upsert',
      chunks: [{ type: 'custom', title: 't', content: 'c' }],
    });

    const result = await definition.handler(context as any);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('start contract not ready');
  });

  it('falls back to "default" space when spaces service is unavailable', async () => {
    const startContract = buildStartContract();
    const definition = createContextEngineAddEntryStepDefinition({
      getStartContract: () => startContract,
      getSpaces: () => undefined,
      getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
      isFeatureEnabled: async () => true,
    });

    const context = buildHandlerContext({
      originId: 'doc-1',
      attachmentType: 'custom',
      action: 'upsert',
      chunks: [{ type: 'custom', title: 't', content: 'c' }],
    });

    const result = await definition.handler(context as any);
    expect(result.output?.spaceId).toBe('default');
  });

  describe('agentContextLayer:write privilege check', () => {
    it('checks the privilege against the workflow fake request and dispatches the write when authorized', async () => {
      const startContract = buildStartContract();
      const security = buildSecurity({ authorized: true });
      const definition = createContextEngineAddEntryStepDefinition({
        getStartContract: () => startContract,
        getSpaces: () => undefined,
        getSecurity: () => security as unknown as SecurityPluginStart,
        isFeatureEnabled: async () => true,
      });

      const request = httpServerMock.createKibanaRequest();
      const context = buildHandlerContext(
        {
          originId: 'doc-1',
          attachmentType: 'custom',
          action: 'upsert',
          chunks: [{ type: 'custom', title: 't', content: 'c' }],
        },
        request
      );

      const result = await definition.handler(context as any);

      expect(security.authz.actions.api.get).toHaveBeenCalledWith(
        apiPrivileges.writeAgentContextLayer
      );
      expect(security.authz.checkPrivilegesDynamicallyWithRequest).toHaveBeenCalledWith(request);
      const checkPrivileges =
        security.authz.checkPrivilegesDynamicallyWithRequest.mock.results[0].value;
      // The security mock expands the api action via `actions.api.get`,
      // so we expect the wrapped `api:` form here — same as what runtime
      // `checkPrivilegesDynamicallyWithRequest` would receive.
      expect(checkPrivileges).toHaveBeenCalledWith({
        kibana: [`api:${apiPrivileges.writeAgentContextLayer}`],
      });
      expect(result.error).toBeUndefined();
      expect(startContract.indexAttachment).toHaveBeenCalledTimes(1);
    });

    it('rejects upsert with an error and never calls indexAttachment when the caller lacks the privilege', async () => {
      const startContract = buildStartContract();
      const security = buildSecurity({ authorized: false });
      const definition = createContextEngineAddEntryStepDefinition({
        getStartContract: () => startContract,
        getSpaces: () => undefined,
        getSecurity: () => security as unknown as SecurityPluginStart,
        isFeatureEnabled: async () => true,
      });

      const context = buildHandlerContext({
        originId: 'doc-1',
        attachmentType: 'custom',
        action: 'upsert',
        chunks: [{ type: 'custom', title: 't', content: 'c' }],
      });

      const result = await definition.handler(context as any);

      expect(result.output).toBeUndefined();
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toContain(apiPrivileges.writeAgentContextLayer);
      expect((result.error as Error).message).toContain('upsert');
      expect(startContract.indexAttachment).not.toHaveBeenCalled();
      // The type-definition lookup happens after the privilege gate, so it
      // must not be consulted when the caller is unauthorized.
      expect(startContract.getTypeDefinition).not.toHaveBeenCalled();
    });

    it('rejects delete with an error and never calls deleteAttachment when the caller lacks the privilege', async () => {
      const startContract = buildStartContract();
      const security = buildSecurity({ authorized: false });
      const definition = createContextEngineAddEntryStepDefinition({
        getStartContract: () => startContract,
        getSpaces: () => undefined,
        getSecurity: () => security as unknown as SecurityPluginStart,
        isFeatureEnabled: async () => true,
      });

      const context = buildHandlerContext({
        originId: 'doc-1',
        attachmentType: 'custom',
        action: 'delete',
      });

      const result = await definition.handler(context as any);

      expect(result.output).toBeUndefined();
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toContain(apiPrivileges.writeAgentContextLayer);
      expect((result.error as Error).message).toContain('delete');
      expect(startContract.deleteAttachment).not.toHaveBeenCalled();
    });

    it('skips the privilege check and proceeds when the security plugin is absent', async () => {
      const startContract = buildStartContract();
      const definition = createContextEngineAddEntryStepDefinition({
        getStartContract: () => startContract,
        getSpaces: () => undefined,
        getSecurity: () => undefined,
        isFeatureEnabled: async () => true,
      });

      const context = buildHandlerContext({
        originId: 'doc-1',
        attachmentType: 'custom',
        action: 'upsert',
        chunks: [{ type: 'custom', title: 't', content: 'c' }],
      });

      const result = await definition.handler(context as any);

      expect(result.error).toBeUndefined();
      expect(startContract.indexAttachment).toHaveBeenCalledTimes(1);
      expect(context.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('security plugin is not available')
      );
    });
  });

  describe('experimental feature-flag check', () => {
    it('calls isFeatureEnabled with the workflow fake request and proceeds when enabled', async () => {
      const startContract = buildStartContract();
      const isFeatureEnabled = jest.fn().mockResolvedValue(true);
      const definition = createContextEngineAddEntryStepDefinition({
        getStartContract: () => startContract,
        getSpaces: () => undefined,
        getSecurity: () => buildSecurity() as unknown as SecurityPluginStart,
        isFeatureEnabled,
      });

      const request = httpServerMock.createKibanaRequest();
      const context = buildHandlerContext(
        {
          originId: 'doc-1',
          attachmentType: 'custom',
          action: 'upsert',
          chunks: [{ type: 'custom', title: 't', content: 'c' }],
        },
        request
      );

      const result = await definition.handler(context as any);

      expect(isFeatureEnabled).toHaveBeenCalledWith(request);
      expect(result.error).toBeUndefined();
      expect(startContract.indexAttachment).toHaveBeenCalledTimes(1);
    });

    it('rejects upsert with an error and never calls indexAttachment when the feature flag is disabled', async () => {
      const startContract = buildStartContract();
      const security = buildSecurity({ authorized: true });
      const definition = createContextEngineAddEntryStepDefinition({
        getStartContract: () => startContract,
        getSpaces: () => undefined,
        getSecurity: () => security as unknown as SecurityPluginStart,
        isFeatureEnabled: async () => false,
      });

      const context = buildHandlerContext({
        originId: 'doc-1',
        attachmentType: 'custom',
        action: 'upsert',
        chunks: [{ type: 'custom', title: 't', content: 'c' }],
      });

      const result = await definition.handler(context as any);

      expect(result.output).toBeUndefined();
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toContain('experimental features are disabled');
      expect((result.error as Error).message).toContain('upsert');
      expect(startContract.indexAttachment).not.toHaveBeenCalled();
      // Privilege check must be skipped — the feature-flag gate is an
      // earlier short-circuit and should prevent any work, including a
      // network round-trip to the security plugin.
      expect(security.authz.checkPrivilegesDynamicallyWithRequest).not.toHaveBeenCalled();
    });

    it('rejects delete with an error and never calls deleteAttachment when the feature flag is disabled', async () => {
      const startContract = buildStartContract();
      const security = buildSecurity({ authorized: true });
      const definition = createContextEngineAddEntryStepDefinition({
        getStartContract: () => startContract,
        getSpaces: () => undefined,
        getSecurity: () => security as unknown as SecurityPluginStart,
        isFeatureEnabled: async () => false,
      });

      const context = buildHandlerContext({
        originId: 'doc-1',
        attachmentType: 'custom',
        action: 'delete',
      });

      const result = await definition.handler(context as any);

      expect(result.output).toBeUndefined();
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toContain('experimental features are disabled');
      expect((result.error as Error).message).toContain('delete');
      expect(startContract.deleteAttachment).not.toHaveBeenCalled();
      expect(security.authz.checkPrivilegesDynamicallyWithRequest).not.toHaveBeenCalled();
    });
  });
});
