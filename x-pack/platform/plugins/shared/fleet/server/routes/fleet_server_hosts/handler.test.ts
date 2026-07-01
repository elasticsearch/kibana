/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
  SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
} from '../../constants';
import { agentPolicyService, appContextService } from '../../services';
import { fleetServerHostService } from '../../services/fleet_server_host';
import { withDefaultErrorHandler } from '../../services/security/fleet_router';

import { postFleetServerHost, putFleetServerHostHandler } from './handler';

const postFleetServerHostWithErrorHandler = withDefaultErrorHandler(postFleetServerHost);
const putFleetServerHostHandlerWithErrorHandler =
  withDefaultErrorHandler(putFleetServerHostHandler);

describe('fleet server hosts handler', () => {
  const mockContext = {
    core: Promise.resolve({
      savedObjects: {},
      elasticsearch: {
        client: {},
      },
    }),
  } as any;
  const mockResponse = {
    customError: jest.fn().mockImplementation((options) => options),
    ok: jest.fn().mockImplementation((options) => options),
  };

  beforeEach(() => {
    jest.spyOn(appContextService, 'getLogger').mockReturnValue({ error: jest.fn() } as any);
    jest.spyOn(fleetServerHostService, 'create').mockResolvedValue({ id: 'host1' } as any);
    jest.spyOn(fleetServerHostService, 'update').mockResolvedValue({ id: 'host1' } as any);
    jest.spyOn(fleetServerHostService, 'get').mockResolvedValue({
      id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
      host_urls: ['http://elasticsearch:9200'],
    } as any);
    jest
      .spyOn(agentPolicyService, 'bumpAllAgentPoliciesForFleetServerHosts')
      .mockResolvedValue({} as any);
  });

  it('should return error on post in serverless if host url is different from default', async () => {
    jest.spyOn(appContextService, 'getCloud').mockReturnValue({ isServerlessEnabled: true } as any);

    const res = await postFleetServerHostWithErrorHandler(
      mockContext,
      { body: { id: 'host1', host_urls: ['http://localhost:8080'] } } as any,
      mockResponse as any
    );

    expect(res).toEqual({
      body: {
        message: 'Fleet server host must have default URL in serverless: http://elasticsearch:9200',
      },
      statusCode: 403,
    });
  });

  it('should return ok on post in serverless if host url is same as default', async () => {
    jest.spyOn(appContextService, 'getCloud').mockReturnValue({ isServerlessEnabled: true } as any);

    const res = await postFleetServerHostWithErrorHandler(
      mockContext,
      { body: { id: 'host1', host_urls: ['http://elasticsearch:9200'] } } as any,
      mockResponse as any
    );

    expect(res).toEqual({ body: { item: { id: 'host1' } } });
  });

  it('should return ok on post in stateful if host url is different from default', async () => {
    jest
      .spyOn(appContextService, 'getCloud')
      .mockReturnValue({ isServerlessEnabled: false } as any);

    const res = await postFleetServerHostWithErrorHandler(
      mockContext,
      { body: { id: 'host1', host_urls: ['http://localhost:8080'] } } as any,
      mockResponse as any
    );

    expect(res).toEqual({ body: { item: { id: 'host1' } } });
  });

  it('should return error if both ssl.key and secrets.ssl.key are provided', async () => {
    jest
      .spyOn(appContextService, 'getCloud')
      .mockReturnValue({ isServerlessEnabled: false } as any);

    const res = await postFleetServerHostWithErrorHandler(
      mockContext,
      {
        body: {
          id: 'host1',
          host_urls: ['http://localhost:8080'],
          ssl: { key: 'token1' },
          secrets: { ssl: { key: 'token1' } },
        },
      } as any,
      mockResponse as any
    );

    expect(res).toEqual({
      body: { message: 'Cannot specify both ssl.key and secrets.ssl.key' },
      statusCode: 400,
    });
  });

  it('should return error if both ssl.es_key and secrets.ssl.es_key are provided', async () => {
    jest
      .spyOn(appContextService, 'getCloud')
      .mockReturnValue({ isServerlessEnabled: false } as any);

    const res = await postFleetServerHostWithErrorHandler(
      mockContext,
      {
        body: {
          id: 'host1',
          host_urls: ['http://localhost:8080'],
          ssl: { es_key: 'token1' },
          secrets: { ssl: { es_key: 'token1' } },
        },
      } as any,
      mockResponse as any
    );

    expect(res).toEqual({
      body: { message: 'Cannot specify both ssl.es_key and secrets.ssl.es_key' },
      statusCode: 400,
    });
  });

  it('should return error if both ssl.agent_key and secrets.ssl.agent_key are provided', async () => {
    jest
      .spyOn(appContextService, 'getCloud')
      .mockReturnValue({ isServerlessEnabled: false } as any);

    const res = await postFleetServerHostWithErrorHandler(
      mockContext,
      {
        body: {
          id: 'host1',
          host_urls: ['http://localhost:8080'],
          ssl: { agent_key: 'token1' },
          secrets: { ssl: { agent_key: 'token1' } },
        },
      } as any,
      mockResponse as any
    );

    expect(res).toEqual({
      body: { message: 'Cannot specify both ssl.agent_key and secrets.ssl.agent_key' },
      statusCode: 400,
    });
  });

  it('should return error on put in serverless if host url is different from default', async () => {
    jest.spyOn(appContextService, 'getCloud').mockReturnValue({ isServerlessEnabled: true } as any);

    const res = await putFleetServerHostHandlerWithErrorHandler(
      mockContext,
      { body: { host_urls: ['http://localhost:8080'] }, params: { outputId: 'host1' } } as any,
      mockResponse as any
    );

    expect(res).toEqual({
      body: {
        message: 'Fleet server host must have default URL in serverless: http://elasticsearch:9200',
      },
      statusCode: 403,
    });
  });

  it('should return ok on put in serverless if host url is same as default', async () => {
    jest.spyOn(appContextService, 'getCloud').mockReturnValue({ isServerlessEnabled: true } as any);

    const res = await putFleetServerHostHandlerWithErrorHandler(
      mockContext,
      { body: { host_urls: ['http://elasticsearch:9200'] }, params: { outputId: 'host1' } } as any,
      mockResponse as any
    );

    expect(res).toEqual({ body: { item: { id: 'host1' } } });
  });

  it('should return ok on put in serverless if host urls are not passed', async () => {
    jest.spyOn(appContextService, 'getCloud').mockReturnValue({ isServerlessEnabled: true } as any);

    const res = await putFleetServerHostHandlerWithErrorHandler(
      mockContext,
      { body: { name: ['Renamed'] }, params: { outputId: 'host1' } } as any,
      mockResponse as any
    );

    expect(res).toEqual({ body: { item: { id: 'host1' } } });
  });

  it('should return ok on put in stateful if host url is different from default', async () => {
    jest
      .spyOn(appContextService, 'getCloud')
      .mockReturnValue({ isServerlessEnabled: false } as any);

    const res = await putFleetServerHostHandlerWithErrorHandler(
      mockContext,
      { body: { host_urls: ['http://localhost:8080'] }, params: { outputId: 'host1' } } as any,
      mockResponse as any
    );

    expect(res).toEqual({ body: { item: { id: 'host1' } } });
  });

  describe('private endpoint (PrivateLink) validation', () => {
    const PRIVATE_URL = 'https://abc.fleet.private.us-east-1.aws.elastic.cloud';

    it('should return ok on put in serverless when host url matches the private endpoint SO', async () => {
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true } as any);
      jest.spyOn(fleetServerHostService, 'get').mockImplementation((id: string) => {
        if (id === SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID) {
          return Promise.resolve({
            id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
            host_urls: [PRIVATE_URL],
          } as any);
        }
        return Promise.resolve({
          id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
          host_urls: ['http://elasticsearch:9200'],
        } as any);
      });

      const res = await putFleetServerHostHandlerWithErrorHandler(
        mockContext,
        { body: { host_urls: [PRIVATE_URL] }, params: { outputId: 'host1' } } as any,
        mockResponse as any
      );

      expect(res).toEqual({ body: { item: { id: 'host1' } } });
    });

    it('should return 403 on put in serverless when host url is arbitrary (not default or private)', async () => {
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true } as any);
      jest.spyOn(fleetServerHostService, 'get').mockImplementation((id: string) => {
        if (id === SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID) {
          return Promise.resolve({
            id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
            host_urls: [PRIVATE_URL],
          } as any);
        }
        return Promise.resolve({
          id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
          host_urls: ['http://elasticsearch:9200'],
        } as any);
      });

      const res = await putFleetServerHostHandlerWithErrorHandler(
        mockContext,
        {
          body: { host_urls: ['https://arbitrary.host.com'] },
          params: { outputId: 'host1' },
        } as any,
        mockResponse as any
      );

      expect(res).toEqual({
        body: {
          message:
            'Fleet server host must have default URL in serverless: http://elasticsearch:9200',
        },
        statusCode: 403,
      });
    });

    it('should return 403 on put in serverless when private SO is absent and url is not the default', async () => {
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true } as any);
      jest.spyOn(fleetServerHostService, 'get').mockImplementation((id: string) => {
        if (id === SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID) {
          return Promise.reject(new Error('Not found'));
        }
        return Promise.resolve({
          id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
          host_urls: ['http://elasticsearch:9200'],
        } as any);
      });

      const res = await putFleetServerHostHandlerWithErrorHandler(
        mockContext,
        { body: { host_urls: [PRIVATE_URL] }, params: { outputId: 'host1' } } as any,
        mockResponse as any
      );

      expect(res).toEqual({
        body: {
          message:
            'Fleet server host must have default URL in serverless: http://elasticsearch:9200',
        },
        statusCode: 403,
      });
    });
  });

  it('should call bumpAllAgentPoliciesForFleetServerHosts with isDefault flag on put', async () => {
    jest
      .spyOn(appContextService, 'getCloud')
      .mockReturnValue({ isServerlessEnabled: false } as any);
    jest.spyOn(fleetServerHostService, 'update').mockResolvedValue({
      id: 'host1',
      is_default: true,
    } as any);

    await putFleetServerHostHandlerWithErrorHandler(
      mockContext,
      { body: { host_urls: ['http://localhost:8080'] }, params: { itemId: 'host1' } } as any,
      mockResponse as any
    );

    expect(agentPolicyService.bumpAllAgentPoliciesForFleetServerHosts).toHaveBeenLastCalledWith(
      undefined,
      'host1',
      { isDefault: true }
    );
  });

  it('should call bumpAllAgentPoliciesForFleetServerHosts with isDefault flag on post', async () => {
    jest
      .spyOn(appContextService, 'getCloud')
      .mockReturnValue({ isServerlessEnabled: false } as any);
    jest.spyOn(fleetServerHostService, 'create').mockResolvedValue({
      id: 'host1',
      is_default: false,
    } as any);

    await postFleetServerHostWithErrorHandler(
      mockContext,
      { body: { host_urls: ['http://localhost:8080'] } } as any,
      mockResponse as any
    );

    expect(agentPolicyService.bumpAllAgentPoliciesForFleetServerHosts).toHaveBeenLastCalledWith(
      undefined,
      'host1',
      { isDefault: false }
    );
  });
});
