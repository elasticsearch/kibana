/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { MockedLogger } from '@kbn/logging-mocks';
import { generateExecutorFunction } from './generate_executor_function';
import { setConnectorActionErrorMeta } from '@kbn/connector-specs';
import type {
  ActionContext,
  BuildContext,
  ConnectorNetwork,
  ConnectorSpec,
} from '@kbn/connector-specs';
import type { GetAxiosInstanceWithAuthFn, GetCredentialFn } from '../get_axios_instance';
import { LeasePool } from '../lease_pool';
import { createConnectorNetwork } from './create_connector_network';
import type { ActionsConfigurationUtilities } from '../../actions_config';
import { TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { getErrorSource } from '@kbn/task-manager-plugin/server/task_running';

describe('generateExecutorFunction', () => {
  const connectorId = 'test-connector-id';

  let logger: MockedLogger;
  let mockGetAxiosInstanceWithAuth: jest.MockedFunction<GetAxiosInstanceWithAuthFn>;
  let mockGetCredential: jest.MockedFunction<GetCredentialFn>;
  let mockCredential: { getAuthHeaders: jest.Mock };
  let mockAxiosInstance: object;
  let mockHandler: jest.Mock;
  let fakeLeasePool: LeasePool<unknown>;
  let mockNetwork: ConnectorNetwork;

  const makeExecOptions = (params: Record<string, unknown>) =>
    ({
      actionId: connectorId,
      config: { url: 'https://example.com' },
      secrets: { token: 'secret' },
      params,
      logger,
      connectorTokenClient: undefined,
      globalAuthHeaders: undefined,
      signal: undefined,
      authMode: undefined,
      profileUid: undefined,
      // satisfies the type but unused by the function under test
      services: {} as never,
      configurationUtilities: {} as never,
      connectorUsageCollector: {} as never,
    } as Parameters<ReturnType<typeof generateExecutorFunction>>[0]);

  beforeEach(() => {
    jest.resetAllMocks();
    logger = loggingSystemMock.createLogger();
    mockAxiosInstance = { get: jest.fn() };
    mockGetAxiosInstanceWithAuth = jest.fn().mockResolvedValue(mockAxiosInstance);
    mockCredential = {
      getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer secret' }),
    };
    mockGetCredential = jest.fn().mockReturnValue(mockCredential);
    mockHandler = jest.fn().mockResolvedValue({ result: 'ok' });
    fakeLeasePool = new LeasePool<unknown>();
    mockNetwork = { ensureUriAllowed: jest.fn(), ensureHostnameAllowed: jest.fn() };
  });

  const makeActions = (handler: jest.Mock = mockHandler): ConnectorSpec['actions'] => ({
    testAction: {
      isTool: true,
      input: {} as never,
      handler,
    },
  });

  const makeExecutor = (handler: jest.Mock = mockHandler) =>
    generateExecutorFunction({
      actions: makeActions(handler),
      getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
      getCredential: mockGetCredential,
      getClientLeasePool: () => fakeLeasePool,
      network: mockNetwork,
    });

  describe('successful execution', () => {
    it('returns status ok with handler result as data', async () => {
      const executor = makeExecutor();

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: { foo: 'bar' } })
      );

      expect(result).toEqual({ status: 'ok', data: { result: 'ok' }, actionId: connectorId });
    });

    it('passes subActionParams to the handler', async () => {
      const executor = makeExecutor();

      const subActionParams = { message: 'hello', count: 3 };
      await executor(makeExecOptions({ subAction: 'testAction', subActionParams }));

      expect(mockHandler).toHaveBeenCalledWith(expect.anything(), subActionParams);
    });

    it('passes config, secrets, axios instance, and getClient in the handler context', async () => {
      const config = { url: 'https://example.com' };
      const secrets = { token: 'secret' };

      const executor = makeExecutor();

      const opts = makeExecOptions({ subAction: 'testAction', subActionParams: {} });
      await executor({ ...opts, config, secrets });

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          log: logger,
          client: mockAxiosInstance,
          config,
          secrets,
          getClient: expect.any(Function),
        }),
        {}
      );
    });

    it('returns empty object as data when handler returns null', async () => {
      mockHandler.mockResolvedValue(null);

      const executor = makeExecutor();

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({ status: 'ok', data: {}, actionId: connectorId });
    });

    it('returns empty object as data when handler returns undefined', async () => {
      mockHandler.mockResolvedValue(undefined);

      const executor = makeExecutor();

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({ status: 'ok', data: {}, actionId: connectorId });
    });

    it('calls getAxiosInstanceWithAuth with the correct options', async () => {
      const connectorTokenClient = {} as never;
      const globalAuthHeaders = { 'X-Custom': 'value' };
      const signal = new AbortController().signal;
      const authMode = 'basic' as never;
      const profileUid = 'profile-123';

      const executor = makeExecutor();

      await executor({
        ...makeExecOptions({ subAction: 'testAction', subActionParams: {} }),
        connectorTokenClient,
        globalAuthHeaders,
        signal,
        authMode,
        profileUid,
      });

      expect(mockGetAxiosInstanceWithAuth).toHaveBeenCalledWith({
        connectorId,
        connectorTokenClient,
        additionalHeaders: globalAuthHeaders,
        secrets: { token: 'secret' },
        signal,
        authMode,
        profileUid,
      });
    });

    it('passes fetchOptions max_content_length to getAxiosInstanceWithAuth', async () => {
      const executor = makeExecutor();

      await executor(
        makeExecOptions({
          subAction: 'testAction',
          subActionParams: {},
          fetchOptions: { max_content_length: 20 * 1024 * 1024 },
        })
      );

      expect(mockGetAxiosInstanceWithAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          maxContentLength: 20 * 1024 * 1024,
        })
      );
    });
  });

  describe('ctx.getClient - build receives network from generateExecutorFunction', () => {
    it('passes network to clientType.build', async () => {
      const fakeClient = { id: 'x' };
      const buildSpy = jest.fn().mockResolvedValue(fakeClient);
      const fakeClientType = {
        id: 'typed',
        build: buildSpy,
        terminate: jest.fn(),
      };

      const executor = generateExecutorFunction({
        actions: {
          testAction: {
            isTool: true,
            input: {} as never,
            handler: jest.fn(async (ctx: ActionContext) => {
              await (ctx.getClient as unknown as (id: string) => Promise<unknown>)('typed');
              return {};
            }),
          },
        },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => fakeLeasePool,
        network: mockNetwork,
        clientTypes: { typed: fakeClientType },
      });

      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));

      expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({ network: mockNetwork }));
    });

    it('passes credential to clientType.build from getCredential', async () => {
      const fakeClient = { id: 'x' };
      const buildSpy = jest.fn().mockResolvedValue(fakeClient);
      const fakeClientType = {
        id: 'typed',
        build: buildSpy,
        terminate: jest.fn(),
      };

      const executor = generateExecutorFunction({
        actions: {
          testAction: {
            isTool: true,
            input: {} as never,
            handler: jest.fn(async (ctx: ActionContext) => {
              await (ctx.getClient as unknown as (id: string) => Promise<unknown>)('typed');
              return {};
            }),
          },
        },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => fakeLeasePool,
        network: mockNetwork,
        clientTypes: { typed: fakeClientType },
      });

      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));

      expect(mockGetCredential).toHaveBeenCalledWith({
        connectorId,
        secrets: { token: 'secret' },
        connectorTokenClient: undefined,
        authMode: undefined,
        profileUid: undefined,
      });
      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: mockCredential,
        })
      );

      const buildContext = buildSpy.mock.calls[0][0] as { credential: typeof mockCredential };
      await buildContext.credential.getAuthHeaders();
      expect(mockCredential.getAuthHeaders).toHaveBeenCalled();
    });
  });

  describe('ctx.getClient — lease receives clientType.terminate as 3rd arg', () => {
    it('passes clientType.terminate to pool.lease', async () => {
      const terminateSpy = jest.fn().mockResolvedValue(undefined);
      const fakeClient = { id: 'x' };
      const fakeClientType = {
        id: 'typed',
        build: jest.fn().mockResolvedValue(fakeClient),
        terminate: terminateSpy,
      };

      const leaseSpy = jest.spyOn(fakeLeasePool, 'lease');

      const executor = generateExecutorFunction({
        actions: {
          testAction: {
            isTool: true,
            input: {} as never,
            handler: jest.fn(async (ctx: ActionContext) => {
              await (ctx.getClient as unknown as (id: string) => Promise<unknown>)('typed');
              return {};
            }),
          },
        },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => fakeLeasePool,
        network: mockNetwork,
        clientTypes: { typed: fakeClientType },
      });

      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));

      expect(leaseSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Function), terminateSpy);
    });
  });

  describe('ctx.getClient (pooled client access)', () => {
    type GetClient = (id: string) => Promise<unknown>;

    it('builds client once for N sequential requests (reuse)', async () => {
      let buildCount = 0;
      const fakeClient = { id: 'fake-client' };
      const fakeClientType = {
        id: 'fake',
        build: jest.fn(async () => {
          buildCount++;
          return fakeClient;
        }),
        terminate: jest.fn(),
      };

      const capturedGetClients: GetClient[] = [];
      const handler = jest.fn(async (ctx: ActionContext) => {
        capturedGetClients.push(ctx.getClient as unknown as GetClient);
        return {};
      });

      const pool = new LeasePool<unknown>();
      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: { fake: fakeClientType },
      });

      // 3 sequential calls with same connectorId
      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));
      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));
      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));

      // Request the client through each captured getClient
      await Promise.all(capturedGetClients.map((getClient) => getClient('fake')));

      expect(buildCount).toBe(1);
    });

    it('does not build when no client is requested (untouched → no build)', async () => {
      let buildCount = 0;
      const fakeClientType = {
        id: 'unused',
        build: jest.fn(async () => {
          buildCount++;
          return {};
        }),
        terminate: jest.fn(),
      };

      const pool = new LeasePool<unknown>();
      const executor = generateExecutorFunction({
        actions: makeActions(),
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: { unused: fakeClientType },
      });

      // Call executor but handler never calls ctx.getClient
      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));

      expect(buildCount).toBe(0);
    });

    it('surfaces a build rejection from getClient as a thrown FRAMEWORK-tagged error', async () => {
      const fakeClientType = {
        id: 'failing',
        build: jest.fn(async () => {
          throw new Error('build exploded');
        }),
        terminate: jest.fn(),
      };

      const pool = new LeasePool<unknown>();
      const handler = jest.fn(async (ctx: ActionContext) => {
        await (ctx.getClient as unknown as GetClient)('failing'); // triggers build
        return {};
      });

      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: { failing: fakeClientType },
      });

      const thrown = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      ).catch((e) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect(getErrorSource(thrown)).toBe(TaskErrorSource.FRAMEWORK);
    });

    it('tags a build failure as USER when clientType.isUserError returns true', async () => {
      const buildError = new Error('config.serverUrl is required');
      const fakeClientType = {
        id: 'typed',
        build: jest.fn().mockRejectedValue(buildError),
        terminate: jest.fn().mockResolvedValue(undefined),
        isUserError: jest.fn().mockReturnValue(true),
      };

      const pool = new LeasePool<unknown>();
      const handler = jest.fn(async (ctx: ActionContext) => {
        await (ctx.getClient as unknown as GetClient)('typed');
        return {};
      });

      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: { typed: fakeClientType },
      });

      const thrown = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      ).catch((e) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect(getErrorSource(thrown)).toBe(TaskErrorSource.USER);
    });

    it('MCP 401 connect failure surfaces with USER tag (end-to-end via isUserError seam)', async () => {
      const mcpError = Object.assign(
        new Error('Unauthorized error: Error POSTing to endpoint: Unauthorized'),
        { httpStatus: 401 }
      );
      const fakeClientType = {
        id: 'mcp',
        build: jest.fn().mockRejectedValue(mcpError),
        terminate: jest.fn().mockResolvedValue(undefined),
        isUserError: (err: unknown) => {
          const e = err as { httpStatus?: number };
          return (
            typeof e?.httpStatus === 'number' && (e.httpStatus === 401 || e.httpStatus === 403)
          );
        },
      };

      const pool = new LeasePool<unknown>();
      const handler = jest.fn(async (ctx: ActionContext) => {
        await (ctx.getClient as unknown as GetClient)('mcp');
        return {};
      });

      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: { mcp: fakeClientType },
      });

      const thrown = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      ).catch((e) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect(getErrorSource(thrown)).toBe(TaskErrorSource.USER);
    });

    it('MCP 500 connect failure surfaces with FRAMEWORK tag', async () => {
      const mcpError = Object.assign(new Error('Streamable HTTP error: Internal Server Error'), {
        httpStatus: 500,
      });
      const fakeClientType = {
        id: 'mcp',
        build: jest.fn().mockRejectedValue(mcpError),
        terminate: jest.fn().mockResolvedValue(undefined),
        isUserError: (err: unknown) => {
          const e = err as { httpStatus?: number };
          return (
            typeof e?.httpStatus === 'number' && (e.httpStatus === 401 || e.httpStatus === 403)
          );
        },
      };

      const pool = new LeasePool<unknown>();
      const handler = jest.fn(async (ctx: ActionContext) => {
        await (ctx.getClient as unknown as GetClient)('mcp');
        return {};
      });

      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: { mcp: fakeClientType },
      });

      const thrown = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      ).catch((e) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect(getErrorSource(thrown)).toBe(TaskErrorSource.FRAMEWORK);
    });

    it('tags an allowlist (SSRF) denial as USER, not a retryable FRAMEWORK error', async () => {
      // Real network seam over a config that denies every host, i.e. the connector's
      // serverUrl is no longer on xpack.actions.allowedHosts (tightened after save).
      const denyingConfigUtils = {
        ensureUriAllowed: (uri: string) => {
          throw new Error(
            `target url "${uri}" is not added to the Kibana config xpack.actions.allowedHosts`
          );
        },
        ensureHostnameAllowed: (host: string) => {
          throw new Error(
            `target hostname "${host}" is not added to the Kibana config xpack.actions.allowedHosts`
          );
        },
      } as unknown as ActionsConfigurationUtilities;
      const network = createConnectorNetwork(denyingConfigUtils);

      const fakeClientType = {
        id: 'mcp',
        // build runs the allowlist check at connect time, like mcpClientType does.
        build: jest.fn(async (ctx: BuildContext) => {
          ctx.network.ensureUriAllowed('http://denied.example');
          return {};
        }),
        terminate: jest.fn().mockResolvedValue(undefined),
        // No client-level isUserError on purpose: an allowlist denial must be
        // classified by the framework seam, not by each client string-matching a message.
      };

      const pool = new LeasePool<unknown>();
      const handler = jest.fn(async (ctx: ActionContext) => {
        await (ctx.getClient as unknown as GetClient)('mcp');
        return {};
      });

      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network,
        clientTypes: { mcp: fakeClientType },
      });

      const thrown = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      ).catch((e) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect(getErrorSource(thrown)).toBe(TaskErrorSource.USER);
    });

    it('returns {status:error} for an untagged handler error — no getClient involved (regression)', async () => {
      mockHandler.mockRejectedValue(new Error('direct handler failure'));

      const result = await makeExecutor()(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({
        status: 'error',
        message: 'direct handler failure',
        actionId: connectorId,
      });
    });

    it('surfaces a request for an unknown client type id as an error result', async () => {
      const pool = new LeasePool<unknown>();
      const handler = jest.fn(async (ctx: ActionContext) => {
        await (ctx.getClient as unknown as GetClient)('nope');
        return {};
      });

      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: {},
      });

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toMatchObject({
        status: 'error',
        message: '[Action][ExternalService] Unknown client type nope.',
      });
    });

    it('distinct connectorIds → distinct pool entries (isolation)', async () => {
      let buildCount = 0;
      const fakeClientType = {
        id: 'fake',
        build: jest.fn(async () => {
          buildCount++;
          return { buildNumber: buildCount };
        }),
        terminate: jest.fn(),
      };

      const pool = new LeasePool<unknown>();
      const capturedGetClients: GetClient[] = [];
      const handler = jest.fn(async (ctx: ActionContext) => {
        capturedGetClients.push(ctx.getClient as unknown as GetClient);
        return {};
      });

      const executor = generateExecutorFunction({
        actions: { testAction: { isTool: true, input: {} as never, handler } },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => pool,
        network: mockNetwork,
        clientTypes: { fake: fakeClientType },
      });

      const makeOptsFor = (id: string) =>
        ({
          ...makeExecOptions({ subAction: 'testAction', subActionParams: {} }),
          actionId: id,
        } as Parameters<typeof executor>[0]);

      await executor(makeOptsFor('connector-1'));
      await executor(makeOptsFor('connector-2'));

      const [c1, c2] = await Promise.all(capturedGetClients.map((getClient) => getClient('fake')));

      expect(buildCount).toBe(2);
      expect(c1).not.toBe(c2);
    });
  });

  describe('unrecognized subAction', () => {
    it('throws and logs an error for an unknown subAction', async () => {
      const executor = makeExecutor();

      await expect(
        executor(makeExecOptions({ subAction: 'unknownAction', subActionParams: {} }))
      ).rejects.toThrow('[Action][ExternalService] Unsupported subAction type unknownAction.');

      expect(logger.error).toHaveBeenCalledWith(
        '[Action][ExternalService] Unsupported subAction type unknownAction.'
      );
    });

    it('does not call the handler when subAction is not registered', async () => {
      const executor = makeExecutor();

      await expect(
        executor(makeExecOptions({ subAction: 'notRegistered', subActionParams: {} }))
      ).rejects.toThrow();

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('handler error handling', () => {
    it('returns status error with the error message when handler throws an Error', async () => {
      mockHandler.mockRejectedValue(new Error('handler failed'));

      const executor = makeExecutor();

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({
        status: 'error',
        message: 'handler failed',
        actionId: connectorId,
      });
    });

    it('includes content-length from Axios error response headers', async () => {
      const error = new Error('maxContentLength size of 1048576 exceeded') as Error & {
        response?: { headers?: Record<string, string> };
      };
      error.response = { headers: { 'content-length': '10485760' } };
      mockHandler.mockRejectedValue(error);

      const executor = makeExecutor();

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({
        status: 'error',
        message: 'maxContentLength size of 1048576 exceeded',
        actionId: connectorId,
        errorMeta: { contentLengthBytes: 10 * 1024 * 1024 },
      });
    });

    it('uses action responseSizeHeader when extracting Axios error response size', async () => {
      const error = new Error('maxContentLength size of 1048576 exceeded') as Error & {
        request?: { res?: { headers?: Record<string, string> } };
      };
      error.request = { res: { headers: { 'x-resource-size': '2048' } } };
      mockHandler.mockRejectedValue(error);

      const executor = generateExecutorFunction({
        actions: {
          testAction: {
            isTool: true,
            input: {} as never,
            responseSizeHeader: 'x-resource-size',
            handler: mockHandler,
          },
        },
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => fakeLeasePool,
        network: mockNetwork,
      });

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({
        status: 'error',
        message: 'maxContentLength size of 1048576 exceeded',
        actionId: connectorId,
        errorMeta: { contentLengthBytes: 2048 },
      });
    });

    it('merges connector-provided error metadata with Axios header metadata', async () => {
      const error = new Error('maxContentLength size of 1048576 exceeded') as Error & {
        response?: { headers?: Record<string, string> };
      };
      error.response = { headers: { 'content-length': '10485760' } };
      setConnectorActionErrorMeta(error, {
        contentLengthBytes: 20 * 1024 * 1024,
        estimatedOutputBytes: 28 * 1024 * 1024,
      });
      mockHandler.mockRejectedValue(error);

      const executor = makeExecutor();

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({
        status: 'error',
        message: 'maxContentLength size of 1048576 exceeded',
        actionId: connectorId,
        errorMeta: {
          contentLengthBytes: 20 * 1024 * 1024,
          estimatedOutputBytes: 28 * 1024 * 1024,
        },
      });
    });

    it('logs the error message when the handler throws', async () => {
      mockHandler.mockRejectedValue(new Error('handler failed'));

      const executor = makeExecutor();

      await executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }));

      expect(logger.error).toHaveBeenCalledWith(`error on ${connectorId} event: handler failed`);
    });

    it('returns status error with stringified value when handler throws a non-Error', async () => {
      mockHandler.mockRejectedValue('string error');

      const executor = makeExecutor();

      const result = await executor(
        makeExecOptions({ subAction: 'testAction', subActionParams: {} })
      );

      expect(result).toEqual({
        status: 'error',
        message: 'string error',
        actionId: connectorId,
      });
    });

    it('does not throw when handler fails — returns error result instead', async () => {
      mockHandler.mockRejectedValue(new Error('boom'));

      const executor = makeExecutor();

      await expect(
        executor(makeExecOptions({ subAction: 'testAction', subActionParams: {} }))
      ).resolves.toMatchObject({ status: 'error' });
    });
  });

  describe('multiple registered actions', () => {
    it('dispatches to the correct handler based on subAction', async () => {
      const handler1 = jest.fn().mockResolvedValue({ from: 'action1' });
      const handler2 = jest.fn().mockResolvedValue({ from: 'action2' });

      const actions: ConnectorSpec['actions'] = {
        action1: { isTool: true, input: {} as never, handler: handler1 },
        action2: { isTool: true, input: {} as never, handler: handler2 },
      };

      const executor = generateExecutorFunction({
        actions,
        getAxiosInstanceWithAuth: mockGetAxiosInstanceWithAuth,
        getCredential: mockGetCredential,
        getClientLeasePool: () => fakeLeasePool,
        network: mockNetwork,
      });

      const result1 = await executor(
        makeExecOptions({ subAction: 'action1', subActionParams: {} })
      );
      const result2 = await executor(
        makeExecOptions({ subAction: 'action2', subActionParams: {} })
      );

      expect(result1).toEqual({ status: 'ok', data: { from: 'action1' }, actionId: connectorId });
      expect(result2).toEqual({ status: 'ok', data: { from: 'action2' }, actionId: connectorId });
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
