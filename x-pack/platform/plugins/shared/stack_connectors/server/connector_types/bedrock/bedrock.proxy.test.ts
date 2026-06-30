/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_URL } from '@kbn/connector-schemas/bedrock';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { actionsConfigMock } from '@kbn/actions-plugin/server/actions_config.mock';
import { BedrockConnector } from './bedrock';
import { loggingSystemMock } from '@kbn/core/server/mocks';

const logger = loggingSystemMock.createLogger();

describe('Bedrock with proxy config', () => {
  const configurationUtilities = actionsConfigMock.create();
  const PROXY_HOST = 'proxy.custom.elastic.co';
  const PROXY_URL_HTTP = `http://${PROXY_HOST}:99`;
  const PROXY_URL_HTTPS = `https://${PROXY_HOST}:99`;

  let connector: BedrockConnector;
  beforeEach(() => {
    jest.clearAllMocks();
    configurationUtilities.getProxySettings.mockReturnValue({
      proxyUrl: PROXY_URL_HTTP,
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    });

    connector = new BedrockConnector({
      configurationUtilities,
      connector: { id: '1', type: '.bedrock' },
      config: {
        apiUrl: DEFAULT_URL,
        defaultModel: 'claude',
      },
      secrets: { accessKey: '123', secret: '567' },
      logger,
      services: actionsMock.createServices(),
    });
  });

  it('verifies that the Bedrock client is initialized with the custom proxy HTTP agent', async () => {
    // @ts-ignore .bedrockClient is private
    const bedrockClient = connector.bedrockClient;

    // Verify the client was initialized with the custom agent configuration
    expect(bedrockClient).toBeDefined();
    expect(bedrockClient.config.requestHandler).toBeDefined();
    // @ts-ignore configProvider is private, but we need it to access the agent
    const config = await bedrockClient.config.requestHandler.configProvider;
    // Since DEFAULT_BEDROCK_URL is https, httpsAgent will be set, see: https://github.com/elastic/kibana/pull/224130#discussion_r2152632806
    expect(config.httpsAgent.proxy.host).toBe(`${PROXY_HOST}:99`);
    expect(config.httpsAgent.proxy.hostname).toBe(PROXY_HOST);
    expect(config.httpsAgent.proxy.port).toBe('99');
    expect(config.httpAgent.proxy).toBeUndefined();
  });

  it('verifies that the Bedrock client is initialized with the custom proxy HTTPS agent', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxyUrl: PROXY_URL_HTTPS,
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    });

    connector = new BedrockConnector({
      configurationUtilities,
      connector: { id: '1', type: '.bedrock' },
      config: {
        apiUrl: DEFAULT_URL,
        defaultModel: 'claude',
      },
      secrets: { accessKey: '123', secret: '567' },
      logger,
      services: actionsMock.createServices(),
    });
    // @ts-ignore .bedrockClient is private
    const bedrockClient = connector.bedrockClient;

    // Verify the client was initialized with the custom agent configuration
    expect(bedrockClient).toBeDefined();
    expect(bedrockClient.config.requestHandler).toBeDefined();
    // @ts-ignore configProvider is private, but we need it to access the agent
    const config = await bedrockClient.config.requestHandler.configProvider;
    expect(config.httpsAgent.proxy.host).toBe(`${PROXY_HOST}:99`);
    expect(config.httpsAgent.proxy.hostname).toBe(PROXY_HOST);
    expect(config.httpsAgent.proxy.port).toBe('99');
    expect(config.httpAgent.proxy).not.toBeDefined();
  });
});
