/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import type { PluginsServiceSetup, PluginsServiceStart } from '@kbn/core-plugins-contracts-server';
import type { PluginsService } from '@kbn/core-plugins-server-internal';
import {
  type InternalPluginsServiceSetup,
  type InternalPluginsServiceStart,
} from '@kbn/core-plugins-server-internal';
import { lazyObject } from '@kbn/lazy-object';

type PluginsServiceMock = jest.Mocked<PublicMethodsOf<PluginsService>>;

const createInternalSetupContractMock = (): InternalPluginsServiceSetup =>
  lazyObject({
    contracts: new Map(),
    initialized: true,
  });
const createInternalStartContractMock = (): InternalPluginsServiceStart =>
  lazyObject({
    contracts: new Map(),
  });

const createServiceMock = (): PluginsServiceMock =>
  lazyObject({
    discover: jest.fn(),
    getExposedPluginConfigsToUsage: jest.fn(),
    loadPluginContractForRoute: jest.fn(),
    preboot: jest.fn(),
    setup: jest.fn().mockResolvedValue(createInternalSetupContractMock()),
    start: jest.fn().mockResolvedValue(createInternalStartContractMock()),
    stop: jest.fn(),
  });

const createLazyInitMock = () =>
  lazyObject({
    trigger: jest.fn(),
    getStatus: jest.fn(),
    status$: jest.fn(),
    onLazyStartService: jest.fn(),
  });

const createSetupContractMock = () => {
  const contract: jest.Mocked<PluginsServiceSetup> = lazyObject({
    onSetup: jest.fn(),
    onStart: jest.fn(),
    loadPluginContract: jest.fn(),
    lazyInit: createLazyInitMock(),
  });

  return contract;
};

const createStartContractMock = () => {
  const contract: jest.Mocked<PluginsServiceStart> = lazyObject({
    onStart: jest.fn(),
    loadPluginContract: jest.fn(),
    lazyInit: createLazyInitMock(),
  });
  return contract;
};

function createUiPlugins() {
  return lazyObject({
    browserConfigs: new Map(),
    internal: new Map(),
    public: new Map(),
  });
}

export const pluginServiceMock = {
  create: createServiceMock,
  createSetupContract: createSetupContractMock,
  createStartContract: createStartContractMock,
  createInternalSetupContract: createInternalSetupContractMock,
  createInternalStartContract: createInternalStartContractMock,
  createUiPlugins,
};
