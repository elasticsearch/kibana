/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRuntimePluginContractResolver } from '../plugin_contract_resolver';

export const createRuntimePluginContractResolverMock =
  (): jest.Mocked<IRuntimePluginContractResolver> => {
    return {
      setDependencyMap: jest.fn(),
      setDeferredInitEngine: jest.fn(),
      setLazyPluginNames: jest.fn(),
      onSetup: jest.fn(),
      onStart: jest.fn(),
      notifyStartContractAvailable: jest.fn(),
      loadPluginContract: jest.fn(),
      trigger: jest.fn(),
      getLazyInitStatus: jest.fn(),
      lazyInitStatus$: jest.fn(),
      onLazyStartService: jest.fn(),
      resolveSetupRequests: jest.fn(),
      resolveStartRequests: jest.fn(),
    };
  };
