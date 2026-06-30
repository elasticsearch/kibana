/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createEsqlDataSource } from '../../../common/data_sources';
import {
  FEATURE_ID_1,
  FEATURE_ID_2,
  createContextAwarenessMocks,
  createProfileProviderSharedServicesMock,
} from '../__mocks__';
import { createInMemoryContextAwarenessToolkit } from '../in_memory_toolkit';
import { ProfileStateRegistry } from '../profile_state';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../toolkit';
import { createExampleRootProfileProvider } from './example/example_root_profile';
import { EXAMPLE_PROFILE_STATE_DEF } from './example/profile_state';
import { registerEnabledProfileProviders } from './register_enabled_profile_providers';
import type { CellRenderersExtensionParams } from '../types';

const exampleRootProfileProvider = createExampleRootProfileProvider();

const createExampleProfileToolkit = () => {
  const profileStateRegistry = new ProfileStateRegistry();
  profileStateRegistry.registerDefinition(EXAMPLE_PROFILE_STATE_DEF);

  return createInMemoryContextAwarenessToolkit({ profileStateRegistry });
};

describe('registerEnabledProfileProviders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register all profile providers', async () => {
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, rootProfileProviderMock } = createContextAwarenessMocks({
      shouldRegisterProviders: false,
    });

    registerEnabledProfileProviders({
      profileService: rootProfileServiceMock,
      providers: [rootProfileProviderMock],
      enabledExperimentalProfileIds: [],
      services: profileProviderServices,
    });
    const context = await rootProfileServiceMock.resolve({ solutionNavId: null });
    const profile = rootProfileServiceMock.getProfile({
      context,
      toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    });
    const baseImpl = () => ({});
    profile.getCellRenderers?.(baseImpl)({} as unknown as CellRenderersExtensionParams);
    expect(rootProfileProviderMock.profile.getCellRenderers).toHaveBeenCalledTimes(1);
    expect(rootProfileProviderMock.profile.getCellRenderers).toHaveBeenCalledWith(baseImpl, {
      context,
      toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    });
  });

  it('should not register experimental profile providers by default', async () => {
    jest.spyOn(exampleRootProfileProvider.profile, 'getCellRenderers');
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock } = createContextAwarenessMocks({
      shouldRegisterProviders: false,
    });
    registerEnabledProfileProviders({
      profileService: rootProfileServiceMock,
      providers: [exampleRootProfileProvider],
      enabledExperimentalProfileIds: [],
      services: profileProviderServices,
    });
    const context = await rootProfileServiceMock.resolve({ solutionNavId: null });
    const profile = rootProfileServiceMock.getProfile({
      context,
      toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    });
    const baseImpl = () => ({});
    profile.getCellRenderers?.(baseImpl)({} as unknown as CellRenderersExtensionParams);
    expect(exampleRootProfileProvider.profile.getCellRenderers).not.toHaveBeenCalled();
    expect(profile).toMatchObject({});
  });

  it('should register experimental profile providers when enabled by config', async () => {
    jest.spyOn(exampleRootProfileProvider.profile, 'getCellRenderers');
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, rootProfileProviderMock } = createContextAwarenessMocks({
      shouldRegisterProviders: false,
    });
    registerEnabledProfileProviders({
      profileService: rootProfileServiceMock,
      providers: [exampleRootProfileProvider],
      enabledExperimentalProfileIds: [exampleRootProfileProvider.profileId],
      services: profileProviderServices,
    });
    const context = await rootProfileServiceMock.resolve({ solutionNavId: null });
    const toolkit = createExampleProfileToolkit();
    const profile = rootProfileServiceMock.getProfile({
      context,
      toolkit,
    });
    const baseImpl = () => ({});
    profile.getCellRenderers?.(baseImpl)({} as unknown as CellRenderersExtensionParams);
    expect(exampleRootProfileProvider.profile.getCellRenderers).toHaveBeenCalledTimes(1);
    expect(exampleRootProfileProvider.profile.getCellRenderers).toHaveBeenCalledWith(baseImpl, {
      context,
      toolkit,
    });
    expect(rootProfileProviderMock.profile.getCellRenderers).not.toHaveBeenCalled();
  });

  it('should register restricted profile when product feature is available', async () => {
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, dataSourceProfileServiceMock, dataSourceProfileProviderMock } =
      createContextAwarenessMocks({
        shouldRegisterProviders: false,
      });

    // Mock feature availability
    jest
      .spyOn(profileProviderServices.core.pricing, 'isFeatureAvailable')
      .mockImplementation((featureId) => {
        if (featureId === FEATURE_ID_1) {
          return true;
        }
        return false;
      });

    // Sanity check
    expect(profileProviderServices.core.pricing.isFeatureAvailable(FEATURE_ID_1)).toBeTruthy();

    registerEnabledProfileProviders({
      profileService: dataSourceProfileServiceMock,
      providers: [dataSourceProfileProviderMock],
      enabledExperimentalProfileIds: [],
      services: profileProviderServices,
    });
    const rootContext = await rootProfileServiceMock.resolve({ solutionNavId: null });
    const dataSourceContext = await dataSourceProfileServiceMock.resolve({
      rootContext,
      dataSource: createEsqlDataSource(),
      query: { esql: 'from my-example-logs' },
    });

    const profile = dataSourceProfileServiceMock.getProfile({
      context: dataSourceContext,
      toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    });
    const baseImpl = () => ({});
    profile.getCellRenderers?.(baseImpl)({} as unknown as CellRenderersExtensionParams);
    expect(dataSourceProfileProviderMock.profile.getCellRenderers).toHaveBeenCalledTimes(1);
    expect(dataSourceProfileProviderMock.profile.getCellRenderers).toHaveBeenCalledWith(baseImpl, {
      context: dataSourceContext,
      toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    });
  });

  it('should not register restricted profile when product feature is not available', async () => {
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, dataSourceProfileServiceMock, dataSourceProfileProviderMock } =
      createContextAwarenessMocks({
        shouldRegisterProviders: false,
      });

    // Mock feature availability
    jest
      .spyOn(profileProviderServices.core.pricing, 'isFeatureAvailable')
      .mockImplementation((featureId) => {
        if (featureId === FEATURE_ID_2) {
          return true;
        }
        return false;
      });

    // Sanity check
    expect(profileProviderServices.core.pricing.isFeatureAvailable(FEATURE_ID_1)).not.toBeTruthy();

    registerEnabledProfileProviders({
      profileService: dataSourceProfileServiceMock,
      providers: [dataSourceProfileProviderMock],
      enabledExperimentalProfileIds: [],
      services: profileProviderServices,
    });
    const rootContext = await rootProfileServiceMock.resolve({ solutionNavId: null });
    const dataSourceContext = await dataSourceProfileServiceMock.resolve({
      rootContext,
      dataSource: createEsqlDataSource(),
      query: { esql: 'from my-example-logs' },
    });

    const profile = dataSourceProfileServiceMock.getProfile({
      context: dataSourceContext,
      toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    });
    const baseImpl = () => ({});
    profile.getCellRenderers?.(baseImpl)({} as unknown as CellRenderersExtensionParams);
    expect(dataSourceProfileProviderMock.profile.getCellRenderers).not.toHaveBeenCalled();
    expect(profile).toMatchObject({});
  });
});
