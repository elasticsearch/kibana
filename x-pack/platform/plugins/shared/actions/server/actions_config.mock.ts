/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DEFAULT_MICROSOFT_EXCHANGE_URL,
  DEFAULT_MICROSOFT_GRAPH_API_SCOPE,
  DEFAULT_MICROSOFT_GRAPH_API_URL,
  DEFAULT_EMAIL_BODY_LENGTH,
} from '../common';
import type { ActionsConfigurationUtilities } from './actions_config';

const createActionsConfigMock = () => {
  const mocked: jest.Mocked<ActionsConfigurationUtilities> = {
    isHostnameAllowed: jest.fn().mockReturnValue(true),
    isUriAllowed: jest.fn().mockReturnValue(true),
    isActionTypeEnabled: jest.fn().mockReturnValue(true),
    ensureHostnameAllowed: jest.fn().mockReturnValue({}),
    ensureUriAllowed: jest.fn().mockReturnValue({}),
    ensureActionTypeEnabled: jest.fn().mockReturnValue({}),
    getSSLSettings: jest.fn().mockReturnValue({
      verificationMode: 'full',
    }),
    getEARSSSLSettings: jest.fn().mockReturnValue({
      verificationMode: 'full',
    }),
    getProxySettings: jest.fn().mockReturnValue(undefined),
    getResponseSettings: jest.fn().mockReturnValue({
      maxContentLength: 1000000,
      timeout: 360000,
    }),
    getCustomHostSettings: jest.fn().mockReturnValue(undefined),
    getMicrosoftGraphApiUrl: jest.fn().mockReturnValue(DEFAULT_MICROSOFT_GRAPH_API_URL),
    getMicrosoftGraphApiScope: jest.fn().mockReturnValue(DEFAULT_MICROSOFT_GRAPH_API_SCOPE),
    getMicrosoftExchangeUrl: jest.fn().mockReturnValue(DEFAULT_MICROSOFT_EXCHANGE_URL),
    validateEmailAddresses: jest.fn().mockReturnValue(undefined),
    getMaxAttempts: jest.fn().mockReturnValue(3),
    enableFooterInEmail: jest.fn().mockReturnValue(true),
    getMaxQueued: jest.fn().mockReturnValue(1000),
    getWebhookSettings: jest.fn().mockReturnValue({
      ssl: {
        pfx: {
          enabled: true,
        },
      },
    }),
    getAwsSesConfig: jest.fn().mockReturnValue(null),
    getEnabledEmailServices: jest.fn().mockReturnValue(['*']),
    getMaxEmailBodyLength: jest.fn().mockReturnValue(DEFAULT_EMAIL_BODY_LENGTH),
    getEarsUrl: jest.fn().mockReturnValue(undefined),
    isEarsEnabled: jest.fn().mockReturnValue(false),
    isEarsExperimentalEnabled: jest.fn().mockReturnValue(false),
  };
  return mocked;
};

export const actionsConfigMock = {
  create: createActionsConfigMock,
};
