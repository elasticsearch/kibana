/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type Container } from 'inversify';
import { KibanaContainerModule } from '@kbn/core-di';
import { capabilitiesServiceMock } from '@kbn/core-capabilities-server-mocks';
import { injectionServiceMock, setup } from '@kbn/core-di-mocks';
import {
  CapabilitiesProvider,
  CapabilitiesResolver,
  CapabilitiesSwitcher,
  CoreSetup,
  CoreStart,
  Request,
} from '@kbn/core-di-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loadCapabilities } from './capabilities';

describe('loadCapabilities', () => {
  let injection: jest.Mocked<ReturnType<typeof injectionServiceMock.createStartContract>>;
  let container: Container;
  let capabilitiesSetup: ReturnType<typeof capabilitiesServiceMock.createSetupContract>;
  let capabilitiesStart: ReturnType<typeof capabilitiesServiceMock.createStartContract>;
  let request: KibanaRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    injection = injectionServiceMock.createStartContract();
    capabilitiesSetup = capabilitiesServiceMock.createSetupContract();
    capabilitiesStart = capabilitiesServiceMock.createStartContract();
    request = httpServerMock.createKibanaRequest();
    container = injection.getContainer();
    container.load(new KibanaContainerModule(loadCapabilities));
    container.bind(CoreSetup('capabilities')).toConstantValue(capabilitiesSetup);
    container.bind(CoreStart('capabilities')).toConstantValue(capabilitiesStart);
    container.bind(Request).toConstantValue(request);
  });

  it('should register capabilities', () => {
    const capabilitiesProvider = () => ({});
    container.bind(CapabilitiesProvider).toConstantValue(capabilitiesProvider);
    setup(container);

    expect(capabilitiesSetup.registerProvider).toHaveBeenCalledWith(capabilitiesProvider);
  });

  it('should register a capabilities switcher', () => {
    const switcher = {
      capabilityPath: 'myPlugin.*',
      switch: () => ({}),
    };
    container.bind(CapabilitiesSwitcher).toConstantValue(switcher);
    setup(container);

    expect(capabilitiesSetup.registerSwitcher).toHaveBeenCalledWith(
      switcher.switch,
      expect.objectContaining({ capabilityPath: 'myPlugin.*' })
    );
  });

  it('should not resolve the capabilities when resolving the resolver', () => {
    container.get(CapabilitiesResolver);

    expect(capabilitiesStart.resolveCapabilities).not.toHaveBeenCalled();
  });

  it('should resolve the capabilities for the current request', async () => {
    const capabilities = { navLinks: {}, management: {}, catalogue: {} };
    capabilitiesStart.resolveCapabilities.mockResolvedValue(capabilities);

    await expect(
      container.get(CapabilitiesResolver)({ capabilityPath: 'myPlugin.*' })
    ).resolves.toBe(capabilities);
    expect(capabilitiesStart.resolveCapabilities).toHaveBeenCalledWith(request, {
      capabilityPath: 'myPlugin.*',
    });
  });

  it('should create the capabilities resolver only once per scope', () => {
    const fork = injection.fork();

    expect(fork.get(CapabilitiesResolver)).toBe(fork.get(CapabilitiesResolver));
  });
});
